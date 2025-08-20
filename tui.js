/** @typedef {import('pear-interface')} */

/* global Pear */

const { PunchLocalDB } = require('./lib/db')
const { Tui, Box, Text, SelectableList } = require('./lib/tui')

const db = new PunchLocalDB({
  repo: 'test'
})

const setup = async () => {
  await db.ready()

  const repo = await db.getRepo('test')

  if (!repo) {
    await db.createRemote('test')
  }
}

Pear.teardown = async () => {
  await db.close()
}

// Create a screen object and enter full-screen mode
const screen = new Tui()

// Enter full-screen mode
screen.enterFullScreen()

// Show loading screen
const reposBox = new Box(0, 0, '100%', '100%', { title: 'Git Remote Punch', color: 'cyan', border: 'blue' })
const loadingText = new Text(2, 2, 'Loading repositories...', { color: 'yellow' })
screen.append(reposBox)
screen.append(loadingText)
screen.render()

// Create selectable list for repositories
let repoList = null

// Set up keyboard handlers
screen.onKey('q', () => {
  screen.exitFullScreen()
  Pear.exit(0)
})

screen.onKey('\u001b', () => { // Escape
  screen.exitFullScreen()
  Pear.exit(0)
})

screen.onKey('\u001b[A', () => { // Up arrow
  if (repoList) {
    repoList.selectPrevious()
    screen.render()
  }
})

screen.onKey('\u001b[B', () => { // Down arrow
  if (repoList) {
    repoList.selectNext()
    screen.render()
  }
})

screen.onKey('c', () => {
  if (repoList) {
    repoList.copySelected()
  }
})

// screen.onKey('n', () => {
//   // create a new repo
//   const newRepoModal = new Box(
//     (width, height) => 0,
//     (width, height) => height * 0.25,
//     '50%',
//     10,
//     { title: 'Create New Repository', color: 'cyan', border: 'blue', clear: true }
//   )
//   screen.append(newRepoModal)
//   screen.render()
// })

setup().then(async () => {
  screen.remove(loadingText)

  if (db.remotes && db.remotes.length > 0) {
    const title = new Text(2, 1, 'Your Repositories:', { color: 'bright', paddingX: 2 })
    screen.append(title)

    // Create selectable list with repositories
    repoList = new SelectableList(1, 2, '100%', db.remotes.length, {
      items: db.remotes.map(repo => ({
        name: repo.name,
        value: repo.remoteUrl
      })),
      onCopy: (selectedRepo) => {
        screen.copyToClipboard(selectedRepo.value)

        // Show feedback
        const feedbackText = new Text(2, -4, `Copied: ${selectedRepo.name} url`, { color: 'green' })
        screen.append(feedbackText)
        screen.render()

        // Remove feedback after 2 seconds
        setTimeout(() => {
          screen.remove(feedbackText)
          screen.render()
        }, 2000)
      }
    })
    screen.append(repoList)
  } else {
    const noReposText = new Text(2, 2, 'No repositories found', { color: 'yellow', paddingX: 2 })
    const addRepoText = new Text(2, 4, 'Use "git remote add punch punch://<key>" to add a repository', { color: 'cyan', paddingX: 2 })
    screen.append(noReposText)
    screen.append(addRepoText)
  }

  // Add status text with navigation instructions
  const statusText = new Text(2, -2, `Total repos: ${db.remotes ? db.remotes.length : 0} | Use ↑/↓ to navigate, c to copy, q to quit`, { color: 'cyan' })
  screen.append(statusText)

  screen.render()
})
