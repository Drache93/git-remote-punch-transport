const { execSync, spawn, exec } = require('child_process')
const { isLocalRef } = require('./helpers')
const Corestore = require('corestore')
const Hyperblobs = require('hyperblobs')
const Hyperbee = require('hyperbee')
const ReadyResource = require('ready-resource')
const { homedir, tmpdir } = require('os')
const { join, dirname } = require('path')
const { existsSync, mkdirSync } = require('fs')
const { rebuildRepo } = require('./rebuild')

class Ref {
  constructor (ref, oid) {
    this._ref = ref
    this._oid = oid
  }

  static fromValue (value) {
    const [oid, ref] = value.split(' ')
    return new Ref(ref, oid)
  }

  replaceRef (ref) {
    this._ref = ref
  }

  get ref () {
    return this._ref
  }

  get oid () {
    return this._oid
  }

  get value () {
    return `${this._oid} ${this._ref}`
  }

  get remoteValue () {
    return `${this._oid} ${this._ref.replace('refs/heads/', 'refs/remotes/')}`
  }

  toString () {
    return this.value
  }
}

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

  _writeLog (message) {
    process.stderr.write(message + '\n')
  }

  _info (message) {
    this._writeLog('Punch [INFO]: ' + message)
  }

  _debug (message) {
    // we receive as a string, parsing is just room for error
    // eslint-disable-next-line eqeqeq
    if (this._verbosity >= 2) {
      this._writeLog('Punch [DEBUG]: ' + message)
    }
  }

  _verbose (message) {
    if (this._verbosity >= 3) {
      this._writeLog('Punch [VERBOSE]: ' + message)
    }
  }

  _echo (message) {
    if (this._verbosity >= 3) {
      this._writeLog('Punch [ECHO]: ' + message)
    }
  }

  _output (message, newline = true) {
    process.stdout.write(message + (newline ? '\n' : ''))
    this._echo(message)
  }

  hasPendingFetch () {
    return this._pendingFetches.size > 0
  }

  async listForPush () {
    this._verbose('Listing for push')

    const refs = execSync('git show-ref').toString().trim()
    for (const ref of refs.split('\n')) {
      const [oid, name] = ref.split(' ')

      this._debug(`Ref: ${name} ${oid}`)

      if (name.startsWith('refs/remotes/' + this._remote)) {
        const branchName = name.split('/').pop()
        const branch = refs.split('\n').find(e => isLocalRef(e, branchName))

        if (!branch) {
          return
        }

        const ref = Ref.fromValue(branchName === 'HEAD' ? `${oid} HEAD` : branch)

        // Check if we already have it
        const existingRef = await this._refs.get(ref.value)

        this._output(ref.value)

        if (existingRef) {
          this._debug(`Ref already exists, skipping: ${ref.value}`)
          continue
        }

        this._debug(`Add to pending: ${ref.value}`)
        this._pendingPushes.add(ref)
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

  prepareFetch (ref) {
    // ? is this <remote-ref> <local-ref>? Can local part change and we won't find it?
    this._debug(`Prepare fetch: ${ref}`)

    const r = Ref.fromValue(ref)

    if (this._loadedRefs.has(r.value)) {
      this._debug(`Loaded ref: ${r.value}`)

      this._debug(`Add to pending: ${r.value}`)

      this._pendingFetches.add(r)
    }
  }

  async fetch () {
    this._debug(`Fetch: ${this._pendingFetches.size}`)

    if (!this._cloning) {
      // TODO
      this._output('ok')
      return
    }

    for (const ref of this._pendingFetches) {
      // Skip this and let the main ref be fetched
      if (ref.ref === 'HEAD') {
        this._pendingFetches.delete(ref)
        continue
      }

      const objects = []
      this._debug(`Fetch: ${ref.value}`)

      const { value } = await this._refs.get(ref.value)

      for (const sha of value) {
        this._debug(`Object: ${sha}`)
        const { value: objectDetails } = await this._objects.get(sha)
        this._verbose(`Object: ${sha} ${objectDetails.type} ${objectDetails.size}`)

        const blob = await this._blobs.get(objectDetails.id)

        objects.push({
          id: sha,
          size: objectDetails.size,
          type: objectDetails.type,
          data: blob
        })
      }

      const tmp = join(tmpdir(), 'punch', this._repo, ref.oid)
      mkdirSync(tmp, { recursive: true })

      rebuildRepo({
        repoPath: tmp,
        objectFormat: 'sha1', // or 'sha256' — MUST match your object ids
        objects,
        refs: {
          [ref.ref]: ref.oid
        }
      })

      const packFiles = join(tmp, 'objects', 'pack', 'pack-*.pack')
      const unpack = exec(`cat ${packFiles} | git unpack-objects`, { cwd: dirname(process.env.GIT_DIR) })
      unpack.stdout.on('data', (data) => {
        this._debug(`Unpacked data: ${data}`)
      })
      unpack.stderr.on('data', (data) => {
        this._debug(`Unpacked error: ${data}`)
      })
      const unpackResult = await new Promise((resolve, reject) => {
        unpack.once('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Git command failed with code ${code}`))
            return
          }
          resolve(code)
        })
      })
      this._debug(`Unpacked result: ${unpackResult}`)

      this._debug(`Done: ${ref.value}`)
      this._pendingFetches.delete(ref)
    }

    this._output('')
  }

  _sendPacket (data) {
    // Calculate packet length: data length + 4 bytes for the length prefix
    const length = data.length + 4
    // Convert length to 4-byte hexadecimal (e.g., '0010' for length 16)
    const lengthHex = length.toString(16).padStart(4, '0')

    // Write length prefix and data to stdout
    process.stdout.write(Buffer.from(lengthHex, 'ascii'))
    process.stdout.write(data)
  }

  _sendFlush () {
    // Write flush packet
    process.stdout.write(Buffer.from('0000', 'ascii'))
  }

  /**
   * List and store refs for later use by fetch
   */
  async listAndStoreRefs () {
    const refs = await this.list()

    this._debug(`[listAndStoreRefs] Refs: ${refs}`)

    for (const ref of refs) {
      this._loadedRefs.add(ref.value)
    }
  }

  async _allRefs () {
    const refStream = await this._refs.createHistoryStream()

    const refs = new Map()
    let mostRecentMain = null

    for await (const ref of refStream) {
      const r = Ref.fromValue(ref.key)
      this._debug(`[_allRefs] Ref ${r.ref} ${r.oid}`)

      // Get the most recent value for each ref
      refs.set(r.ref, r)

      if (r.ref === 'refs/heads/main') {
        mostRecentMain = r.oid
      }
    }

    if (mostRecentMain) {
      refs.set('HEAD', new Ref('HEAD', mostRecentMain))
    }

    return Array.from(refs.values()).reverse()
  }

  async list () {
    this._debug('Listing refs')

    const refs = await this._allRefs()

    this._debug(`[list] Refs: ${refs}`)

    refs.forEach(ref => this._output(ref))
    this._output('')

    return refs
  }

  async push () {
    this._verbose(`Pushing refs: ${this._pendingPushes.size}`)

    if (this._pendingPushes.size === 0) {
      // TODO: check why we get `push refs/heads/main:refs/heads/main` sometimes
      // This hangs as we don't have a matching ref as they already exist
      return
    }

    for (const ref of this._pendingPushes) {
      this._debug(`Get files: ${ref.value}`)
      const localRef = ref.ref
      const remoteRef = this._pushRemoteRefs.get(localRef)
      const pushedRef = remoteRef ? new Ref(remoteRef, ref.oid) : ref

      try {
        const data = await this._getRefData(ref)

        this._debug(`Data: ${data.size}`)

        for (const [key, value] of data) {
          const id = await this._blobs.put(value.content)

          await this._objects.put(key, {
            id,
            type: value.type,
            size: value.size
          })

          this._verbose(`Saved: ${key} Value: ${id.byteOffset}`)
        }

        // TODO: confirm this fits usage

        this._debug(`Pushed with ref: ${pushedRef.value}`)
        await this._refs.put(pushedRef.value, [...data.keys()])

        // ? or should we have lookup oid <> name and oid <> data?
        // ? output ok - stdout is closed at this point
        // this._output('ok ' + (remoteRef || localRef))
      } catch (e) {
        this._debug(`Push error: ${e.message}`)
        this._output(`error ${pushedRef.value} ${e.message}`)
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
        this._debug(`Get ref data: ${ref.value}`)
        const child = spawn('sh', ['-c', `git rev-list --objects ${ref.value} | cut -d' ' -f1 | git cat-file --batch`])

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
