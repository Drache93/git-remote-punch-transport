const Hyperschema = require('hyperschema')
const HyperDB = require('hyperdb/builder')

const SCHEMA_DIR = './lib/db/local/schema/hyperschema' // where the schema definitions are written
const DB_DIR = './lib/db/local/schema/hyperdb' // Where to install db definition

// Hyperschema definitions
const schema = Hyperschema.from(SCHEMA_DIR)
const punch = schema.namespace('punch-local')

punch.register({
  name: 'repos',
  compact: true,
  fields: [
    {
      name: 'key',
      type: 'buffer',
      required: true
    },
    {
      name: 'discoveryKey',
      type: 'buffer',
      required: true
    },
    {
      name: 'blobsKey',
      type: 'buffer',
      required: true
    },
    {
      name: 'blobsDiscoveryKey',
      type: 'buffer',
      required: true
    },
    {
      name: 'name',
      type: 'string',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)

// Hyperdb collection definitions
const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const punchDb = db.namespace('punch-local')

punchDb.collections.register({
  name: 'repos',
  schema: '@punch-local/repos',
  key: ['name']
})

HyperDB.toDisk(db)
