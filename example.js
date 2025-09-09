const cenc = require('compact-encoding')
const b4a = require('b4a')
const { repoConfig } = require('./lib/messages.js')
const { PunchLocalDB } = require('./lib/db/index.js')

const configBuffer = b4a.from(
  '0200002dd1e5bc519d005e0ca74b9e3a0719549371cb9547f6672c69aba0d5b3cfc56f0570756e636800',
  'hex'
)
const config = cenc.decode(repoConfig, configBuffer)

const local = new PunchLocalDB()

const main = async () => {
  await local.ready()
  const remote = await local.joinRemote('punch', config.key)

  console.log(remote.availabePeers)
  console.log(remote._db.core)
}

main()
