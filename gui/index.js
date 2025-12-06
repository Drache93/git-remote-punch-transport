/** @typedef {import('pear-interface')} */ /* global Pear */
import { PunchLocalDB } from '../lib/db'
import goodbye from 'graceful-goodbye'

// import GitPearLink from './links'
import { html } from './components/helpers'

// Register components
import './components'
import { decodeUrl } from '../lib/messages'

console.log('route', Pear.app.query)

const db = new PunchLocalDB()

goodbye(async () => {
  await db.close()
})

await db.ready()
globalThis.db = db

if (Pear.app.query) {
  // const link = GitPearLink.parse(Pear.app.query)
  globalThis.openedRemote = await loadRemote(Pear.app.query) // TODO use link
}

// -- Need to wait for db to be available

// TODO: move to component
function render() {
  document.querySelector('main').outerHTML = html`
    <main>
      ${globalThis.openedRemote
        ? html`<div>
            <remote-details></remote-details>
            <hr />
            <repo-files ref="main"></repo-files>
          </div>`
        : html`<div>
            <add-remote></add-remote>
            <remotes-list></remotes-list>
          </div>`}
    </main>
  `
}

async function loadRemote(url) {
  const config = decodeUrl(url)
  console.log('loading', config)
  const remote = await globalThis.db.openRemote(config)

  return remote
}

document.addEventListener('navigate', async (event) => {
  if (globalThis.openedRemote) {
    // await globalThis.openedRemote.close() TODO
  }

  globalThis.openedRemote = event.detail === '/' ? null : await loadRemote(event.detail)

  render()
})

render()
