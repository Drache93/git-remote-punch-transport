const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const Hyperbee = require('hyperbee2')
const { encodeUrl } = require('../messages')
const { GitTree } = require('rebuild-git')
const { Readable } = require('streamx')
const def = require('./schema/hyperdb/index')
const MirrorDrive = require('mirror-drive')

// --- Git commit parser ---

function parseCommit(data) {
  const text = data.toString('utf8')
  const lines = text.split('\n')
  const result = { tree: null, parents: [], author: null, timestamp: 0, message: '' }

  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line === '') {
      i++
      break
    }

    if (line.startsWith('tree ')) {
      result.tree = line.slice(5)
    } else if (line.startsWith('parent ')) {
      result.parents.push(line.slice(7))
    } else if (line.startsWith('author ')) {
      const match = line.match(/^author (.+) <.+> (\d+) [+-]\d+$/)
      if (match) {
        result.author = match[1]
        result.timestamp = parseInt(match[2])
      }
    }
  }

  result.message = lines.slice(i).join('\n').trim()
  return result
}

// --- Tree walker: extracts all file paths from git tree objects ---

function walkTree(objects, treeOid, prefix) {
  const treeObj = objects.get(treeOid)
  if (!treeObj || treeObj.type !== 'tree') return []

  const entries = GitTree.from(treeObj.data).entries()
  const files = []

  for (const entry of entries) {
    const path = prefix + '/' + entry.path
    if (entry.type === 'tree') {
      files.push(...walkTree(objects, entry.oid, path))
    } else {
      const blob = objects.get(entry.oid)
      files.push({
        path,
        oid: entry.oid,
        mode: entry.mode || '100644',
        size: blob ? blob.size : 0
      })
    }
  }

  return files
}

// --- Remote DB ---

class PunchRemoteDB extends ReadyResource {
  _swarm = null
  _store = null
  _bee = null
  _db = null
  _key = null

  constructor(args = {}) {
    super()

    this._name = args.name
    this._store = args.store
    this._swarm = args.swarm
    this._timeout = args.timeout || 240_000
    this._blind = args.blind
    this._key = args.key

    this._bee = new Hyperbee(this._store, { key: args.key })
    this._db = HyperDB.bee2(this._bee, def)

    this._onconnection = (conn) => {
      this._store.replicate(conn)
      this.emit('connection', conn)
    }

    this._swarm.on('connection', this._onconnection)
  }

  async _open() {
    await this._bee.ready()
    await this._db.ready()

    this._topic = this._swarm.join(this.discoveryKey)

    await this._db.update()
  }

  async _close() {
    this._swarm.off('connection', this._onconnection)

    if (this._topic) await this._topic.destroy()

    await this._db.close()
    await this._bee.close()
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
    return encodeUrl(this.key, this.name)
  }

  // --- Objects ---

  async getObject(oid) {
    return this._db.get('@punch/objects', { oid })
  }

  // --- Refs / Branches ---

  async getAllRefs() {
    const branches = this._db.find('@punch/branches')
    const refs = []

    for await (const b of branches) {
      refs.push({ ref: `refs/heads/${b.name}`, oid: b.commitOid })
    }

    const main = refs.find((r) => r.ref === 'refs/heads/main')
    if (main) refs.push({ ref: 'HEAD', oid: main.oid })

    return refs.reverse()
  }

  async getBranchRef(branch) {
    const b = await this._db.get('@punch/branches', { name: branch })
    if (!b) return null
    return { ref: `refs/heads/${b.name}`, oid: b.commitOid }
  }

  // --- Push: store objects + index branch + files ---

  async push(branchName, commitOid, objects) {
    // 1. Store all git objects
    for (const [oid, obj] of objects) {
      const existing = await this.getObject(oid)
      if (existing) continue

      await this._db.insert('@punch/objects', {
        oid,
        type: obj.type,
        size: obj.size,
        data: obj.data
      })
    }

    // 2. Parse commit metadata
    const commitObj = objects.get(commitOid)
    if (!commitObj) throw new Error('Commit object not found: ' + commitOid)

    const commit = parseCommit(commitObj.data)
    if (!commit.tree) throw new Error('Commit has no tree: ' + commitOid)

    // 3. Walk tree to enumerate files
    const files = walkTree(objects, commit.tree, '')

    // 4. Insert file records
    for (const file of files) {
      await this._db.insert('@punch/files', {
        branch: branchName,
        path: file.path,
        oid: file.oid,
        mode: file.mode,
        size: file.size,
        author: commit.author,
        message: commit.message,
        timestamp: commit.timestamp
      })
    }

    // 5. Insert branch record
    await this._db.insert('@punch/branches', {
      name: branchName,
      commitOid,
      treeOid: commit.tree,
      author: commit.author,
      message: commit.message,
      timestamp: commit.timestamp,
      objects: [...objects.keys()]
    })

    // 6. Flush
    await this._db.flush()
  }

  // --- Fetch support ---

  async getRefObjects(commitOid, onLoad) {
    const branches = this._db.find('@punch/branches')
    let branch = null

    for await (const b of branches) {
      if (b.commitOid === commitOid) {
        branch = b
        break
      }
    }

    if (!branch) return []

    const results = []
    for (const oid of branch.objects) {
      const obj = await this.getObject(oid)
      if (!obj || !obj.data) continue

      if (onLoad) onLoad(obj.size)
      results.push({ ...obj, id: oid })
    }

    return results
  }

  // --- Drive ---

  async toDrive(branch) {
    const b = await this._db.get('@punch/branches', { name: branch })
    if (!b) return null

    const drive = new PunchDrive(this._db, branch)
    await drive.ready()
    return drive
  }

  // --- Peer discovery ---

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
          await this._db.update()
        }
      }, 500)
    })
  }
}

// --- Drive: file system view backed by HyperDB ---

class PunchDrive extends ReadyResource {
  constructor(db, branch) {
    super()
    this._db = db
    this._branch = branch
  }

  async _open() {
    await this._db.ready()
  }

  _resolveKey(nameOrEntry) {
    if (typeof nameOrEntry === 'object' && nameOrEntry !== null) return nameOrEntry.key
    return nameOrEntry
  }

  async entry(nameOrEntry) {
    const key = this._resolveKey(nameOrEntry)
    const record = await this._db.get('@punch/files', { branch: this._branch, path: key })
    if (!record) return null

    return {
      key,
      value: {
        executable: record.mode === '100755',
        linkname: null,
        blob: { byteLength: record.size },
        metadata: null
      }
    }
  }

  async get(nameOrEntry) {
    const key = this._resolveKey(nameOrEntry)
    const record = await this._db.get('@punch/files', { branch: this._branch, path: key })
    if (!record) return null

    const obj = await this._db.get('@punch/objects', { oid: record.oid })
    if (!obj) return null
    return obj.data
  }

  createReadStream(entryOrKey) {
    const self = this
    const key = typeof entryOrKey === 'object' ? entryOrKey.key : entryOrKey

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

  _findRange(folder) {
    const branch = this._branch
    if (!folder || folder === '/') {
      return this._db.find('@punch/files-by-branch', { branch })
    }

    return this._db.find('@punch/files-by-branch', {
      gte: { branch, path: folder + '/' },
      lt: { branch, path: folder + '/\uffff' }
    })
  }

  list(folder, opts) {
    const ignore = opts && opts.ignore
    const stream = this._findRange(folder)

    return new Readable({
      async read(cb) {
        try {
          for await (const record of stream) {
            if (ignore && ignore(record.path)) continue
            this.push(record.path)
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
    const prefix = !folder || folder === '/' ? '/' : folder + '/'
    const seen = new Set()
    const stream = this._findRange(folder)

    return new Readable({
      async read(cb) {
        try {
          for await (const record of stream) {
            const rest = prefix === '/' ? record.path.slice(1) : record.path.slice(prefix.length)
            const name = rest.split('/')[0]
            if (!seen.has(name)) {
              seen.add(name)
              this.push(name)
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

  mirror(out, opts) {
    return new MirrorDrive(this, out, opts)
  }
}

module.exports = {
  PunchRemoteDB,
  PunchDrive,
  parseCommit,
  walkTree
}
