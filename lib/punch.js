const process = require('process')
const sh = require('./bare-sh') 
const { isLocalRef } = require('./helpers')
const ReadyResource = require('ready-resource')
const { tmpdir } = require('os')
const { join, dirname } = require('path')
const { mkdirSync } = require('fs')
const { rebuildRepo } = require('./rebuild')
const { PunchLocalDB } = require('./db')
const { Ref } = require('./ref')

class PunchGit extends ReadyResource {
  _verbosity = 1
  _progress = false
  _pendingPushes = new Set()
  _pushRemoteRefs = new Map()
  _pendingFetches = new Set()
  _loadedRefs = new Set()
  _local = null
  _key = null
  _discoveryKey = null
  _name = null
  _bootstrap = null
  _repo = null
  _remoteName = null
  _remoteDb = null

  constructor (args = {}) {
    super()

    this._remoteName = args.remoteName
    this._key = args.key
    this._discoveryKey = args.discoveryKey
    this._name = args.name
    this._bootstrap = args.bootstrap

    this._repo = this._name

    this._local = new PunchLocalDB({
      repo: this._repo
    })
  }

  async _open () {
    await this._local.ready()

    let remote = await this._local.getRepo(this._repo)

    if (!remote) {
      remote = await this._local.joinRemote(this._repo, this._key, this._discoveryKey)
    }

    this._remoteDb = remote
  }

  async _close () {
    await this._local.close()
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
    this._verbose('Listing for push to ' + this._remoteName)

    const refs = await sh.exec('git', ['show-ref'])
    for (const ref of refs.split('\n')) {
      const [oid, name] = ref.split(' ')

      this._debug(`Ref: ${name} ${oid}`)

      if (name.startsWith('refs/heads/')) {
        const branchName = name.split('/').pop()
        const branch = refs.split('\n').find(e => isLocalRef(e, branchName))

        if (!branch) {
          return
        }

        const ref = Ref.fromValue(branchName === 'HEAD' ? `${oid} HEAD` : branch)

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

          this._debug(`Fetched Object: ${sha} ${type} ${size}`)
        } catch (e) {
          this._debug(`Error: ${e.message}`)
        }
      }

      this._debug(`Objects: ${objects.length}`)

      const tmp = join(tmpdir(), 'punch', this._repo, ref.oid)
      mkdirSync(tmp, { recursive: true })

      this._debug(`Rebuilding repo: ${tmp}`)
      await rebuildRepo({
        repoPath: tmp,
        objectFormat: 'sha1', // or 'sha256' — MUST match your object ids
        objects,
        refs: {
          [ref.ref]: ref.oid
        }
      })

      this._debug(`Unpacking repo: ${tmp}`)
      const packFiles = join(tmp, 'objects', 'pack', 'pack-*.pack')
      
      // Use shell to execute the piped command
      // const unpack = await sh('sh', ['-c', `cat ${packFiles} | git unpack-objects`], { cwd: dirname(process.env.GIT_DIR) })
      const unpack = await sh.cat(packFiles, 'git', ['unpack-objects'], { cwd: dirname(process.env.GIT_DIR) })

      if (unpack.status !== 0) {
        throw new Error(`Git command failed with code ${unpack.status}: ${unpack.stderr || unpack.stdout}`)
      }

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

  async list () {
    this._debug('Listing refs')

    const refs = await this._remoteDb.getAllRefs()

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

        this._debug(`Data: ${data.size} ${this._remoteDb._blobs}`)

        const batch = this._remoteDb._blobs.batch()

        for (const [key, value] of data) {
          const id = await batch.put(value.content)

          await this._remoteDb.addObject({
            oid: key,
            blobId: id,
            type: value.type,
            size: value.size,
            refOid: pushedRef.oid
          })

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
    const objects = new Map()

    try {
      this._debug(`Get ref data: ${ref.value}`)
      
      // First, get the list of object hashes
      const revListResult = await sh.exec('git', ['rev-list', '--objects', ref.value])
      if (revListResult.status !== 0) {
        throw new Error(`git rev-list failed: ${revListResult.stderr || revListResult.stdout}`)
      }

      // Parse the object hashes from the output
      const objectHashes = revListResult.stdout.toString()
        .split('\n')
        .filter(line => line.trim() && /^[0-9a-f]{40}$/.test(line.trim()))
        .map(line => line.trim())

      this._debug(`Found ${objectHashes.length} objects`)

      // Get the content for each object
      for (const hash of objectHashes) {
        const catFileResult = await sh.exec('git', ['cat-file', '--batch'], { input: hash })
        if (catFileResult.status !== 0) {
          this._debug(`git cat-file failed for ${hash}: ${catFileResult.stderr || catFileResult.stdout}`)
          continue
        }

        // Parse the output: <sha1> <type> <size>\n<raw object contents>
        const output = Buffer.from(catFileResult.stdout, 'utf8')
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
