const Console = require('bare-console')
const Corestore = require('corestore')
const { Coremachine, createMachine } = require('coremachine')
const { homedir } = require('bare-os')
const { join } = require('bare-path')
const { HTMLServer } = require('cellery-html')
const { Text } = require('cellery')

const { PunchLocalDB } = require('../lib/db')

const target = require('#target')
const { Repo, FileTree, RepoHeader, BackButton } = require('./cells')
const { app } = require('./views/main')
const { Transform } = require('streamx')

const console = new Console()
const store = new Corestore(join(homedir(), '.punch'))
const db = new PunchLocalDB({ store })

Error.stackTraceLimit = 100

// Live state — not serialized into the machine context
let activeDrive = null
let activeTree = null
let activeRepo = null

function registerEntryClicks(treeCell) {
  for (const entry of treeCell._entries) {
    const id = (entry.isDir ? 'dir-' : 'file-') + entry.name
    treeCell.cellery.pub({ event: 'register', id, targets: ['click'] })
  }
}

const ns = store.namespace('gui')
const machine = new Coremachine(
  ns.get({ name: 'git-remote', valueEncoding: 'json' }),
  createMachine({
    initial: 'home',
    context: {},
    states: {
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
              if (activeTree && activeRepo === ctx.openRepo) return

              console.log('openRepo!', ctx)
              if (!db.opened) await db.ready()
              activeRepo = ctx.openRepo

              for await (const repo of db.getRemotes({ name: ctx.openRepo }, { limit: 1 })) {
                const cell = new RepoHeader({ repo })
                cell.render({ id: 'main', insert: 'beforeend', clear: true })

                const drive = await repo.toDrive('main')
                if (!drive) return

                activeDrive = drive
                activeTree = new FileTree({ id: 'file-tree', drive })
                await activeTree.load()
                activeTree.render({ id: 'main', insert: 'beforeend' })
                registerEntryClicks(activeTree)
              }
            }
          },
          OPEN_DIR: {
            action: async (ctx, dirName) => {
              if (!activeTree) return

              const prefix = activeTree.currentPath === '/' ? '/' : activeTree.currentPath + '/'
              const folder = prefix + dirName

              await activeTree.navigate(folder)
              activeTree.render()
              registerEntryClicks(activeTree)

              const back = new BackButton({ path: activeTree.currentPath })
              back.render({ id: 'file-tree', insert: 'afterbegin' })
              back.cellery.pub({ event: 'register', id: 'back', targets: ['click'] })
            }
          },
          BACK: {
            action: async () => {
              if (!activeTree) return

              const parts = activeTree.currentPath.split('/')
              parts.pop()
              const parent = parts.join('/') || '/'

              await activeTree.navigate(parent)
              activeTree.render()
              registerEntryClicks(activeTree)

              if (parent !== '/') {
                const back = new BackButton({ path: parent })
                back.render({ id: 'file-tree', insert: 'afterbegin' })
                back.cellery.pub({ event: 'register', id: 'back', targets: ['click'] })
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
        console.log('event', msg)
        const { event, data } = JSON.parse(msg.toString('utf-8'))

        if (event === 'click' && data.id === 'back') {
          this.push({ action: 'BACK' })
        } else if (event === 'click' && data.id.startsWith('dir-')) {
          const dirName = data.id.slice(4)
          this.push({ action: 'OPEN_DIR', value: dirName })
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
