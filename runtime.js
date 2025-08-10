/** @typedef {import('pear-interface')} */

/* global Pear */

const { PunchLocalDB } = require('./lib/db')
const { Screen, Box, Text, colors } = require('./lib/tui')

const db = new PunchLocalDB({
  repo: 'test'
})

const setup = async () => {
  await db.ready()

  const repo = await db.getRepo('test')

  console.log('Remotes', db.remotes.length)

  if (!repo) {
    await db.newRemote('test')
  }
}

Pear.teardown = async () => {
  await db.close()
}

// Create a screen object.
const screen = new Screen()

screen.title = 'Punch Git'

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], async function (ch, key) {
  return Pear.exit(0)
})

setup().then(async () => {
  screen.clear()

  // Create main box
  const box = new Box(0, 0, '100%', '100%', 'Repos')
  screen.append(box)

  if (db.remotes && db.remotes.length > 0) {
    db.remotes.forEach((repo, index) => {
      const repoText = new Text(2, 2 + index, `• ${repo.name || 'Unnamed Repo'} - ${repo.remoteUrl}`, colors.green)
      screen.append(repoText)
    })
  } else {
    const noReposText = new Text(50, 50, 'No repos found', colors.yellow)
    screen.append(noReposText)
  }

  // Add status text
  const statusText = new Text(2, 90, `Total repos: ${db.remotes ? db.remotes.length : 0}`, colors.cyan)
  screen.append(statusText)
})

// Show loading screen
const loadingBox = new Box(0, 0, '100%', '100%', '')
const loadingText = new Text('50%', '50%', 'Loading...', colors.yellow)
screen.append(loadingBox)
screen.append(loadingText)

// Start the screen
screen.start()
