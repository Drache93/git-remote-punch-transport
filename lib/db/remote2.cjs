const ReadyResource = require('ready-resource')
const cenc = require('compact-encoding')
const { compile } = require('compact-encoding-struct')
const { RepoConfig } = require('../messages')
const { Ref } = require('../ref')
const Hyperbee = require('hyperbee2')
const b4a = require('b4a')
const z32 = require('z32')
const { GitTree } = require('rebuild-git')
const { Readable } = require('streamx')

const GitObject = compile({
  type: cenc.string,
  size: cenc.uint32,
  data: cenc.buffer
})

const RemoteRefs = cenc.array(
  compile({
    ref: cenc.string,
    oid: cenc.string,
    objects: cenc.array(cenc.string)
  })
)

class ObjectWriter {
  constructor(bee) {
    this._bee = bee
    this._writer = bee.write()
  }

  put(key, value) {
    this._writer.tryPut(b4a.from(key), cenc.encode(GitObject, value))
  }

  async flush() {
    await this._writer.flush()
  }
}

class PunchRemoteDB extends ReadyResource {
  _swarm = null
  _store = null
  _bee = null
  /** @type {Buffer | null} */
  _key = null

  /**
   * Details for a remote repository.
   *
   * @param {Object} args
   * @param {string} args.repo
   * @param {Corestore} args.store
   * @param {Hyperswarm} args.swarm
   * @param {Buffer | null} args.key
   */
  constructor(args = {}) {
    super()

    this._name = args.name

    this._store = args.store
    this._swarm = args.swarm
    this._timeout = args.timeout || 240_000
    this._blind = args.blind

    this._key = args.key

    this._bee = new Hyperbee(this._store, { key: args.key })

    this._swarm.on('connection', (conn) => {
      this._store.replicate(conn)

      this.emit('connection', conn)
    })
  }

  async _open() {
    await this._bee.ready()

    this._swarm.join(this.discoveryKey)

    await this._bee.update()

    // await this._blind.addCore(this._bee.core, undefined, {
    //   announce: true
    // })
  }

  async _close() {
    await this._bee.close()
    await this._swarm.destroy()
    await this._store.close()
  }

  get name() {
    return this._name
  }

  get core() {
    return this._bee.core
  }

  get key() {
    return this._bee.core.key
  }

  get discoveryKey() {
    return this._bee.core.discoveryKey
  }

  get availablePeers() {
    return this._bee.core.peers.length
  }

  get url() {
    const value = cenc.encode(RepoConfig, {
      key: this.key,
      name: this.name,
      bootstrap: []
    })
    return `git+pear://${z32.encode(value)}/${this.name}`
  }

  get(key) {
    return this._bee.get(b4a.from(key))
  }

  pushObjects() {
    return new ObjectWriter(this._bee)
  }

  static keyRefs = b4a.from('refs')

  async _getAllRefs() {
    const refs = await this._bee.get(PunchRemoteDB.keyRefs)
    if (!refs) return []
    return cenc.decode(RemoteRefs, refs.value)
  }

  async getAllRefs() {
    const refs = await this._getAllRefs()
    const mappedRefs = refs.map((ref) => new Ref(ref.ref, ref.oid, ref.objects))

    const main = mappedRefs.find((ref) => ref.ref === 'refs/heads/main')

    if (main) {
      mappedRefs.push(new Ref('HEAD', main.oid, main.objects))
    }

    return mappedRefs.reverse()
  }

  async getBranchRef(branch) {
    const refs = await this._getAllRefs()

    const ref = refs.find((r) => r.ref === `refs/heads/${branch}`)
    if (!ref) return null

    return new Ref(ref.ref, ref.oid, ref.objects)
  }

  async toDrive(branch) {
    const ref = await this.getBranchRef(branch) // TODO: support commit
    if (!ref) return null

    const objs = await this.getRefObjects(ref.oid)
    const latestTree = objs.find((o) => o.type === 'tree') // TODO: support history
    if (!latestTree) return null

    const drive = new PunchDrive(this._bee, latestTree.id)
    await drive.ready()
    return drive
  }

  async getObject(oid) {
    const record = await this._bee.get(b4a.from(oid))
    const object = cenc.decode(GitObject, record.value)

    return object
  }

  async getRefObjects(oid, onLoad) {
    const refs = await this._getAllRefs()
    const ref = refs.find((ref) => ref.oid === oid)

    if (!ref) return []

    return Promise.all(
      ref.objects.map(async (oid) => {
        const record = await this._bee.get(b4a.from(oid))
        const object = cenc.decode(GitObject, record.value)

        if (object.size !== object.data.length) throw new Error(`Invalid object size for ${oid}`)

        if (onLoad) {
          onLoad(object.size)
        }

        return { ...object, id: oid }
      })
    )
  }

  /**
   * Store oid -> ref (e.g. main -> 1234567890abcdef)
   *
   * @param {Ref} ref
   * @returns {Promise<void>}
   */
  async putRef(ref, objects) {
    const w = this._bee.write()

    const refs = await this._getAllRefs()

    let existingIdx = refs.findIndex((r) => r.ref === ref.ref)
    if (existingIdx > -1) {
      refs[existingIdx] = {
        ...ref.toJSON(),
        objects
      }
    } else {
      refs.push({
        ...ref.toJSON(),
        objects
      })
    }

    w.tryPut(PunchRemoteDB.keyRefs, cenc.encode(RemoteRefs, refs))
    await w.flush()
  }

  async waitForPeers() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval)
        reject(new Error(`Timeout waiting for peers after ${this._timeout}ms`))
      }, this._timeout)

      const interval = setInterval(async () => {
        if (this.availablePeers > 0) {
          clearInterval(interval)
          clearTimeout(timeout)
          resolve()
        } else {
          await this._bee.update()
        }
      }, 500)
    })
  }
}

class PunchDrive extends ReadyResource {
  constructor(bee, treeOid) {
    super()
    this._bee = bee
    this._treeOid = treeOid
  }

  async _open() {
    await this._bee.ready()
  }

  _resolveKey(nameOrEntry) {
    if (typeof nameOrEntry === 'object' && nameOrEntry !== null) return nameOrEntry.key
    return nameOrEntry
  }

  async _loadTree(oid) {
    const record = await this._bee.get(b4a.from(oid))
    if (!record) return null

    const object = cenc.decode(GitObject, record.value)
    if (object.type !== 'tree') return null

    return GitTree.from(object.data).entries()
  }

  async _walkTo(segments) {
    let oid = this._treeOid

    for (const segment of segments) {
      const entries = await this._loadTree(oid)
      if (!entries) return null

      const entry = entries.find((e) => e.path === segment)
      if (!entry || entry.type !== 'tree') return null
      oid = entry.oid
    }

    return oid
  }

  async _findEntry(key) {
    const parts = key.slice(1).split('/')
    const name = parts.pop()

    const parentOid = parts.length > 0 ? await this._walkTo(parts) : this._treeOid
    if (!parentOid) return null

    const entries = await this._loadTree(parentOid)
    if (!entries) return null

    return entries.find((e) => e.path === name) || null
  }

  async entry(nameOrEntry) {
    const key = this._resolveKey(nameOrEntry)
    const gitEntry = await this._findEntry(key)
    if (!gitEntry || gitEntry.type === 'tree') return null

    const blob = await this._getBlob(gitEntry.oid)

    return {
      key,
      value: {
        executable: gitEntry.mode === '100755',
        linkname: null,
        blob: { byteLength: blob.length },
        metadata: null
      }
    }
  }

  async get(nameOrEntry) {
    const key = this._resolveKey(nameOrEntry)
    const gitEntry = await this._findEntry(key)
    if (!gitEntry || gitEntry.type === 'tree') return null

    return this._getBlob(gitEntry.oid)
  }

  createReadStream(nameOrEntry) {
    const key = this._resolveKey(nameOrEntry)
    const self = this
    return new Readable({
      async read(cb) {
        try {
          const buf = await self.get(key)
          if (buf) this.push(buf)
          this.push(null)
          cb(null)
        } catch (err) {
          cb(err)
        }
      }
    })
  }

  list(folder, opts) {
    folder = folder || '/'
    const ignore = opts && opts.ignore
    const self = this
    const queue = []
    let started = false

    return new Readable({
      async read(cb) {
        try {
          if (!started) {
            started = true
            const segments = folder === '/' ? [] : folder.slice(1).split('/')
            const rootOid = segments.length > 0 ? await self._walkTo(segments) : self._treeOid
            if (!rootOid) { this.push(null); return cb(null) }
            queue.push({ oid: rootOid, prefix: folder === '/' ? '' : folder })
          }

          while (queue.length > 0) {
            const { oid, prefix } = queue.shift()
            const entries = await self._loadTree(oid)
            if (!entries) continue

            for (const entry of entries) {
              const key = prefix + '/' + entry.path
              if (entry.type === 'tree') {
                queue.push({ oid: entry.oid, prefix: key })
              } else {
                if (ignore && ignore(key)) continue
                this.push(key)
              }
            }
          }

          this.push(null)
          cb(null)
        } catch (err) {
          cb(err)
        }
      }
    })
  }

  readdir(folder) {
    folder = folder || '/'
    const self = this

    return new Readable({
      open(cb) {
        const segments = folder === '/' ? [] : folder.slice(1).split('/')
        const resolve = segments.length > 0 ? self._walkTo(segments) : Promise.resolve(self._treeOid)

        resolve
          .then((oid) => {
            if (!oid) { this._oid = null; return cb(null) }
            this._oid = oid
            cb(null)
          })
          .catch(cb)
      },
      async read(cb) {
        try {
          if (!this._oid) { this.push(null); return cb(null) }

          const entries = await self._loadTree(this._oid)
          this._oid = null

          if (!entries) { this.push(null); return cb(null) }

          for (const entry of entries) {
            this.push(entry.path)
          }

          this.push(null)
          cb(null)
        } catch (err) {
          cb(err)
        }
      }
    })
  }

  async _getBlob(oid) {
    const record = await this._bee.get(b4a.from(oid))
    if (!record) return null

    const object = cenc.decode(GitObject, record.value)
    return object.data
  }
}

module.exports = {
  PunchRemoteDB,
  PunchDrive,
  GitObject
}
