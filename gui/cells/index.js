const { Cell, Text, cellery: html } = require('cellery')

class Repo extends Cell {
  repo = null

  constructor(opts = {}) {
    super(opts)
    this.repo = opts.repo
  }

  _render() {
    const res = html`
      <div id="repo-${this.repo.name}">
        <style>
          div {
            flex: 1 1 auto;
            padding: 0.5rem;
            color: #00c950;
            border: 1px solid #00c950;
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
          }

          div:hover {
            color: #00d3f2;
            border: 1px solid #00d3f2;
            cursor: pointer;
          }
        </style>

        <div>
          <span>${this.repo.name}</span>
          <span>${this.repo.core.length.toString()}</span>
        </div>
      </div>
    `

    return res
  }
}

class RepoHeader extends Cell {
  repo = null

  constructor(opts = {}) {
    super(opts)
    this.repo = opts.repo
  }

  _render() {
    const res = html`
      <div id="repo-${this.repo.name}">
        <style>
          div {
            flex: 1 1 auto;
            padding: 0.5rem;
            color: #00c950;
            border: 1px solid #00c950;
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            margin-bottom: 1rem;
          }
        </style>

        <div>
          <h1>${this.repo.name}</h1>
          <span>${this.repo.core.length.toString()}</span>
        </div>
      </div>
    `

    return res
  }
}

class DirEntry extends Cell {
  constructor(opts = {}) {
    super(opts)
    this.name = opts.name
    this.isDir = opts.isDir
  }

  _render() {
    const prefix = this.isDir ? '/' : ''

    const safeId = this.name.replace(/[^a-zA-Z0-9_-]/g, '_')

    return html`
      <div id="${(this.isDir ? 'dir-' : 'entry-') + safeId}">
        <style>
          div {
            padding: 0.2rem 0.35rem;
            color: #00c950;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.35rem;
          }

          div:hover {
            color: #ffffff;
            background: #0a1f0a;
          }
        </style>

        <div>
          <span>${prefix}${this.name}</span>
        </div>
      </div>
    `
  }
}

class BackButton extends Cell {
  constructor(opts = {}) {
    super(opts)
    this.path = opts.path || '/'
  }

  _render() {
    return html`
      <div id="back">
        <style>
          div {
            padding: 0.3rem 0.5rem;
            color: #00d3f2;
            cursor: pointer;
            border-bottom: 1px solid #1a5a2a;
            margin-bottom: 0.25rem;
          }

          div:hover {
            color: #ffffff;
          }
        </style>

        <div>
          <span>.. ${this.path}</span>
        </div>
      </div>
    `
  }
}

class FileContent extends Cell {
  constructor(opts = {}) {
    super(opts)
    this.fileName = opts.fileName || ''
    this.content = opts.content || null
    this.isText = opts.isText !== undefined ? opts.isText : true
  }

  _render() {
    const body = this.isText
      ? new Text({ value: this.content.trim(), pre: true })
      : new Text({ value: 'Binary file \n cannot display as text.', pre: true })

    return html`
      <div id="file-content">
        <style>
          .file-viewer {
            flex: 1 1 auto;
            overflow-y: auto;
            padding: 0.5rem;
          }

          .file-body {
            color: #c8c8c8;
            font-family: monospace;
            font-size: 0.8rem;
          }
        </style>

        <div class="file-viewer">
          <div class="${this.isText ? 'file-body' : 'file-body'}">${body}</div>
        </div>
      </div>
    `
  }
}

class FileTree extends Cell {
  constructor(opts = {}) {
    super(opts)
    this.drive = opts.drive
    this.currentPath = opts.currentPath || '/'
    this._entries = []
  }

  async load() {
    this._entries = []
    const dirs = new Set()
    const files = new Set()
    const prefix = this.currentPath === '/' ? '' : this.currentPath

    for await (const path of this.drive.list(this.currentPath)) {
      const rest = path.slice(prefix.length + 1)
      const name = rest.split('/')[0]

      if (rest.includes('/')) {
        dirs.add(name)
      } else {
        files.add(name)
      }
    }

    for (const name of dirs) this._entries.push({ name, isDir: true })
    for (const name of files) {
      if (!dirs.has(name)) this._entries.push({ name, isDir: false })
    }

    this._entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async navigate(folder) {
    this.currentPath = folder
    await this.load()
  }

  _render() {
    return html`
      <div id="${this.id}">
        <style>
          .tree-root {
            overflow-y: auto;
            height: 100%;
            flex: 1 1 auto;
            padding: 0.25rem;
          }
        </style>

        <div class="tree-root">
          ${this._entries.map((e) => new DirEntry({ name: e.name, isDir: e.isDir }))}
        </div>
      </div>
    `
  }
}

module.exports = { Repo, RepoHeader, FileTree, FileContent, DirEntry, BackButton }
