import b4a from 'b4a'
import { FolderBack, getIcon } from './icons'
import { css } from './helpers'

class RepoFiles extends HTMLElement {
  #shadow = null
  #selectedDir = null
  #openFile = null
  #previousDir = []
  #remote = null

  constructor() {
    super()

    this.#shadow = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = css`
      body {
        display: flex;
        flex-flow: column nowrap;
        justify-content: center;
        width: 100%;
      }

      .hidden {
        display: none;
      }

      ul {
        padding-top: 24px;
        color: white;
        list-style-type: none;
        width: 100%;
        margin: 0 auto;
        display: flex;
        flex-flow: column nowrap;
        height: 100%;
        margin-inline: 0;
        padding-inline: 0;
      }
      li {
        padding: 4px 12px;
        border-top: 1px solid #bade5b;
        border-left: 1px solid #bade5b;
        border-right: 1px solid #bade5b;
        border-radius: 8px;
        display: flex;
        align-items: center;

        & > span {
          padding-left: 12px;
        }

        &.back-button {
          border-bottom: 1px solid #bade5b;
        }

        &.open-file {
          border: none;
          padding-bottom: 30px;
          flex: 1 1 100%;
          overflow: hidden;
          display: flex;
          flex-flow: column nowrap;
        }
      }
      li:not(.open-file):hover {
        background-color: rgba(186, 222, 91, 0.2);
        cursor: pointer;
      }
      li:not(.open-file):last-child {
        border-bottom: 1px solid #bade5b;
      }
      li.open-file pre {
        width: 100%;
        background-color: #333;
        color: white;
        border-radius: 10px;
        padding: 12px;
        height: 100%;
        overflow-y: auto;
      }
    `

    this.#shadow.appendChild(style)
  }

  #back() {
    if (this.#openFile) {
      this.#openFile = null
      this.#render()
      return
    }

    if (!this.#previousDir.length) return
    this.#selectedDir = this.#previousDir.pop()

    this.#render()
  }

  async connectedCallback() {
    this.#remote = globalThis.openedRemote

    const ref = this.getAttribute('ref') || 'main'
    const tree = await this.#remote.getBranchFileTree(ref)
    this.#selectedDir = tree

    this.#render()
  }

  #render() {
    let list = this.#shadow.querySelector('.list')
    if (!list) {
      list = document.createElement('ul')
      list.classList.add('list')
      this.#shadow.appendChild(list)
    }

    const nodes = []

    try {
      const items = Object.entries(this.#selectedDir.files).sort((a, b) => {
        if (a[1].type === 'tree' && b[1].type !== 'tree') return -1
        if (a[1].type === b[1].type && a[1].path.localeCompare(b[1].path)) return 1
        return 0
      })

      if (this.#previousDir.length || this.#openFile) {
        const item = document.createElement('li')
        item.classList.add('back-button')
        item.onclick = this.#back.bind(this)

        const icon = document.createElement('i')
        icon.innerHTML = FolderBack

        item.append(icon)
        nodes.push(item)
      }

      if (this.#openFile) {
        const item = document.createElement('li')
        item.classList.add(`open-file`)

        const pre = document.createElement('pre')
        pre.innerText = this.#openFile.content

        item.append(pre)
        nodes.push(item)

        return
      }

      for (const [k, v] of items) {
        const item = document.createElement('li')
        item.classList.add(`type-${v.type}`)

        const icon = document.createElement('i')
        icon.innerHTML = getIcon(v)
        const title = document.createElement('span')
        title.innerText = k
        item.append(icon, title)

        if (v.type === 'tree') {
          item.onclick = () => {
            this.#previousDir.push(this.#selectedDir)
            this.#selectedDir = v
            this.#render()
          }
        } else {
          item.onclick = async () => {
            const obj = await this.#remote.getObject(v.oid)

            this.#openFile = {
              ...item,
              content: b4a.toString(obj.data, 'utf-8')
            }

            this.#render()
          }
        }

        nodes.push(item)
      }
    } finally {
      list.replaceChildren(...nodes)
    }
  }
}

window.customElements.define('repo-files', RepoFiles)
