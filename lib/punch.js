const process = require('process')
const sh = require('./bare-sh')
const { isLocalRef } = require('./helpers')
const ReadyResource = require('ready-resource')
const { rebuildRepo } = require('./rebuild')
const { PunchLocalDB } = require('./db')
const { Ref } = require('./ref')
const { ProgressReporter } = require('./progress')

class PunchGit extends ReadyResource {
  _verbosity = 1
  _progress = false
  _followTags = false
  _cloning = false
  _pendingPushes = new Set()
  _pushRemoteRefs = new Map()
  _pendingFetches = new Set()
  _loadedRefs = new Set()
  _local = null
  _key = null
  _name = null
  _bootstrap = null
  _repo = null
  _remoteName = null
  _remoteDb = null
  _progressReporter = null

  constructor (args = {}) {
    super()

    this._remoteName = args.remote
    this._key = args.key
    this._name = args.name
    this._bootstrap = args.bootstrap

    this._repo = this._name
    this._progressReporter = new ProgressReporter()

    this._local = new PunchLocalDB({
      repo: this._repo
    })
  }

  get remote () {
    return this._remoteDb
  }

  async _open () {
    await this._local.ready()

    let remote = await this._local.getRepo(this._repo)

    if (!remote) {
      remote = await this._local.joinRemote(this._repo, this._key)
    }

    if (!remote) {
      throw new Error('Failed to join remote')
    }

    this._remoteDb = remote
  }

  async _close () {
    await this._local.close()
  }

  setProgress (progress) {
    this._debug('Setting progress to ' + progress)
    this._progress = progress || false
  }

  setVerbosity (verbosity) {
    this._debug('Setting verbosity to ' + verbosity)
    this._verbosity = verbosity
  }

  setCloning (cloning) {
    this._debug('Setting cloning to ' + cloning)
    this._cloning = cloning || false
  }

  setFollowTags (followTags) {
    this._debug('Setting followTags to ' + followTags)
    this._followTags = followTags || false
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
    this._verbose('Listing for push to ' + this._remoteName)

    const refs = await sh.exec('git', ['show-ref'])
    const refsList = refs.stdout.toString().trim().split('\n')
    for (const ref of refsList) {
      const [oid, name] = ref.split(' ')

      this._debug(`Ref: ${name} ${oid}`)

      if (name.startsWith('refs/heads/')) {
        const branchName = name.split('/').pop()
        const branch = refsList.find((e) => isLocalRef(e, branchName))

        if (!branch) {
          return
        }

        const ref = Ref.fromValue(
          branchName === 'HEAD' ? `${oid} HEAD` : branch
        )

        // Check if we already have it
        const existingRef = await this._remoteDb.getRef(ref.oid)

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

  /**
   * Used by fetch, pull and clone
   *
   * @returns {Promise<void>}
   */
  async fetch () {
    this._debug(`Fetch: ${this._pendingFetches.size}`)

    let totalObjectCount = 0
    let receivedBytes = 0

    if (this._progress && this._pendingFetches.size > 0) {
      this._progressReporter.startCounting('Receiving objects')
    }

    let objectCount = 0
    for (const ref of this._pendingFetches) {
      // Skip this and let the main ref be fetched
      if (ref.ref === 'HEAD') {
        this._pendingFetches.delete(ref)
        continue
      }

      const objects = []
      this._debug(`Fetch: ${ref.value}`)

      const objectStream = await this._remoteDb.getRefObjects(ref.oid)

      for await (const objectDetails of objectStream) {
        const { oid: sha, type, size } = objectDetails
        this._debug(`Object: ${sha}`)
        this._verbose(`Object: ${sha} ${type} ${size}`)

        this._debug(`Blob: ${JSON.stringify(objectDetails.blobId)}`)
        try {
          const blob = await this._remoteDb.getBlob(objectDetails.blobId)
          this._debug(`Blob loaded: ${blob.byteOffset}`)

          objects.push({
            id: sha,
            size,
            type,
            data: blob
          })

          objectCount++
          receivedBytes += size

          if (this._progress) {
            this._progressReporter.updateCount(objectCount)
          }

          this._debug(`Fetched Object: ${sha} ${type} ${size}`)
        } catch (e) {
          this._debug(`Error: ${e.message}`)
        }
      }

      this._debug(`Objects: ${objects.length}`)
      totalObjectCount += objects.length

      this._debug(`Rebuilding repo: ${this._repo}`)
      await rebuildRepo({
        objectFormat: 'sha1', // or 'sha256'?
        objects,
        refs: {
          [ref.ref]: ref.oid
        }
      })

      this._debug(`Done: ${ref.value}`)
      this._pendingFetches.delete(ref)
    }

    if (this._progress && totalObjectCount > 0) {
      this._progressReporter.finishCounting(totalObjectCount)

      // Show final receiving summary (git-like)
      this._progressReporter.reportInfo(
        `Receiving objects: 100% (${totalObjectCount}/${totalObjectCount}), ${this._progressReporter._formatBytes(receivedBytes)}, done.`
      )
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

  async list () {
    this._debug('Listing refs')

    const refs = await this._remoteDb.getAllRefs()

    this._debug(`[list] Refs: ${refs}`)

    refs.forEach((ref) => this._output(ref))
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

    if (this._progress) {
      this._progressReporter.startCounting('Enumerating objects')
    }

    let totalObjects = 0

    // First pass: count all objects
    for (const ref of this._pendingPushes) {
      try {
        const data = await this._getRefData(ref)
        totalObjects += data.size

        if (this._progress) {
          this._progressReporter.updateCount(totalObjects)
        }
      } catch (e) {
        this._debug(`Error counting objects for ${ref.value}: ${e.message}`)
      }
    }

    if (this._progress) {
      this._progressReporter.finishCounting(totalObjects)
      this._progressReporter.startWriting()
    }

    let writtenObjects = 0
    let writtenBytes = 0

    // Second pass: actually push the objects
    for (const ref of this._pendingPushes) {
      this._debug(`Get files: ${ref.value}`)
      const localRef = ref.ref
      const remoteRef = this._pushRemoteRefs.get(localRef)
      const pushedRef = remoteRef ? new Ref(remoteRef, ref.oid) : ref

      try {
        const data = await this._getRefData(ref)

        this._debug(`Data: ${data.size} ${this._remoteDb._blobs}`)

        const batch = this._remoteDb._blobs.batch()

        for (const [key, value] of data) {
          const object = await this._remoteDb.getObject(key)

          if (object) {
            this._debug(`Object already exists: ${key}`)
            writtenObjects++
            if (this._progress) {
              this._progressReporter.updateWriting(writtenObjects, writtenBytes)
            }
            continue
          }

          const id = await batch.put(value.content)

          await this._remoteDb.addObject({
            oid: key,
            blobId: id,
            type: value.type,
            size: value.size,
            refOid: pushedRef.oid
          })

          writtenObjects++
          writtenBytes += value.size

          if (this._progress) {
            this._progressReporter.updateWriting(writtenObjects, writtenBytes)
          }

          this._verbose(`Saved: ${key} Value: ${id.byteOffset}`)
        }

        await batch.flush()

        this._debug(`Pushed with ref: ${pushedRef.value}`)

        await this._remoteDb.addRef({
          oid: pushedRef.oid,
          name: pushedRef.ref
        })

        this._debug('Stored ref: ' + pushedRef.value)

        // ? or should we have lookup oid <> name and oid <> data?
        // ? output ok - stdout is closed at this point
        // this._output('ok ' + (remoteRef || localRef))
        this._pendingPushes.delete(ref)
      } catch (e) {
        this._debug(`Push error: ${e.message}`)
        if (this._progress) {
          this._progressReporter.reportError(
            `Failed to push ${pushedRef.value}: ${e.message}`
          )
        }
        this._output(`error ${pushedRef.value} ${e.message}`)
      }
    }

    if (this._progress) {
      this._progressReporter.finishWriting()
    }
  }

  /**
   * Get the data for a ref
   *
   * @param {string} ref
   * @returns Map<string, {sha1: string, type: string, size: number, content: Buffer}>
   */
  async _getRefData (ref) {
    const objects = new Map()

    try {
      this._debug(`Get ref data: ${ref.value}`)

      // First, get the list of object hashes
      const objectsResult = await sh
        .pipe(`git rev-list --objects ${ref.value}`)
        .pipe("cut -d' ' -f1")
        .pipe('git cat-file --batch')
        .exec()
      if (objectsResult.status !== 0) {
        throw new Error(
          `git rev-list failed: ${objectsResult.stderr || objectsResult.stdout}`
        )
      }

      const output = objectsResult.stdout

      this._debug(`Output length: ${output.length}`)

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
      return objects
    } catch (error) {
      this._debug(`Error: ${error.message}`)
      throw new Error('Error getting files')
    }
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
