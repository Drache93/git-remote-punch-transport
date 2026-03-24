const { header, summary, command, validate, arg } = require('paparam')
const { PunchLocalDB } = require('./lib/db')
const goodbye = require('graceful-goodbye')
const process = require('process')

const green = (text) => `\x1b[32m${text}\x1b[0m`

const db = new PunchLocalDB()

goodbye(async () => {
  await db.close()
})

const regexRepoName = /^[a-zA-Z0-9_-]+$/

const newRepo = command(
  'new',
  header('Create a new repository'),
  summary('Create a new Git repository using Git Remote Punch'),
  arg('name', 'Name of the repository'),
  validate(
    ({ args }) => args.name && regexRepoName.test(args.name),
    'Invalid repository name. Support alphanumeric characters, underscores, and hyphens.'
  ),
  async () => {
    await db.ready()

    const name = newRepo.args.name

    const remote = await db.createRemote(name)

    console.log(`Repository ${green(name)} created ${remote.url}`)

    await db.close()
  }
)

const listRepos = command(
  'list',
  header('List repositories'),
  summary('List all your available Git repositories'),
  async () => {
    await db.ready()

    const remotes = await db.openRemotes()
    for (const [name, remote] of remotes) {
      console.log(`* ${green(name)}`)
      console.log(`  Url: ${remote.url}`)
      console.log(`  Peers: ${remote.core.peers.length}`)
      console.log(`  Length: ${remote.core.length}`)
    }

    await db.close()
  }
)

const seedRemotes = command(
  'seed',
  header('Seed repositories'),
  summary('Seed all your available Git repositories'),
  async () => {
    await db.ready()

    const remotes = await db.openRemotes()
    for (const [name, remote] of remotes) {
      console.log(`Seeding ${green(name)}...`)

      remote.on('connection', () => {
        console.log('Peer connected to', name)
      })
    }
  }
)

const cmd = command(
  'punch',
  header('Git Remote the P2P way'),
  summary('Git Remote Punch allows you to manage your Git repositories. No servers, just Peers.'),
  newRepo,
  listRepos,
  seedRemotes,
  () => console.log(cmd.help())
)

cmd.parse(process.argv.slice(2))
