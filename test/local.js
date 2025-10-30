const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const tmp = require('test-tmp')
const Corestore = require('corestore')

const { PunchLocalDB } = require('../lib/db')
const { Ref } = require('../lib/ref')

test('replicates', async function (t) {
  const { bootstrap } = await createTestnet(3, t.teardown)

  const db1 = new PunchLocalDB({
    repo: 'test',
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })
  const db2 = new PunchLocalDB({
    repo: 'test',
    swarm: new Hyperswarm({ bootstrap }),
    store: await createStore(t)
  })

  t.teardown(() => {
    db1.close()
    db2.close()
  })

  await db1.ready()
  await db2.ready()

  const remote = await db1.createRemote('test')
  const remote2 = await db2.joinRemote('test', remote.key)

  const data = Buffer.from('hello world')
  const objectData = {
    type: 'blob',
    size: data.length,
    data
  }
  const writer = remote.pushObjects()
  writer.put('123', objectData)
  await writer.flush()
  await remote.putRef(new Ref('main', 'abc'), ['123'])

  await new Promise((resolve) => setTimeout(resolve, 1000))

  // await db2.getRemote('test')._bee.core.get(0)
  // await db2.getRemote('test')._bee.update()

  t.is(remote.availabePeers, 1, 'should have 1 peer')

  const objects = await remote2.getRefObjects('abc')

  t.is(objects.length, 1, 'should have 1 object')
  t.is(objects[0].id, '123', 'should have correct id')
  t.is(objects[0].type, 'blob', 'should have correct type')
  t.is(objects[0].size, 11, 'should have correct size')
  t.is(objects[0].data.toString(), 'hello world', 'should have correct data')
})

async function createStore(t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)
  t.teardown(() => store.close())
  return store
}
