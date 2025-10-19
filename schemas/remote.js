const Hyperschema = require('hyperschema')
const HyperDB = require('hyperdb/builder')

const SCHEMA_DIR = './lib/db/remote/schema/hyperschema' // where the schema definitions are written
const DB_DIR = './lib/db/remote/schema/hyperdb' // Where to install db definition

// Hyperschema definitions
const schema = Hyperschema.from(SCHEMA_DIR)
const punch = schema.namespace('punch-remote')

punch.register({
  name: 'config',
  compact: true,
  fields: [
    {
      name: 'name',
      type: 'string',
      required: true
    },
    {
      name: 'key',
      type: 'buffer',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)

// Hyperdb collection definitions
const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const punchDb = db.namespace('punch-remote')

// Define collections of structs

punchDb.collections.register({
  name: 'config',
  schema: '@punch-remote/config',
  key: ['key']
})

punchDb.indexes.register({
  name: 'config-by-name',
  collection: '@punch-remote/config',
  key: ['name']
})

HyperDB.toDisk(db)
