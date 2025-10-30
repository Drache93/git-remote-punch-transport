/** @typedef {import('pear-interface')} */
/* global Pear */

const { header, summary, command, flag, arg } = require('paparam')
const { PunchLocalDB } = require('./lib/db')
const goodbye = require('graceful-goodbye')

const green = (text) => `\x1b[32m${text}\x1b[0m`

const db = new PunchLocalDB()

goodbye(async () => {
  await db.close()
})

const newRepo = command(
  'new',
  header('Create a new repository'),
  summary('Create a new Git repository using Git Remote Punch'),
  arg('name', 'Name of the repository'),
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
      console.log(`${green(name)} - ${remote.url}`)
    }

    await db.close()
  }
)

const cmd = command(
  'punch',
  header('Git Remote the P2P way'),
  summary('Git Remote Punch allows you to manage your Git repositories. No servers, just Peers.'),
  newRepo,
  listRepos
)

cmd.parse()
