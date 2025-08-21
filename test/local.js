const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const tmp = require('test-tmp')
const Corestore = require('corestore')

const { PunchLocalDB } = require('../lib/db')

test('replicates', async function (t) {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const swarm1 = new Hyperswarm({ bootstrap })
  const swarm2 = new Hyperswarm({ bootstrap })

  const store1 = await createStore(t)
  const store2 = await createStore(t)

  const db1 = new PunchLocalDB({
    repo: 'test',
    swarm: swarm1,
    store: store1
  })
  const db2 = new PunchLocalDB({
    repo: 'test',
    swarm: swarm2,
    store: store2
  })

  t.teardown(() => {
    swarm1.destroy()
    swarm2.destroy()
    store1.close()
    store2.close()

    db1.close()
    db2.close()
  })

  await db1.ready()
  await db2.ready()

  const remote = await db1.createRemote('test')

  await db2.joinRemote('test', remote._db.core.key, remote._db.core.discoveryKey)

  const config1 = await db1.getRemote('test').getConfig()
  const config2 = await db2.getRemote('test').getConfig()

  t.alike(config1, config2, 'config should equal')

  // Add fake object
  const batch = await db1.getRemote('test')._blobs.batch()
  const buffer = Buffer.from('test')
  const id = await batch.put(buffer)

  const objectData = {
    oid: '123',
    blobId: id,
    type: 'blob',
    size: buffer.length,
    refOid: '789'
  }
  await db1.getRemote('test').addObject(objectData)
  await batch.flush()

  await db2.getRemote('test')._db.core.get(4)
  await db2.getRemote('test')._db.update()

  t.is(db2.getRemote('test').availabePeers, 1, 'should have 1 peer')

  await new Promise(resolve => setTimeout(resolve, 1000))

  t.pass('blobs updated')

  const objectResult = await db1.getRemote('test').getObject('123')
  t.alike(objectResult, objectData, 'object should equal')
  const blob = await db1.getRemote('test').getBlob(id)
  t.alike(blob, buffer, 'blob should equal')

  //  Check that the object is replicated
  const objectResult2 = await db2.getRemote('test').getObject('123')
  t.alike(objectResult2, objectData, 'object should equal from remote 2')

  t.alike(id, {
    blockOffset: 0,
    blockLength: 1,
    byteOffset: 0,
    byteLength: 4
  }, 'id should equal')

  await db2.getRemote('test')._blobs.core.update()

  const blob2 = await db2.getRemote('test').getBlob(id)
  t.alike(blob2, buffer, 'blob should equal from remote 2')
})

async function createStore (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)
  t.teardown(() => store.close())
  return store
}
