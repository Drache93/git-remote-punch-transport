const test = require('brittle')
const { Readable } = require('streamx')
const { Cell } = require('cellery')
const { Repo, RepoHeader, FileTree } = require('../../gui/cells')

// --- Helpers ---

function mockRepo (name) {
  return { name, core: { length: 42 } }
}

function mockDrive (paths) {
  return {
    list () {
      return Readable.from(paths)
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

test('FileTree builds nested tree from flat paths', (t) => {
  const drive = mockDrive([])
  const tree = new FileTree({ id: 'ft', drive })

  tree._paths = [
    '/README.md',
    '/src/index.js',
    '/src/lib/utils.js',
    '/package.json'
  ]

  const built = tree._buildTree()

  // Root level
  t.is(built['README.md'], null, 'README.md is a file')
  t.is(built['package.json'], null, 'package.json is a file')
  t.ok(built.src, 'src is a directory')

  // src/
  t.is(built.src['index.js'], null, 'src/index.js is a file')
  t.ok(built.src.lib, 'src/lib is a directory')

  // src/lib/
  t.is(built.src.lib['utils.js'], null, 'src/lib/utils.js is a file')
})

test('FileTree renders without error', (t) => {
  const drive = mockDrive([])
  const tree = new FileTree({ id: 'ft', drive })

  tree._paths = ['/a.txt', '/dir/b.txt']

  const rendered = tree._render()
  t.ok(rendered, 'renders')
  t.is(rendered.id, 'ft')
})

test('FileTree load populates paths from drive', async (t) => {
  const drive = mockDrive(['/one.txt', '/two/three.txt'])
  const tree = new FileTree({ id: 'ft', drive })

  await tree.load()

  t.is(tree._paths.length, 2)
  t.ok(tree._paths.includes('/one.txt'))
  t.ok(tree._paths.includes('/two/three.txt'))
})

test('FileTree empty drive renders without error', (t) => {
  const drive = mockDrive([])
  const tree = new FileTree({ id: 'ft', drive })

  const rendered = tree._render()
  t.ok(rendered, 'renders empty tree')
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
