const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const Hyperblobs = require('hyperblobs')
const def = require('./remote/schema/hyperdb/index')
const cenc = require('compact-encoding')
const { compile } = require('compact-encoding-struct')
const { repoConfig } = require('../messages')
const { Ref } = require('../ref')
const Hyperbee = require('hyperbee2')
const b4a = require('b4a')
const { GitTree } = require('isomorphic-git')

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

  async put(key, value) {
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

    this._repo = args.repo

    this._store = args.store
    this._swarm = args.swarm
    this._timeout = args.timeout || 240_000
    this._blind = args.blind

    this._key = args.key
    this._bee = new Hyperbee(this._store, { key: args.key })

    this._swarm.on('connection', (conn) => this._store.replicate(conn))
  }

  async _open() {
    await this._bee.ready()
  }

  async _close() {
    await this._bee.close()
  }

  get key() {
    return this._bee.core.key
  }

  get remoteUrl() {
    const value = cenc.encode(repoConfig, {
      key: this.key,
      name: this._repo,
      bootstrap: []
    })
    return `punch://${value.toString('hex')}/${this._repo}`
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

  async _getObjectsFromTree(treeOid) {
    const tree = await this._bee.get(b4a.from(treeOid))
    if (!tree) throw new Error('Tree not found')

    const object = cenc.decode(GitObject, tree.value)

    if (object.type !== 'tree') return []

    const treeValue = GitTree.from(object.data)

    const entries = treeValue.entries()

    for (const entry of entries) {
      if (entry.type !== 'tree') continue

      const values = await this._getObjectsFromTree(entry.oid)
      entries.push(...values)
    }

    return entries
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
}

module.exports = {
  PunchRemoteDB
}
