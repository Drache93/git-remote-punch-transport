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

  t.alike(config1, config2)
})

async function createStore (t) {
  const dir = await tmp(t)
  const store = new Corestore(dir)
  t.teardown(() => store.close())
  return store
}
