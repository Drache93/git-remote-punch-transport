const test = require('brittle')
const { Readable } = require('streamx')
const { Cell } = require('cellery')
const { Repo, RepoHeader, FileTree, DirEntry, BackButton } = require('../../gui/cells')

// --- Helpers ---

function mockRepo (name) {
  return { name, core: { length: 42 } }
}

function mockDrive (files) {
  return {
    readdir (folder) {
      const prefix = !folder || folder === '/' ? '/' : folder + '/'
      const seen = new Set()
      const entries = []

      for (const f of files) {
        const rest = prefix === '/' ? f.slice(1) : f.startsWith(prefix) ? f.slice(prefix.length) : null
        if (rest === null) continue
        const name = rest.split('/')[0]
        if (!seen.has(name)) {
          seen.add(name)
          entries.push(name)
        }
      }

      return Readable.from(entries)
    },
    list (folder) {
      const prefix = !folder || folder === '/' ? '/' : folder
      const matched = files.filter((f) => prefix === '/' || f.startsWith(prefix))
      return Readable.from(matched)
    }
  }
}

// --- Tests ---

test('Repo cell renders with repo name', (t) => {
  const repo = mockRepo('my-repo')
  const cell = new Repo({ repo })

  t.ok(cell instanceof Cell)
  t.is(cell.repo.name, 'my-repo')

  const rendered = cell._render()
  t.ok(rendered, 'renders without error')
  t.is(rendered.id, 'my-repo', 'root element has repo name as id')
})

test('RepoHeader cell renders with repo name', (t) => {
  const repo = mockRepo('header-repo')
  const cell = new RepoHeader({ repo })

  t.ok(cell instanceof Cell)

  const rendered = cell._render()
  t.ok(rendered, 'renders without error')
  t.is(rendered.id, 'header-repo')
})

test('Repo list renders multiple repos', (t) => {
  const repos = ['alpha', 'beta', 'gamma'].map(mockRepo)
  const cells = repos.map((repo) => new Repo({ repo }))

  t.is(cells.length, 3)

  for (let i = 0; i < cells.length; i++) {
    const rendered = cells[i]._render()
    t.is(rendered.id, repos[i].name)
  }
})

test('DirEntry renders directory with prefix', (t) => {
  const cell = new DirEntry({ name: 'src', isDir: true })
  const rendered = cell._render()
  t.ok(rendered)
  t.is(rendered.id, 'dir-src')
})

test('DirEntry renders file without prefix', (t) => {
  const cell = new DirEntry({ name: 'index.js', isDir: false })
  const rendered = cell._render()
  t.ok(rendered)
  t.is(rendered.id, 'file-index.js')
})

test('BackButton renders with path', (t) => {
  const cell = new BackButton({ path: '/src' })
  const rendered = cell._render()
  t.ok(rendered)
  t.is(rendered.id, 'back')
})

test('FileTree loads root directory entries', async (t) => {
  const drive = mockDrive(['/README.md', '/src/index.js', '/src/lib/utils.js', '/package.json'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.load()

  t.is(tree.currentPath, '/')
  t.is(tree._entries.length, 3) // README.md, src, package.json

  const dirs = tree._entries.filter((e) => e.isDir)
  const files = tree._entries.filter((e) => !e.isDir)

  t.is(dirs.length, 1)
  t.is(dirs[0].name, 'src')
  t.is(files.length, 2)
})

test('FileTree navigate changes directory', async (t) => {
  const drive = mockDrive(['/README.md', '/src/index.js', '/src/lib/utils.js'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.navigate('/src')

  t.is(tree.currentPath, '/src')
  t.is(tree._entries.length, 2) // index.js, lib

  const dirs = tree._entries.filter((e) => e.isDir)
  const files = tree._entries.filter((e) => !e.isDir)

  t.is(dirs.length, 1)
  t.is(dirs[0].name, 'lib')
  t.is(files.length, 1)
  t.is(files[0].name, 'index.js')
})

test('FileTree navigate deeper then back', async (t) => {
  const drive = mockDrive(['/src/lib/utils.js', '/src/lib/helpers.js', '/src/index.js'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.navigate('/src/lib')
  t.is(tree._entries.length, 2) // utils.js, helpers.js
  t.ok(tree._entries.every((e) => !e.isDir))

  await tree.navigate('/src')
  t.is(tree.currentPath, '/src')
  const dirs = tree._entries.filter((e) => e.isDir)
  t.is(dirs.length, 1)
  t.is(dirs[0].name, 'lib')
})

test('FileTree renders entries as DirEntry cells', async (t) => {
  const drive = mockDrive(['/a.txt', '/dir/b.txt'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.load()

  const rendered = tree._render()
  t.ok(rendered)
  t.is(rendered.id, 'ft')
})

test('FileTree empty directory renders without error', async (t) => {
  const drive = mockDrive([])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.load()

  const rendered = tree._render()
  t.ok(rendered, 'renders empty tree')
  t.is(tree._entries.length, 0)
})

test('FileTree sorts dirs before files', async (t) => {
  const drive = mockDrive(['/zebra.txt', '/alpha/file.js', '/beta.txt'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.load()

  t.is(tree._entries[0].name, 'alpha')
  t.is(tree._entries[0].isDir, true)
  t.is(tree._entries[1].name, 'beta.txt')
  t.is(tree._entries[1].isDir, false)
})

test('DirEntry ids match click registration pattern', async (t) => {
  const drive = mockDrive(['/src/index.js', '/readme.txt'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.load()

  const dirEntry = tree._entries.find((e) => e.isDir)
  const fileEntry = tree._entries.find((e) => !e.isDir)

  t.ok(dirEntry, 'has a dir entry')
  t.ok(fileEntry, 'has a file entry')

  // These ids are what app.js registers for clicks and matches in the transform
  const dirId = 'dir-' + dirEntry.name
  const fileId = 'file-' + fileEntry.name

  t.ok(dirId.startsWith('dir-'), 'dir id matches dir- prefix')
  t.ok(!fileId.startsWith('dir-'), 'file id does not match dir- prefix')

  // Verify DirEntry renders with the correct id
  const dirCell = new DirEntry({ name: dirEntry.name, isDir: true })
  t.is(dirCell._render().id, dirId)

  const fileCell = new DirEntry({ name: fileEntry.name, isDir: false })
  t.is(fileCell._render().id, fileId)
})

test('navigate simulates full open-dir flow', async (t) => {
  const drive = mockDrive([
    '/README.md',
    '/src/index.js',
    '/src/lib/utils.js',
    '/src/lib/deep/nested.js',
    '/package.json'
  ])

  const tree = new FileTree({ id: 'ft', drive })

  // Initial load at root
  await tree.load()
  t.is(tree._entries.length, 3) // README.md, src, package.json
  const srcEntry = tree._entries.find((e) => e.name === 'src')
  t.ok(srcEntry.isDir)

  // Simulate OPEN_DIR: compute folder path the way app.js does
  const prefix1 = tree.currentPath === '/' ? '/' : tree.currentPath + '/'
  const folder1 = prefix1 + 'src'
  await tree.navigate(folder1)

  t.is(tree.currentPath, '/src')
  t.is(tree._entries.length, 2) // index.js, lib
  const libEntry = tree._entries.find((e) => e.name === 'lib')
  t.ok(libEntry.isDir)

  // Go deeper
  const prefix2 = tree.currentPath + '/'
  const folder2 = prefix2 + 'lib'
  await tree.navigate(folder2)

  t.is(tree.currentPath, '/src/lib')
  t.is(tree._entries.length, 2) // deep, utils.js
  const deepEntry = tree._entries.find((e) => e.name === 'deep')
  t.ok(deepEntry.isDir)

  // Simulate BACK: pop path segment
  const parts = tree.currentPath.split('/')
  parts.pop()
  const parent = parts.join('/') || '/'
  await tree.navigate(parent)

  t.is(tree.currentPath, '/src')
  t.is(tree._entries.length, 2)
})

test('navigate to root has no back button needed', async (t) => {
  const drive = mockDrive(['/a.txt'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.load()
  t.is(tree.currentPath, '/')

  // At root, no back button needed
  const needsBack = tree.currentPath !== '/'
  t.is(needsBack, false)

  // Navigate into a dir then back to root
  await tree.navigate('/somedir')
  t.is(tree.currentPath !== '/', true)

  const parts = tree.currentPath.split('/')
  parts.pop()
  const parent = parts.join('/') || '/'
  await tree.navigate(parent)
  t.is(tree.currentPath, '/')
  t.is(tree.currentPath !== '/', false, 'back at root, no back button')
})
