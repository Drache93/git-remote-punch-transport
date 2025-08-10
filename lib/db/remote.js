const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const Hyperblobs = require('hyperblobs')
const def = require('./remote/schema/hyperdb/index')
const cenc = require('compact-encoding')
const { repoConfig } = require('../messages')

class PunchRemoteDB extends ReadyResource {
  _swarm = null
  _store = null
  _db = null

  constructor (args = {}) {
    super()

    this._repo = args.repo

    this._store = args.store
    this._swarm = args.swarm

    this._db = HyperDB.bee(this._store.get({ key: args.key, name: `${this._repo}-db` }), def)
    this._blobs = new Hyperblobs(this._store.get({ key: args.blobsKey, name: `${this._repo}-blobs` }))

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
    await this._blobs.ready()

    const config = await this._db.find('@punch-remote/config')
    if (config.length === 0) {
      console.log(`No config found for ${this._repo}, creating one`)

      await this._db.insert('@punch-remote/config', {
        blobsKey: this._blobs.core.key,
        blobsDiscoveryKey: this._blobs.core.discoveryKey
      })
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
