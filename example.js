const { GipLocalDB } = require('./lib/db/index.js')
const { GitPearLink } = require('gip-remote')

const url = 'git+pear://somez32encodedkey/example'
const config = GitPearLink.parse(url)

const local = new GipLocalDB()

const main = async () => {
  await local.ready()
  const remote = await local.openRemote(url)

  console.log(remote.availablePeers)
  console.log(remote.core)
}

main()
