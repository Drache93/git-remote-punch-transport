const readline = require('readline')
const { PunchGit } = require('./lib/punch.js')
const { decodeUrl } = require('./lib/messages.js')
const goodbye = require('graceful-goodbye')
const process = require('process')

const argv = process.argv.slice(0)
// args[0] == node
// args[1] == git-remote-punch location
// args[2] == remote name
// args[3] == url
let remote = argv[2]
let url = argv[3]

if (!url) {
  console.error('Remote url required')
  process.exit(1)
}

let config = {}
try {
  if (!url.includes('git+pear://')) {
    const urlIdx = argv.findIndex((arg) => arg.startsWith('git+pear://'))
    url = argv[urlIdx]
    remote = argv[urlIdx - 1]

    if (!url) {
      console.error('Remote url could not be found in args')
      process.exit(1)
    }
  }

  config = decodeUrl(url)
} catch (error) {
  throw new Error(`Invalid remote url: ${url}: ${error.message}`)
}

const capabilities = () => {
  process.stdout.write('option\nfetch\npush\nlist\n\n')
}

const main = async () => {
  const crlfDelay = 30000

  const punch = new PunchGit({
    remote,
    ...config
  })

  goodbye(async () => {
    await punch.close()
  })

  punch.setProgress(true)

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
              punch.setFollowTags(line.split(' ')[2] === 'true')
              break
          }
          process.stdout.write('ok\n')
        }
        break
      case 'list': {
        if (line === 'list') {
          await punch.listAndStoreRefs()
        } else {
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
        break
      }
      default:
        console.error('Unexpected message:', line)
    }
  }

  punch._debug('Closing punch')
  await punch.close()
}

main()
