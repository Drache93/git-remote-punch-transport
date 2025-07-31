const { execSync, spawn } = require('child_process')
const { isLocalRef } = require('./helpers')
const Corestore = require('corestore')
const Hyperblobs = require('hyperblobs')
const Hyperbee = require('hyperbee')
const ReadyResource = require('ready-resource')

class PunchGit extends ReadyResource {
  _verbosity = 1
  _progress = false
  _pendingPushes = new Set()
  _core = null
  _blobs = null
  _bee = null

  constructor (path) {
    super()

    this._path = path
    this._store = new Corestore(path)
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

  async listForPush () {
    this._verbose('Listing for push')

    this._debug('Bee: ' + this._bee)

    const refs = execSync('git show-ref').toString().trim()
    refs.split('\n').forEach(ref => {
      const oid = ref.split(' ')[0]
      const name = ref.split(' ')[1]

      this._debug('Ref: ' + name + ' ' + oid)

      if (name.startsWith('refs/remote')) {
        const branchName = name.split('/').pop()
        const branch = refs.split('\n').find(e => isLocalRef(e, branchName))

        this._debug(`Branch: ${branchName} ${branch}`)

        if (!branch) {
          return
        }

        const value = branchName === 'HEAD' ? `${oid} HEAD` : `${oid} ${branch.split(' ')[1]}`

        if (this._pendingPushes.has(value)) {
          this._debug(`Already in pending: ${value}`)
          return
        }

        this._debug(`Add to pending: ${value}`)
        process.stdout.write(`${value}\n`)

        this._pendingPushes.add(value)
      }
    })

    process.stdout.write('\n')
  }

  async addPushRefs (refs) {
    for (const ref of refs) {
      this._pendingPushes.add(ref)
    }
  }

  async fetch (refs) {
    // TODO: fetch the refs
    for (const ref of refs) {
      this._debug(`Fetch: ${ref}`)
    }
  }

  async list () {
    const refStream = await this._refs.createReadStream()

    const refs = []

    for await (const ref of refStream) {
      this._debug(`Ref: ${ref.key}`)
      refs.push(ref.key)
    }

    refs.forEach(ref => process.stdout.write(ref + '\n'))
    process.stdout.write('\n')

    return refs
  }

  async push () {
    this._verbose(`Pushing refs: ${this._pendingPushes.size}`)

    for (const ref of this._pendingPushes) {
      this._debug(`Get files: ${ref}`)

      const data = await this._getRefData(ref)

      this._debug(`Data: ${data.size}`)

      for (const [key, value] of data) {
        const id = await this._blobs.put(value.content)

        await this._objects.put(key, id)

        this._verbose(`Saved: ${key} Value: ${id.byteOffset}`)
      }

      // TODO: confirm this fits usage
      await this._refs.put(ref, [...data.keys()])

      // ? or should we have lookup oid <> name and oid <> data?
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
