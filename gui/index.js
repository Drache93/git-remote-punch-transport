/** @typedef {import('pear-interface')} */ /* global Pear */
import { PunchLocalDB } from '../lib/db'
import goodbye from 'graceful-goodbye'

// import GitPearLink from './links'
import { html } from './components/helpers'

// Register components
import './components'

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
            <input class="join-remote" placeholder="Join a remote"></input>
            <remotes-list></remotes-list>
            </>`}
    </main>
  `
}

async function loadRemote(url) {
  const [key, name] = url.slice(12).split('/')
  const remote = await globalThis.db.openRemote(name, key)

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
