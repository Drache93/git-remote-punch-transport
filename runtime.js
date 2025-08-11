/** @typedef {import('pear-interface')} */

/* global Pear */

const { PunchLocalDB } = require('./lib/db')
const tui = require('./lib/tui')

const db = new PunchLocalDB({
  repo: 'test'
})

const setup = async () => {
  await db.ready()

  const repo = await db.getRepo('test')

  if (!repo) {
    await db.newRemote('test')
  }
}

Pear.teardown = async () => {
  await db.close()
}

// Create a screen object.
const screen = new tui.Tui()

// Show loading screen
const reposBox = new tui.Box(0, 0, '100%', '100%', { title: 'Repos', color: 'green', border: 'green' })
const loadingText = new tui.Text(0, 0, 'Loading...', { color: 'yellow', paddingX: 2, paddingY: 2 })
screen.append(reposBox)
screen.append(loadingText)

// screen.title = 'Punch Git'

// // Quit on Escape, q, or Control-C.
// screen.key(['escape', 'q', 'C-c'], async function (ch, key) {
//   return Pear.exit(0)
// })

setup().then(async () => {
  screen.remove(loadingText)

  if (db.remotes && db.remotes.length > 0) {
    db.remotes.forEach((repo, index) => {
      const repoText = new tui.Text(2, 2 + index, `• ${repo.name || 'Unnamed Repo'} - ${repo.remoteUrl}`, { color: 'yellow' })
      console.log(repo.remoteUrl)
      screen.append(repoText)
    })
  } else {
    const noReposText = new tui.Text(50, 50, 'No repos found', { color: 'yellow' })
    screen.append(noReposText)
  }

  // Add status text
  const statusText = new tui.Text(2, 90, `Total repos: ${db.remotes ? db.remotes.length : 0}`, { color: 'cyan' })
  screen.append(statusText)

  screen.render()
})

// Start the screen
// screen.render()
