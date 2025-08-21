const { homedir } = require('os')
const { join } = require('path')
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

    this._store = args.store || new Corestore(join(homedir(), '.punch'))
    this._swarm = args.swarm || new Hyperswarm()

    // // Get the git repo name
    // this._path = join(homedir(), '.punch')

    // if (!existsSync(this._path)) {
    //   mkdirSync(this._path, { recursive: true })
    // }

    this._db = HyperDB.bee(this._store.get({ name: 'db' }), def)

    this._swarm.on('connection', conn => {
      this._store.replicate(conn)

      this.emit('connection', conn)
    })

    this._remotes = new Map()
  }

  get remotes () {
    return this._remotes
  }

  getRemote (repo) {
    return this._remotes.get(repo)
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

      this._remotes.set(repo.name, remote)
    }
  }

  async createRemote (repo) {
    const remote = await PunchRemoteDB.create({
      repo,
      swarm: this._swarm,
      store: this._store
    })

    await remote.ready()

    await this._db.insert('@punch-local/repos', {
      name: repo,
      key: remote._db.core.key,
      discoveryKey: remote._db.core.discoveryKey,
      blobsKey: remote._blobs?.core.key,
      blobsDiscoveryKey: remote._blobs?.core.discoveryKey
    })

    await this._db.flush()

    this._remotes.set(repo, remote)

    return remote
  }

  async joinRemote (repo, key = null) {
    const remote = new PunchRemoteDB({
      repo,
      key,
      swarm: this._swarm,
      store: this._store
    })

    // Let the remote try getting the rest of the data
    await remote.ready()

    await this._db.insert('@punch-local/repos', {
      name: repo,
      key: remote._db.core.key,
      discoveryKey: remote._db.core.discoveryKey,
      blobsKey: remote._blobs.core.key,
      blobsDiscoveryKey: remote._blobs.core.discoveryKey
    })

    await this._db.flush()

    this._remotes.set(repo, remote)

    await remote._db.core.update()

    return remote
  }

  get swarm () {
    return this._swarm
  }

  async getRepo (name) {
    const repo = await this._db.get('@punch-local/repos', { name })
    if (!repo) {
      return null
    }

    const remote = new PunchRemoteDB({
      repo: name,
      swarm: this._swarm,
      store: this._store,
      key: repo.key,
      discoveryKey: repo.discoveryKey,
      blobsKey: repo.blobsKey,
      blobsDiscoveryKey: repo.blobsDiscoveryKey
    })

    await remote.ready()

    return remote
  }

  async _open () {
    await this._db.ready()

    // ? Do we want to open them all now?
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
