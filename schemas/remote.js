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
      name: 'blobsKey',
      type: 'buffer',
      required: true
    },
    {
      name: 'blobsDiscoveryKey',
      type: 'buffer',
      required: true
    }
  ]
})

punch.register({
  name: 'objects',
  compact: true,
  fields: [
    {
      name: 'oid',
      type: 'string',
      required: true
    },
    {
      name: 'blobId',
      type: 'json',
      required: true
    },
    {
      name: 'type',
      type: 'string',
      required: true
    },
    {
      name: 'size',
      type: 'uint',
      required: true
    },
    {
      name: 'refOid',
      type: 'string',
      required: true
    }
  ]
})

// Define 'members'
punch.register({
  name: 'refs',
  compact: true,
  fields: [
    {
      name: 'oid',
      type: 'string',
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
const punchDb = db.namespace('punch-remote')

// Define collections of structs

punchDb.collections.register({
  name: 'objects',
  schema: '@punch-remote/objects',
  key: ['oid']
})

punchDb.collections.register({
  name: 'refs',
  schema: '@punch-remote/refs',
  key: ['oid']
})

punchDb.collections.register({
  name: 'config',
  schema: '@punch-remote/config',
  key: ['blobsKey']
})

punchDb.indexes.register({
  name: 'refs-by-name',
  collection: '@punch-remote/refs',
  key: ['name']
})

punchDb.indexes.register({
  name: 'objects-by-refOid',
  collection: '@punch-remote/objects',
  key: ['refOid']
})

HyperDB.toDisk(db)
