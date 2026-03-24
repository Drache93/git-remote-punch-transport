const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const tmp = require('test-tmp')
const Corestore = require('corestore')

const { PunchLocalDB } = require('../lib/db')
const { parseCommit, walkTree } = require('../lib/db/remote2')
const { encodeUrl, decodeUrl } = require('../lib/messages')

// --- Helpers ---

async function createStore (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)
  t.teardown(() => store.close())
  return store
}

// 40-char hex OIDs (proper SHA1 length)
const OID_BLOB1 = 'aa'.repeat(20)    // blob: hello world
const OID_BLOB2 = 'bb'.repeat(20)    // blob: console.log("hi")
const OID_TREE_SRC = 'cc'.repeat(20) // tree: src/
const OID_TREE_ROOT = 'dd'.repeat(20) // tree: root
const OID_COMMIT = 'ee'.repeat(20)   // commit

function makeTestObjects () {
  const blobData = Buffer.from('hello world')
  const objects = new Map()
  objects.set(OID_BLOB1, { type: 'blob', size: blobData.length, data: blobData })

  const blob2Data = Buffer.from('console.log("hi")')
  objects.set(OID_BLOB2, { type: 'blob', size: blob2Data.length, data: blob2Data })

  // Tree with one file: index.js
  const srcTreeData = makeTreeData([{ mode: '100644', name: 'index.js', oid: OID_BLOB2 }])
  objects.set(OID_TREE_SRC, { type: 'tree', size: srcTreeData.length, data: srcTreeData })

  // Root tree: README.md (blob) + src (subtree)
  const rootTreeData = makeTreeData([
    { mode: '100644', name: 'README.md', oid: OID_BLOB1 },
    { mode: '40000', name: 'src', oid: OID_TREE_SRC }
  ])
  objects.set(OID_TREE_ROOT, { type: 'tree', size: rootTreeData.length, data: rootTreeData })

  const commitText = [
    `tree ${OID_TREE_ROOT}`,
    `author Test User <test@test.com> 1700000000 +0000`,
    `committer Test User <test@test.com> 1700000000 +0000`,
    '',
    'initial commit'
  ].join('\n')
  const commitData = Buffer.from(commitText)
  objects.set(OID_COMMIT, { type: 'commit', size: commitData.length, data: commitData })

  return objects
}

function makeTreeData (entries) {
  // Git tree format: <mode> <name>\0<20-byte-binary-oid> repeated
  const bufs = []
  for (const { mode, name, oid } of entries) {
    bufs.push(Buffer.from(`${mode} ${name}\0`))
    bufs.push(Buffer.from(oid, 'hex')) // 40-char hex → 20-byte binary
  }
  return Buffer.concat(bufs)
}

// --- Tests ---

test('parseCommit extracts metadata', (t) => {
  const data = Buffer.from([
    'tree abc123',
    'parent def456',
    'author Alice <alice@example.com> 1700000000 +0000',
    'committer Bob <bob@example.com> 1700000001 +0000',
    '',
    'Fix the thing',
    '',
    'More details here.'
  ].join('\n'))

  const commit = parseCommit(data)

  t.is(commit.tree, 'abc123')
  t.alike(commit.parents, ['def456'])
  t.is(commit.author, 'Alice')
  t.is(commit.timestamp, 1700000000)
  t.is(commit.message, 'Fix the thing\n\nMore details here.')
})

test('parseCommit handles no parent', (t) => {
  const data = Buffer.from([
    'tree abc123',
    'author Alice <alice@example.com> 1700000000 +0000',
    'committer Alice <alice@example.com> 1700000000 +0000',
    '',
    'initial'
  ].join('\n'))

  const commit = parseCommit(data)

  t.is(commit.tree, 'abc123')
  t.alike(commit.parents, [])
  t.is(commit.message, 'initial')
})

test('encodeUrl and decodeUrl roundtrip', (t) => {
  const key = Buffer.alloc(32, 0xab)
  const name = 'my-repo'

  const url = encodeUrl(key, name)
  t.ok(url.startsWith('git+pear://'))

  const decoded = decodeUrl(url)
  t.alike(decoded.key, key)
  t.is(decoded.name, name)
})

test('createRemote and getRepo', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db = new PunchLocalDB({
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => db.close())
  await db.ready()

  const remote = await db.createRemote('test-repo')
  t.ok(remote.key, 'remote has a key')
  t.is(remote.name, 'test-repo')

  const found = await db.getRepo('test-repo')
  t.ok(found, 'found the repo')
  t.alike(found.key, remote.key, 'keys match')
})

test('push stores objects, branch, and files', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db = new PunchLocalDB({
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => db.close())
  await db.ready()

  const remote = await db.createRemote('push-test')
  const objects = makeTestObjects()

  await remote.push('main', OID_COMMIT, objects)

  // Check branch was stored
  const refs = await remote.getAllRefs()
  const main = refs.find((r) => r.ref === 'refs/heads/main')
  t.ok(main, 'main branch exists')
  t.is(main.oid, OID_COMMIT)

  // Check HEAD was synthesized
  const head = refs.find((r) => r.ref === 'HEAD')
  t.ok(head, 'HEAD exists')
  t.is(head.oid, OID_COMMIT)

  // Check objects were stored
  const blob = await remote.getObject(OID_BLOB1)
  t.ok(blob, 'blob stored')
  t.is(blob.type, 'blob')
  t.is(blob.data.toString(), 'hello world')
})

test('toDrive lists files and reads content', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db = new PunchLocalDB({
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => db.close())
  await db.ready()

  const remote = await db.createRemote('drive-test')
  const objects = makeTestObjects()
  await remote.push('main', OID_COMMIT, objects)

  const drive = await remote.toDrive('main')
  t.ok(drive, 'drive created')

  // List all files
  const paths = []
  for await (const path of drive.list('/')) {
    paths.push(path)
  }

  t.ok(paths.includes('/README.md'), 'has README.md')
  t.ok(paths.includes('/src/index.js'), 'has src/index.js')
  t.is(paths.length, 2)

  // Read file content
  const content = await drive.get('/README.md')
  t.is(content.toString(), 'hello world')
})

test('drive entry returns correct metadata', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db = new PunchLocalDB({
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => db.close())
  await db.ready()

  const remote = await db.createRemote('entry-test')
  const objects = makeTestObjects()
  await remote.push('main', OID_COMMIT, objects)

  const drive = await remote.toDrive('main')

  const entry = await drive.entry('/README.md')
  t.ok(entry, 'entry found')
  t.is(entry.key, '/README.md')
  t.is(entry.value.blob.byteLength, 11) // 'hello world'.length
  t.is(entry.value.executable, false)

  const missing = await drive.entry('/nope.txt')
  t.is(missing, null, 'missing entry returns null')
})

test('drive readdir returns immediate children', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db = new PunchLocalDB({
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => db.close())
  await db.ready()

  const remote = await db.createRemote('readdir-test')
  const objects = makeTestObjects()
  await remote.push('main', OID_COMMIT, objects)

  const drive = await remote.toDrive('main')

  const rootEntries = []
  for await (const name of drive.readdir('/')) {
    rootEntries.push(name)
  }

  t.ok(rootEntries.includes('README.md'), 'has README.md')
  t.ok(rootEntries.includes('src'), 'has src dir')
  t.is(rootEntries.length, 2)
})

test('getBranchRef returns null for missing branch', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db = new PunchLocalDB({
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => db.close())
  await db.ready()

  const remote = await db.createRemote('missing-branch')

  const ref = await remote.getBranchRef('nonexistent')
  t.is(ref, null)
})

test('toDrive returns null for missing branch', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db = new PunchLocalDB({
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => db.close())
  await db.ready()

  const remote = await db.createRemote('no-drive')

  const drive = await remote.toDrive('main')
  t.is(drive, null)
})
