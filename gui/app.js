const Console = require('bare-console')
const Corestore = require('corestore')
const { Coremachine, createMachine } = require('coremachine')

const target = require('#target')
const { app } = require('./views/main')
const { HTMLServer } = require('./adapters/html')
const { homedir } = require('bare-os')
const { join } = require('bare-path')

const { PunchLocalDB } = require('../lib/db/index.cjs')
const { Text } = require('cellery')
const { Repo } = require('./cells')

const console = new Console()
const store = new Corestore(join(homedir(), '.punch'))
const db = new PunchLocalDB({ store })

const machine = new Coremachine(
  store.namespace('gui'),
  createMachine({
    initial: 'home',
    context: {},
    states: {
      // this way we render on startup and nav
      home: {
        on: {
          enter: {
            action: async () => {
              console.log('home!')
              if (!db.opened) await db.ready()

              let found = false
              for await (const r of db.getRemotes()) {
                let clear = false
                if (!found) {
                  found = true
                  clear = true
                }

                const cell = new Repo({ repo: r })
                cell.render({ id: 'main', insert: 'beforeend', clear })
              }

              if (!found) {
                const cell = new Text({ value: 'No repos!' })
                cell.render({ id: 'main', insert: 'beforeend', clear: true })
              }
            }
          }
        }
      }
    }
  })
)

const server = new HTMLServer({ target, app, stream: machine })
server.ready().then(() => {
  console.log('Server ready')
})
