const { homedir } = require('os')
const { existsSync, mkdirSync } = require('fs')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const def = require('./local/schema/hyperdb/index')
const { PunchRemoteDB } = require('./remote')

class PunchLocalDB extends ReadyResource {
  _swarm = null
  _store = null

  constructor (args = {}) {
    super()

    this._store = new Corestore(`${homedir()}/.punch`)
    this._swarm = new Hyperswarm()

    // Get the git repo name
    this._path = `${homedir()}/.punch`

    if (!existsSync(this._path)) {
      mkdirSync(this._path, { recursive: true })
    }

    this._db = HyperDB.bee(this._store.get({ name: 'db' }), def)

    this._swarm.on('connection', conn => this._store.replicate(conn))

    this._remotes = []
  }

  get remotes () {
    return this._remotes
  }

  async _openRemotes () {
    const knownRepos = await this._db.find('@punch-local/repos')

    for await (const repo of knownRepos) {
      const remote = new PunchRemoteDB({
        repo: repo.name,
        swarm: this._swarm,
        store: this._store,
        key: repo.key,
        discoveryKey: repo.discoveryKey,
        blobsKey: repo.blobsKey,
        blobsDiscoveryKey: repo.blobsDiscoveryKey
      })

      await remote.ready()

      this._remotes.push(remote)
    }
  }

  async newRemote (repo) {
    const remote = new PunchRemoteDB({
      repo,
      swarm: this._swarm,
      store: this._store
    })

    await remote.ready()

    await this._db.insert('@punch-local/repos', {
      name: repo,
      key: remote._db.core.key,
      discoveryKey: remote._db.core.discoveryKey,
      blobsKey: remote._blobs.core.key,
      blobsDiscoveryKey: remote._blobs.core.discoveryKey
    })

    await this._db.flush()

    this._remotes.push(remote)

    return remote
  }

  get swarm () {
    return this._swarm
  }

  async getRepo (name) {
    return this._db.get('@punch-local/repos', { name })
  }

  async _open () {
    await this._db.ready()

    // TODO: join a topic?

    await this._openRemotes()
  }

  async _close () {
    await this._db.close()
    await this._store.close()
    await this._swarm.destroy()
  }
}

module.exports = {
  PunchLocalDB
}
