const Corestore = require('corestore')
const Localdrive = require('localdrive')
const { homedir } = require('bare-os')
const { join } = require('bare-path')
const { GipLocalDB } = require('./lib/db')

const store = new Corestore(join(homedir(), '.gip'))
const db = new GipLocalDB({ store })

async function main() {
  await db.ready()

  for await (const repo of db.getRemotes()) {
    const local = new Localdrive(repo.name)
    const drive = await repo.toDrive('main')
    const mirror = drive.mirror(local)
    await mirror.done()
  }

  await db.close()
}

main()
