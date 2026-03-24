const Hyperschema = require('hyperschema')
const HyperDB = require('hyperdb/builder')

const SCHEMA_DIR = './lib/db/schema/hyperschema'
const DB_DIR = './lib/db/schema/hyperdb'

// --- Hyperschema definitions ---

const schema = Hyperschema.from(SCHEMA_DIR)
const punch = schema.namespace('punch')

// Repos: replaces both local/repos and remote/config
punch.register({
  name: 'repos',
  compact: true,
  fields: [
    { name: 'name', type: 'string', required: true },
    { name: 'key', type: 'buffer', required: true },
    { name: 'description', type: 'string', required: false },
    { name: 'lastPushed', type: 'uint', required: false }
  ]
})

// Branches: replaces the single 'refs' blob
punch.register({
  name: 'branches',
  compact: true,
  fields: [
    { name: 'name', type: 'string', required: true }, // e.g. 'main'
    { name: 'commitOid', type: 'string', required: true }, // HEAD commit
    { name: 'treeOid', type: 'string', required: true }, // root tree of HEAD
    { name: 'author', type: 'string', required: false }, // last commit author
    { name: 'message', type: 'string', required: false }, // last commit message
    { name: 'timestamp', type: 'uint', required: false }, // last commit timestamp
    { name: 'objects', type: 'string', array: true } // all OIDs for rebuild
  ]
})

// Files: path-indexed, one per file per branch
punch.register({
  name: 'files',
  compact: true,
  fields: [
    { name: 'branch', type: 'string', required: true },
    { name: 'path', type: 'string', required: true }, // e.g. '/src/index.js'
    { name: 'oid', type: 'string', required: true }, // blob OID
    { name: 'mode', type: 'string', required: true }, // '100644', '100755', '120000'
    { name: 'size', type: 'uint', required: true },
    { name: 'author', type: 'string', required: false }, // last author to change this file
    { name: 'message', type: 'string', required: false }, // last commit message for this file
    { name: 'timestamp', type: 'uint', required: false } // last changed timestamp
  ]
})

// Git objects: raw blobs, trees, commits, tags
punch.register({
  name: 'object-type',
  enum: ['blob', 'tree', 'commit', 'tag'],
  strings: true
})

punch.register({
  name: 'objects',
  compact: true,
  fields: [
    { name: 'oid', type: 'string', required: true },
    { name: 'type', type: '@punch/object-type', required: true },
    { name: 'size', type: 'uint', required: true },
    { name: 'data', type: 'buffer', required: true }
  ]
})

Hyperschema.toDisk(schema)

// --- HyperDB collection definitions ---

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const punchDb = db.namespace('punch')

punchDb.collections.register({
  name: 'repos',
  schema: '@punch/repos',
  key: ['name']
})

punchDb.collections.register({
  name: 'branches',
  schema: '@punch/branches',
  key: ['name']
})

punchDb.collections.register({
  name: 'files',
  schema: '@punch/files',
  key: ['branch', 'path']
})

punchDb.collections.register({
  name: 'objects',
  schema: '@punch/objects',
  key: ['oid']
})

// List files by path prefix within a branch (directory listing)
punchDb.indexes.register({
  name: 'files-by-branch',
  collection: '@punch/files',
  key: ['branch']
})

HyperDB.toDisk(db)
