const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const Hyperblobs = require('hyperblobs')
const def = require('./remote/schema/hyperdb/index')
const cenc = require('compact-encoding')
const { repoConfig } = require('../messages')
const { Ref } = require('../ref')

class PunchRemoteDB extends ReadyResource {
  _swarm = null
  _store = null
  _blobs = null
  _db = null
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
  constructor (args = {}) {
    super()

    this._repo = args.repo

    this._store = args.store
    this._swarm = args.swarm

    this._key = args.key

    const storeConfig = args.key ? args.key : { name: `${this._repo}-db` }
    this._db = HyperDB.bee(this._store.get(storeConfig), def)

    this._swarm.on('connection', conn => this._store.replicate(conn))
  }

  static async create (args = {}) {
    const db = HyperDB.bee(args.store.get({ name: `${args.repo}-db` }), def, {
      autoUpdate: true
    })
    const blobs = new Hyperblobs(args.store.get({ name: `${args.repo}-blobs` }))

    await db.ready()
    await blobs.ready()

    await db.insert('@punch-remote/config', {
      name: args.repo,
      key: db.core.key,
      blobsKey: blobs.core.key,
      blobsDiscoveryKey: blobs.core.discoveryKey
    })
    await db.flush()

    const remote = new PunchRemoteDB({
      repo: args.repo,
      store: args.store,
      swarm: args.swarm
      // key: db.core.key,
      // discoveryKey: db.core.discoveryKey
    })

    return remote
  }

  async get (collectionName, doc) {
    return this._db.get(`@punch-remote/${collectionName}`, doc)
  }

  async insert (collectionName, doc) {
    return this._db.insert(`@punch-remote/${collectionName}`, doc)
  }

  get name () {
    return this._repo
  }

  async getConfig () {
    return this._db.find('@punch-remote/config').one()
  }

  async addRef (ref) {
    const res = await this._db.insert('@punch-remote/refs', ref)
    await this._db.flush()
    return res
  }

  async addObject (object) {
    const res = await this._db.insert('@punch-remote/objects', object)
    await this._db.flush()
    return res
  }

  async getRefObjects (refOid) {
    return this._db.find('@punch-remote/objects-by-refOid', {
      refOid
    })
  }

  async getRef (oid) {
    return this._db.get('@punch-remote/refs', {
      oid
    })
  }

  async getObject (oid) {
    return this._db.get('@punch-remote/objects', {
      oid
    })
  }

  async getBlob (blobId) {
    return this._blobs.get(blobId)
  }

  async getAllRefs () {
    const refStream = await this._db.find('@punch-remote/refs', {})

    const refs = new Map()
    let mostRecentMain = null

    for await (const ref of refStream) {
      const r = new Ref(ref.name, ref.oid)

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

  get remoteUrl () {
    const value = cenc.encode(repoConfig, {
      key: this.key,
      name: this._repo,
      bootstrap: []
    })
    return `punch://${value.toString('hex')}/${this._repo}`
  }

  get key () {
    return this._key || this._db.core.key
  }

  get discoveryKey () {
    return this._db.core.discoveryKey
  }

  async _open () {
    await this._db.ready()

    const core = this._store.get({ key: this.key })
    await core.ready()

    // Joining
    if (this._key) {
      const done = core.findingPeers()
      this._swarm.join(core.discoveryKey)

      this._swarm.flush().then(() => done())

      await this._db.core.update()
    } else {
      this._swarm.join(this.discoveryKey)
    }

    await this._db.update()

    const config = await this._db.find('@punch-remote/config').one()

    if (!config) {
      throw new Error(`Remote repository '${this._repo}' not found`)
    }

    this._blobs = new Hyperblobs(this._store.get({ key: config.blobsKey }))
    await this._blobs.ready()
  }

  async _close () {
    await this._db.close()
  }
}

module.exports = {
  PunchRemoteDB
}
