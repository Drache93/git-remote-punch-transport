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

class RepoView extends Cell {
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

        <h1>${this.repo.name}</h1>
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

  _renderEntries(files) {
    const sorted = Object.values(files).sort((a, b) => {
      if (a.type === b.type) return a.path.localeCompare(b.path)
      return a.type === 'tree' ? -1 : 1
    })

    return sorted.map((entry) => {
      if (entry.type === 'tree') {
        return html`
          <div class="tree-entry tree-dir" id="dir-${entry.path}">
            <div class="tree-row">
              <span class="tree-icon">▸</span>
              <span class="tree-name">${entry.path}</span>
            </div>
          </div>
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

          .tree-dir > .tree-row > .tree-name {
            color: #00d3f2;
          }

          .tree-blob > .tree-row > .tree-name {
            color: #00c950;
          }

          .tree-blob:hover > .tree-row > .tree-name,
          .tree-dir:hover > .tree-row > .tree-name {
            color: #ffffff;
            cursor: pointer;
          }
        </style>

        <div class="tree-root">${this._renderEntries(this.files)}</div>
      </div>
    `
  }
}

module.exports = { Repo, RepoView, FileTree }
