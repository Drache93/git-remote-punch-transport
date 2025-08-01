#!/usr/bin/env node

const readline = require('readline')
const { PunchGit } = require('./lib/punch.js')

// const GIT_PUNCH_SERVER_NAMESPACE = 'git-remote-punch'

// TODO: use this
const argv = process.argv.slice(0)
// const url = argv[3]
// const config = decodeUrl(url)

const capabilities = () => {
  process.stdout.write('option\nfetch\npush\nlist\n\n')
}

// Git communicates with the remote helper using new line based protocol, check https://git-scm.com/docs/gitremote-helpers

const main = async (args) => {
  const crlfDelay = 30000

  const punch = new PunchGit('./punch')

  await punch.ready()

  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay })) {
    const command = line.split(' ')[0]
    punch._verbose('Line: ' + line)

    switch (command) {
      case 'capabilities':
        capabilities()
        break
      case 'option':
        {
          const option = line.split(' ')[1]
          switch (option) {
            case 'verbosity':
              punch.setVerbosity(line.split(' ')[2])
              break
            case 'progress':
              punch.setProgress(line.split(' ')[2] === 'true')
              break
          }
          process.stdout.write('ok\n')
        }
        break
      case 'list':{
        // list
        if (line === 'list') {
          await punch.listAndStoreRefs()
        } else {
          // list for-push
          await punch.listForPush()
        }
        break
      }
      case 'push':
        // TODO: move to punch.js
        punch.addPushRefs(line.split(' ')[1])
        break
      case 'fetch': {
        await punch.prepareFetch(line.split(' '))

        break
      }
      case '':
        if (await punch.hasPendingFetch()) {
          await punch.fetch()
        } else {
          await punch.push()
        }
        break
      default:
        console.error('Unexpected message:', line)
        process.exit()
    }
  }

  await punch.close()
}

main(argv)
