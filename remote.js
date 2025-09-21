/** @typedef {import('pear-interface')} */

/* global Pear */

const readline = require('readline')
const cenc = require('compact-encoding')
const b4a = require('b4a')
const { PunchGit } = require('./lib/punch.js')
const { repoConfig } = require('./lib/messages.js')
const process = require('process')
const pipe = require('pear-pipe')()

// TODO: use this
const argv = process.argv.slice(0)
// args[0] == node
// args[1] == git-remote-punch location
// args[2] == --trusted
// args[3] == (link)
let remote = argv[4]
let url = argv[5]

// Get the config from the url
let config = {}
try {
  if (!url.includes('punch://')) {
    // Search for it in the args
    process.stderr.write('Searching for config...\n')
    const urlIdx = argv.findIndex((arg) => arg.startsWith('punch://'))
    url = argv[urlIdx]
    remote = argv[urlIdx - 1]

    if (!url) {
      process.abort('Punch url could not be found in args')
    }
  }

  // @todo do we need the `/<repo>` part?
  const value = url.replace('punch://', '').trim().split('/')[0]
  const configBuffer = b4a.from(value, 'hex')
  config = cenc.decode(repoConfig, configBuffer) || {}
} catch (error) {
  throw new Error(`Invalid punch url: ${url}: ${error.message}`)
}

const capabilities = () => {
  process.stdout.write('option\nfetch\npush\nlist\n\n')
}

// Git communicates with the remote helper using new line based protocol, check https://git-scm.com/docs/gitremote-helpers

const main = async (args) => {
  const crlfDelay = 30000

  const punch = new PunchGit({
    remote,
    ...config
  })

  Pear.teardown(async () => {
    await punch.close()
  })

  // Enable progress by default for better UX
  punch.setProgress(true)

  // TODO: Let erorrs explode for now
  punch._progressReporter.punching()
  await punch.ready()
  punch._progressReporter.punched(punch.remote)

  for await (const line of readline.createInterface({
    input: process.stdin,
    crlfDelay
  })) {
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
            case 'cloning':
              punch.setCloning(line.split(' ')[2] === 'true')
              break
            case 'followtags':
              // TODO: Handle this
              punch.setFollowTags(line.split(' ')[2] === 'true')
              break
          }
          process.stdout.write('ok\n')
        }
        break
      case 'list': {
        // list
        if (line === 'list') {
          await punch.listAndStoreRefs()
        } else {
          // list for-push
          await punch.listForPush()
        }
        break
      }
      case 'push': {
        const ref = line.split(' ')[1]

        punch.addPushRefs(ref)
        break
      }
      case 'fetch': {
        punch.prepareFetch(line.replace('fetch ', ''))

        break
      }
      case '': {
        if (punch.hasPendingFetch()) {
          await punch.fetch()
        } else {
          await punch.push()
        }
        pipe.end()
        break
      }
      default:
        console.error('Unexpected message:', line)
        pipe.end()
    }
  }

  punch._debug('Closing punch')
  await punch.close()
}

main(argv)
