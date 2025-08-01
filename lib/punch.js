const { execSync, spawn } = require('child_process')
const { isLocalRef } = require('./helpers')
const Corestore = require('corestore')
const Hyperblobs = require('hyperblobs')
const Hyperbee = require('hyperbee')
const ReadyResource = require('ready-resource')
const { homedir } = require('os')
const { join } = require('path')
const { existsSync, mkdirSync } = require('fs')

class PunchGit extends ReadyResource {
  _verbosity = 1
  _progress = false
  _pendingPushes = new Set()
  _pushRemoteRefs = new Map()
  _pendingFetches = new Set()
  _loadedRefs = new Set()
  _core = null
  _blobs = null
  _bee = null

  constructor (args = {}) {
    super()

    this._remote = args.remote
    this._url = args.url

    this._repo = this._url.replace('punch://', '')

    // Get the git repo name
    const punchDir = `${homedir()}/.punch`
    const storagePath = join(punchDir, this._repo)

    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true })
    }

    this._path = storagePath
    this._store = new Corestore(storagePath)
    this._blobs = new Hyperblobs(this._store.get({ name: 'blobs' }))
    this._objects = new Hyperbee(this._store.get({ name: 'objects' }), {
      keyEncoding: 'json',
      valueEncoding: 'json'
    })
    this._refs = new Hyperbee(this._store.get({ name: 'refs' }), {
      keyEncoding: 'json',
      valueEncoding: 'json'
    })
  }

  async _open () {
    await this._blobs.ready()
    await this._objects.ready()
    await this._refs.ready()
  }

  async _close () {
    await this._blobs.close()
    await this._objects.close()
    await this._refs.close()
    await this._store.close()
  }

  setProgress (progress) {
    this._progress = progress || false
  }

  setVerbosity (verbosity) {
    this._verbosity = verbosity
  }

  setCloning (cloning) {
    this._cloning = cloning || false
  }

  _info (message) {
    process.stderr.write('Punch [INFO]: ' + message + '\n')
  }

  _debug (message) {
    // we receive as a string, parsing is just room for error
    // eslint-disable-next-line eqeqeq
    if (this._verbosity >= 2) {
      process.stderr.write('Punch [DEBUG]: ' + message + '\n')
    }
  }

  _verbose (message) {
    if (this._verbosity >= 3) {
      process.stderr.write('Punch [VERBOSE]: ' + message + '\n')
    }
  }

  _echo (message) {
    if (this._verbosity >= 3) {
      process.stderr.write('Punch [ECHO]: ' + message + '\n')
    }
  }

  _output (message, newline = true) {
    process.stdout.write(message + (newline ? '\n' : ''))
    this._echo(message)
  }

  async hasPendingFetch () {
    return this._pendingFetches.size > 0
  }

  async listForPush () {
    this._verbose('Listing for push')

    const refs = execSync('git show-ref').toString().trim()
    for (const ref of refs.split('\n')) {
      const oid = ref.split(' ')[0]
      const name = ref.split(' ')[1]

      this._debug('Ref: ' + name + ' ' + oid)

      if (name.startsWith('refs/remotes/' + this._remote)) {
        const branchName = name.split('/').pop()
        const branch = refs.split('\n').find(e => isLocalRef(e, branchName))

        this._debug(`Branch: ${branchName} ${branch}`)

        if (!branch) {
          return
        }

        const value = branchName === 'HEAD' ? `${oid} HEAD` : `${oid} ${branch.split(' ')[1]}`

        // Check if we already have it
        const existingRef = await this._refs.get(value)

        this._output(value)

        if (existingRef) {
          this._debug(`Ref already exists, skippng: ${value}`)
          continue
        }

        this._debug(`Add to pending: ${value}`)
        this._pendingPushes.add(value)
      }
    }

    this._output('')
  }

  addPushRefs (refs) {
    // TODO: handle arg, e.g. refs/heads/main:refs/heads/main
    this._debug(`Add push refs: ${refs}`)

    const [local, remote] = refs.split(':')
    this._pushRemoteRefs.set(local, remote)
  }

  async prepareFetch (refs) {
    this._debug(`Prepare fetch: ${refs}`)

    // wantedRefs.push(remoteRefs.find(ref => ref.name === line.split(' ')[2]))
    for (const ref of this._loadedRefs) {
      this._debug(`Loaded ref: ${ref}`)

      if (refs.includes(ref)) {
        this._debug(`Add to pending: ${ref}`)
        this._pendingFetches.add(ref)
      }
    }
  }

  async fetch () {
    this._debug(`Fetch: ${this._pendingFetches.size}`)

    for (const ref of this._pendingFetches) {
      this._debug(`Fetch: ${ref}`)

      // TODO: output blobs
    }
  }

  /**
   * List and store refs for later use by fetch
   */
  async listAndStoreRefs () {
    const refs = await this.list()

    this._loadedRefs.add(...refs)
  }

  async _allRefs () {
    const refStream = await this._refs.createHistoryStream()

    const refs = []

    for await (const ref of refStream) {
      this._debug(`Ref: ${ref.key}`)
      refs.push(ref.key)
    }

    return refs
  }

  async list () {
    this._debug('Listing refs')

    const refs = await this._allRefs()

    refs.forEach(ref => this._output(ref))
    this._output('')

    return refs
  }

  async push () {
    this._verbose(`Pushing refs: ${this._pendingPushes.size}`)

    if (this._pendingPushes.size === 0) {
      return
    }

    for (const ref of this._pendingPushes) {
      this._debug(`Get files: ${ref}`)
      const localRef = ref.split(' ')[1]
      const remoteRef = this._pushRemoteRefs.get(localRef)
      const pushedRef = remoteRef ? ref.replace(localRef, remoteRef) : ref

      try {
        const data = await this._getRefData(ref)

        this._debug(`Data: ${data.size}`)

        for (const [key, value] of data) {
          const id = await this._blobs.put(value.content)

          await this._objects.put(key, id)

          this._verbose(`Saved: ${key} Value: ${id.byteOffset}`)
        }

        // TODO: confirm this fits usage

        this._debug(`Pushed with ref: ${pushedRef}`)
        await this._refs.put(pushedRef, [...data.keys()])

        // ? or should we have lookup oid <> name and oid <> data?
        // ? output ok - stdout is closed at this point
        // this._output('ok ' + (remoteRef || localRef))
      } catch (e) {
        this._debug(`Push error: ${e.message}`)
        this._output(`error ${pushedRef} ${e.message}`)
      }
    }
  }

  /**
   * Get the data for a ref
   *
   * @param {string} ref
   * @returns Map<string, {sha1: string, type: string, size: number, content: Buffer}>
   */
  async _getRefData (ref) {
    return new Promise((resolve, reject) => {
      const objects = new Map()

      try {
        const child = spawn('sh', ['-c', `git rev-list --objects ${ref} | cut -d' ' -f1 | git cat-file --batch`])

        let output = Buffer.alloc(0)

        child.stdout.on('data', (data) => {
          output = Buffer.concat([output, data])
        })

        child.stderr.on('data', (data) => {
          this._debug(`Git stderr: ${data}`)
        })

        child.on('close', (code) => {
          if (code !== 0) {
            this._debug(`Git command exited with code ${code}`)
            reject(new Error(`Git command failed with code ${code}`))
            return
          }

          this._debug(`Output length: ${output.length}`)

          // Parse the output: <sha1> <type> <size>\n<raw object contents>
          let i = 0

          while (i < output.length) {
            // Find the next newline to get the header
            const newlineIndex = output.indexOf(10, i) // 10 is newline in ASCII
            if (newlineIndex === -1) break

            const headerLine = output.slice(i, newlineIndex).toString('utf8')
            const header = this._parseHeader(headerLine)

            if (!header) {
              // Skip to next potential header
              i = newlineIndex + 1
              continue
            }

            // Content starts after the newline
            const contentStart = newlineIndex + 1
            const content = output.slice(contentStart, contentStart + header.size)

            objects.set(header.sha1, {
              sha1: header.sha1,
              type: header.type,
              size: header.size,
              content
            })

            // Move to position after this object's content
            i = contentStart + header.size
          }

          this._debug(`Parsed ${objects.size} objects`)
          resolve(objects)
        })

        child.on('error', (error) => {
          this._debug(`Error: ${error.message}`)
          reject(new Error('Error getting files'))
        })
      } catch (error) {
        this._debug(`Error: ${error.message}`)
        reject(new Error('Error getting files'))
      }
    })
  }

  _parseHeader (line) {
    const match = line.match(/^([0-9a-f]{40}) (\w+) (\d+)$/)
    if (match && match.length === 4) {
      return {
        sha1: match[1],
        type: match[2],
        size: parseInt(match[3], 10)
      }
    }
    return null
  }
}

module.exports = {
  PunchGit
}
