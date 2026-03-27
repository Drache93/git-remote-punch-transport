const { homedir } = require('os')
const { join } = require('path')
const Corestore = require('corestore')
const BlindPeering = require('blind-peering')
const Hyperswarm = require('hyperswarm')
const Wakeup = require('protomux-wakeup')
const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const def = require('./schema/hyperdb/index')
const { Remote } = require('gip-remote')

const blindPeers = ['y9frctpdhd5cp3hxrkn51ih89ghcpfeuzkixkibmsa65b66oea3y']

class GipLocalDB extends ReadyResource {
  _swarm = null
  _store = null
  _wakeup = null
  _identity = null
  _db = null
  _remotes = new Map()

  constructor(args = {}) {
    super()

    this._store = args.store || new Corestore(join(homedir(), '.gip'))
    this._externalSwarm = args.swarm || null
  }

  get remotes() {
    return this._remotes
  }

  getRemote(repo) {
    return this._remotes.get(repo)
  }

  async _createRemote(link) {
    const remote = new Remote(this._store, link, { blind: this._blind })
    await remote.ready()
    this._swarm.join(remote.discoveryKey)
    return remote
  }

  async *getRemotes(query, options = {}) {
    const knownRepos = await this._db.find('@gip/repos', query, options)

    for await (const repo of knownRepos) {
      const remote = await this._createRemote({ name: repo.name, key: repo.key })
      yield remote
    }
  }

  async openRemotes() {
    const knownRepos = await this._db.find('@gip/repos')

    for await (const repo of knownRepos) {
      const remote = await this._createRemote({ name: repo.name, key: repo.key })
      this._remotes.set(repo.name, remote)
    }

    return this._remotes
  }

  async createRemote(name) {
    const remote = await this._createRemote(name)

    await this._db.insert('@gip/repos', {
      name,
      key: remote.key
    })

    await this._db.flush()

    this._remotes.set(name, remote)

    return remote
  }

  async openRemote(link) {
    const remote = await this._createRemote(link)
    const name = remote.name

    const existing = await this._db.get('@gip/repos', { name })
    if (existing) return remote

    // New remote — wait for peers and persist
    await remote.waitForPeers()

    await this._db.insert('@gip/repos', {
      name,
      key: remote.key
    })

    await this._db.flush()

    this._remotes.set(name, remote)

    return remote
  }

  async getRepo(name) {
    const repo = await this._db.get('@gip/repos', { name })
    if (!repo) return null

    const remote = await this._createRemote({ name: repo.name, key: repo.key })
    return remote
  }

  get swarm() {
    return this._swarm
  }

  async _open() {
    this._swarm = this._externalSwarm || new Hyperswarm()

    if (!this._externalSwarm) {
      this._wakeup = new Wakeup()
      this._blind = new BlindPeering(this._swarm, this._store, {
        wakeup: this._wakeup,
        mirrors: blindPeers
      })
    }

    this._db = HyperDB.bee(this._store.get({ name: 'db' }), def)

    this._swarm.on('connection', (conn) => {
      this._store.replicate(conn)
      if (this._wakeup) this._wakeup.addStream(conn)

      this.emit('connection', conn)
    })

    await this._db.ready()
  }

  async _close() {
    if (this._blind) await this._blind.close()
    if (this._swarm) await this._swarm.destroy()
    if (this._db) await this._db.close()
    for (const remote of this._remotes.values()) {
      await remote.close()
    }
    await this._store.close()
  }
}

module.exports = {
  GipLocalDB
}
