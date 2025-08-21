/** @typedef {import('pear-interface')} */

/* global Pear */

const { PunchLocalDB } = require('./lib/db')
const { Tui, Box, Text, SelectableList, TextInput } = require('./lib/tui')

const db = new PunchLocalDB({
  repo: 'test'
})

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

const renderMainScreen = () => {
  screen.children = [reposBox]

  if (db.remotes && db.remotes.size > 0) {
    const title = new Text(2, 1, 'Your Repositories:', { color: 'bright', paddingX: 2 })
    screen.append(title)

    // Create selectable list with repositories
    repoList = new SelectableList(1, 2, '100%', db.remotes.size, {
      items: Array.from(db.remotes.values()).map(repo => ({
        name: `${repo.name} (${repo.availabePeers} peers)`,
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
    screen.append(noReposText)
  }

  // Add status text with navigation instructions
  const statusText = new Text(2, -2, `Total repos: ${db.remotes ? db.remotes.size : 0} | Use ↑/↓ to navigate, c to copy, n to create, q to quit`, { color: 'cyan' })
  screen.append(statusText)

  screen.render()
}

screen.onKey('n', () => {
  // create a new repo
  const newRepoModal = new Box(
    (width, height) => 0,
    (width, height) => (height * 0.25) + 2,
    '50%',
    3,
    { title: 'Create New Repository', color: 'green', border: 'green', clear: true }
  )
  screen.append(newRepoModal)

  const input = new TextInput(
    (width, height) => 1,
    (width, height) => (height * 0.25) + 3,
    '50%',
    1,
    { text: '', color: 'white', border: 'white', paddingX: 2, paddingY: 1, clear: true }
  )
  screen.append(input)

  let text = ''

  screen.setHandlingInput(async (key) => {
    // Escape
    if (key === 'q' || key === '\u001b' || key === '\u0003') {
      screen.remove(newRepoModal)
      screen.remove(input)
      screen.setHandlingInput(null)
      screen.render()
    }

    // Enter
    if (key === '\r') {
      screen.setHandlingInput(null)
      screen.remove(input)
      const loading = new Text((width, height) => 1,
        (width, height) => (height * 0.25) + 3, 'Creating...', { color: 'yellow' })
      screen.append(loading)
      screen.render()

      // create a new repo
      db.createRemote(text).then(() => {
        screen.remove(newRepoModal)
        screen.remove(loading)
        screen.render()

        renderMainScreen()
      })
    }

    // backspace
    if (key === '\u007f') {
      text = text.slice(0, -1)
    } else {
      text += key
    }

    input.text = text
    screen.render()
  })

  screen.render()
})

const main = async () => {
  await db.ready()

  db.on('connection', (conn) => {
    screen.render()
  })

  renderMainScreen()
}

main()
