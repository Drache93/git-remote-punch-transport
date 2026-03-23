const { Cell, cellery: html } = require('cellery')
const { PunchRemoteDB } = require('../../lib/db/remote2.cjs')

class Repo extends Cell {
  /** @type {PunchRemoteDB} */
  repo = null

  constructor(opts = {}) {
    super(opts)
    this.repo = opts.repo
  }

  _render() {
    const res = html`
      <div id="${this.repo.name}">
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
  /** @type {PunchRemoteDB} */
  repo = null

  constructor(opts = {}) {
    super(opts)
    this.repo = opts.repo
  }

  _render() {
    const res = html`
      <div id="${this.repo.name}">
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

class FileTree extends Cell {
  constructor(opts = {}) {
    super(opts)
    this.files = opts.files || {}
  }

  _renderEntries(files, parent = '') {
    const sorted = Object.values(files).sort((a, b) => {
      if (a.type === b.type) return a.path.localeCompare(b.path)
      return a.type === 'tree' ? -1 : 1
    })

    return sorted.map((entry) => {
      if (entry.type === 'tree') {
        return html`
          <detail class="tree-entry tree-dir">
            <summary class="tree-row">${entry.path.replace(parent + '/', '')}</summary>
            <div class="tree-children-wrap">${this._renderEntries(entry.files, entry.path)}</div>
          </detail>
        `
      }

      return html`
        <div class="tree-entry tree-blob">
          <div class="tree-row">
            <span class="tree-icon"> </span>
            <span class="tree-name">${entry.path}</span>
          </div>
        </div>
      `
    })
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

          details.tree-dir {
            border: 1px solid #1a5a2a;
            border-radius: 2px;
            margin-bottom: 0.25rem;
          }

          details.tree-dir[open] {
            border-color: #00c950;
          }

          details.tree-dir[open] > summary {
            border-bottom: 1px solid #1a5a2a;
            margin-bottom: 0.25rem;
            color: #00d3f2;
          }

          summary.tree-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0.35rem;
            padding: 0.2rem 0.35rem;
            color: #00c950;
            cursor: pointer;
            user-select: none;
            list-style: none;
          }

          summary.tree-row::before {
            content: '▸';
            color: #1a8a3a;
            width: 0.75rem;
            flex-shrink: 0;
            transition: transform 0.1s;
          }

          details[open] > summary.tree-row::before {
            content: '▾';
            color: #00c950;
          }

          summary.tree-row:hover {
            color: #ffffff;
            background: #0a1f0a;
          }

          .tree-children-wrap {
            padding-left: 0.75rem;
            border-left: 1px solid #1a5a2a;
          }

          .tree-blob.tree-entry {
            padding: 0.15rem 0.35rem;
          }

          .tree-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0.35rem;
            padding: 0.1rem 0;
          }

          .tree-icon {
            color: #1a8a3a;
            width: 0.75rem;
            flex-shrink: 0;
            padding-right: 0.5em;
          }

          .tree-blob > .tree-row > .tree-name {
            color: #00c950;
          }

          .tree-blob:hover > .tree-row > .tree-name {
            color: #ffffff;
            cursor: pointer;
          }
        </style>

        <div class="tree-root">${this._renderEntries(this.files)}</div>
      </div>
    `
  }
}

module.exports = { Repo, RepoHeader, FileTree }
