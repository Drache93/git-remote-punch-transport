const Hyperschema = require('hyperschema')
const HyperDB = require('hyperdb/builder')

const SCHEMA_DIR = './lib/db/schema/hyperschema'
const DB_DIR = './lib/db/schema/hyperdb'

// --- Hyperschema definitions ---

const schema = Hyperschema.from(SCHEMA_DIR)
const gip = schema.namespace('gip')

// Repos: local-only collection for tracking known remotes
gip.register({
  name: 'repos',
  compact: true,
  fields: [
    { name: 'name', type: 'string', required: true },
    { name: 'key', type: 'buffer', required: true },
    { name: 'description', type: 'string', required: false },
    { name: 'lastPushed', type: 'uint', required: false }
  ]
})

Hyperschema.toDisk(schema)

// --- HyperDB collection definitions ---

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const gipDb = db.namespace('gip')

gipDb.collections.register({
  name: 'repos',
  schema: '@gip/repos',
  key: ['name']
})

HyperDB.toDisk(db)
