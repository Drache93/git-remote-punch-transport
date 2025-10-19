const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const Hyperblobs = require('hyperblobs')
const def = require('./remote/schema/hyperdb/index')
const cenc = require('compact-encoding')
const { repoConfig } = require('../messages')
const { Ref } = require('../ref')
const Hyperbee = require('hyperbee2')
const b4a = require('b4a')

const RemoteRefs = cenc.array(cenc.json)

class ObjectWriter {
  constructor(bee) {
    this._bee = bee
    this._writer = bee.write()
  }

  async put(key, value) {
    this._writer.tryPut(b4a.from(key), Buffer.isBuffer(value) ? value : b4a.from(value))
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
    const mappedRefs = refs.map((ref) => new Ref(ref.ref, ref.oid))

    const main = mappedRefs.find((ref) => ref.ref === 'refs/heads/main')

    mappedRefs.push(new Ref('HEAD', main.oid))

    return mappedRefs.reverse()
  }

  async putRef(ref) {
    const w = this._bee.write()

    const refs = await this._getAllRefs()

    refs.push(ref.toJSON())

    w.tryPut(PunchRemoteDB.keyRefs, cenc.encode(RemoteRefs, refs))
    await w.flush()
  }
}

module.exports = {
  PunchRemoteDB
}
