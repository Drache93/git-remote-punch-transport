const { PunchLocalDB } = require('./lib/db/index.js')
const { decodeUrl } = require('./lib/messages.js')

const url = 'git+pear://somez32encodedkey/punch'
const config = decodeUrl(url)

const local = new PunchLocalDB()

const main = async () => {
  await local.ready()
  const remote = await local.joinRemote(config.name, config.key)

  console.log(remote.availablePeers)
  console.log(remote.core)
}

main()
