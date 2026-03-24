const Console = require('bare-console')
const Corestore = require('corestore')
const { Coremachine, createMachine } = require('coremachine')
const { homedir } = require('bare-os')
const { join } = require('bare-path')
const { HTMLServer } = require('cellery-html')
const { Text } = require('cellery')

const { PunchLocalDB } = require('../lib/db')

const target = require('#target')
const { Repo, FileTree, FileContent, RepoHeader, BackButton } = require('./cells')
const { app } = require('./views/main')
const { Transform } = require('streamx')

const console = new Console()
const store = new Corestore(join(homedir(), '.punch'))
const db = new PunchLocalDB({ store })

Error.stackTraceLimit = 100

function isLikelyText(buf) {
  const len = Math.min(buf.length, 8192)
  for (let i = 0; i < len; i++) {
    const b = buf[i]
    if (b === 0) return false // null byte → binary
    if (b < 0x08 && b !== 0x00) return false // low control chars (except null already caught)
  }
  return true
}

// Live state — not serialized into the machine context
let activeDrive = null
let activeTree = null
let activeRepo = null
const entryIdToName = new Map()
let pendingFileName = null

function registerEntryClicks(treeCell) {
  entryIdToName.clear()
  for (const entry of treeCell._entries) {
    const safeId = entry.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const id = (entry.isDir ? 'dir-' : 'entry-') + safeId
    entryIdToName.set(id, entry.name)
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
                cell.cellery.pub({ event: 'register', id: 'repo-' + r.name, targets: ['click'] })
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
          OPEN_FILE: {
            action: async () => {
              if (!activeDrive || !pendingFileName) return

              const prefix = activeTree.currentPath === '/' ? '/' : activeTree.currentPath + '/'
              const filePath = prefix + pendingFileName
              pendingFileName = null

              let content = null
              let isText = false

              try {
                const buf = await activeDrive.get(filePath)
                if (buf) {
                  isText = isLikelyText(buf)
                  if (isText) content = buf.toString('utf-8')
                }
              } catch (err) {
                content = 'Error reading file: ' + err.message
                isText = true
              }

              const cell = new FileContent({ fileName: filePath, content, isText })
              cell.render({ id: 'file-tree', insert: 'beforeend', clear: true })

              const back = new BackButton({ path: filePath })
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
          const name = entryIdToName.get(data.id)
          if (name) this.push({ action: 'OPEN_DIR', value: name })
        } else if (event === 'click' && data.id.startsWith('entry-')) {
          const name = entryIdToName.get(data.id)
          if (name) {
            pendingFileName = name
            this.push({ action: 'OPEN_FILE' })
          }
        } else if (event === 'click' && data.id.startsWith('repo-')) {
          this.push({ action: 'OPEN_REPO', value: data.id.slice(5) })
        } else if (event === 'click') {
          console.log('CLICK', data)
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
