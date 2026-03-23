const Console = require('bare-console')
const Corestore = require('corestore')
const { Coremachine, createMachine } = require('coremachine')
const { homedir } = require('bare-os')
const { join } = require('bare-path')
const { HTMLServer } = require('cellery-html')
const { Text } = require('cellery')

const { PunchLocalDB } = require('../lib/db/index.cjs')

const target = require('#target')
const { Repo, RepoView, FileTree, RepoHeader } = require('./cells')
const { app } = require('./views/main')
const { Transform } = require('streamx')

const console = new Console()
const store = new Corestore(join(homedir(), '.punch'))
const db = new PunchLocalDB({ store })

Error.stackTraceLimit = 100

const ns = store.namespace('gui')
const machine = new Coremachine(
  ns.get({ name: 'git-remote', valueEncoding: 'json' }),
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
                cell.cellery.pub({ event: 'register', id: r.name, targets: ['click'] })
              }

              if (!found) {
                const cell = new Text({ value: 'No repos!' })
                cell.render({ id: 'main', insert: 'beforeend', clear: true })
              }
            }
          },
          OPEN_REPO: {
            target: 'openRepo',
            action: async (ctx, repoName) => {
              ctx.openRepo = repoName
            }
          }
        }
      },
      openRepo: {
        on: {
          enter: {
            action: async (ctx) => {
              console.log('openRepo!', ctx)
              if (!db.opened) await db.ready()

              for await (const repo of db.getRemotes({ name: ctx.openRepo }, { limit: 1 })) {
                const cell = new RepoHeader({ repo })
                cell.render({ id: 'main', insert: 'beforeend', clear: true })

                const fileTree = await repo.getBranchFileTree('main')
                const treeCell = new FileTree({ id: 'file-tree', files: fileTree.files })
                treeCell.render({ id: 'main', insert: 'beforeend' })

                for (const f of Object.values(fileTree.files)) {
                  if (f.type !== 'tree') continue
                  treeCell.cellery.pub({
                    event: 'register',
                    id: `dir-${f.path}`,
                    targets: ['click']
                  })
                }
              }
            }
          }
        }
      }
    }
  })
)

const server = new HTMLServer({
  target,
  app,
  streams: [
    new Transform({
      transform(msg, cb) {
        const { event, data } = JSON.parse(msg.toString('utf-8'))

        // @todo need a way to handle these at the cell

        if (event === 'click' && data.id.startsWith('dir-')) {
          console.log('CLICK', data)
        } else if (event === 'click') {
          console.log('CLICK', data)
          this.push({ action: 'OPEN_REPO', value: data.id })
        }

        cb()
      }
    }),
    machine
  ],
  onerror: console.error
})
server.ready().then(() => {
  console.log('Server ready')
})
