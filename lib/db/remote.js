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

  constructor (args = {}) {
    super()

    this._repo = args.repo

    this._store = args.store
    this._swarm = args.swarm

    this._db = HyperDB.bee(this._store.get({ key: args.key, name: `${this._repo}-db` }), def)

    this._swarm.on('connection', conn => this._store.replicate(conn))
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
      discoveryKey: this._db.core.discoveryKey,
      key: this._db.core.key,
      name: this._repo,
      bootstrap: []
    })
    return `punch://${value.toString('hex')}/${this._repo}`
  }

  async _open () {
    await this._db.ready()

    const config = await this._db.find('@punch-remote/config').toArray()
    if (config.length === 0) {
      process.stderr.write(`No config found for ${this._repo}, creating one\n`)

      this._blobs = new Hyperblobs(this._store.get({ name: `${this._repo}-blobs` }))
      await this._blobs.ready()

      await this._db.insert('@punch-remote/config', {
        blobsKey: this._blobs.core.key,
        blobsDiscoveryKey: this._blobs.core.discoveryKey
      })
    } else {
      this._blobs = new Hyperblobs(this._store.get({ key: config[0].blobsKey, name: `${this._repo}-blobs` }))
      await this._blobs.ready()
    }

    await this._db.flush()

    const discovery = this._swarm.join(this._db.core.discoveryKey)
    await discovery.flushed()
  }

  async _close () {
    await this._db.close()
  }
}

module.exports = {
  PunchRemoteDB
}
