import b4a from 'b4a'
import { GitObject } from '../lib/db/remote2.cjs'
import cenc from 'compact-encoding'

const css = (value) => value

class RemotesList extends HTMLElement {
  #shadow = null
  #selectedDir = null
  #previousDir = null
  #remote = null

  constructor() {
    super()

    this.#shadow = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = css`
      body {
        color: rgb(255, 255, 254);
        font-family: 'abcFavorit', 'abcFavorit Fallback', system-ui, arial;
      }

      .hidden {
        display: none;
      }

      ul {
        color: white;
        list-style-type: none;
      }
      li {
        padding: 10px;
        margin-bottom: 6px;
        border: 1px solid #bade5b;
        border-radius: 10px;
      }
      li:hover {
        background-color: rgba(186, 222, 91, 0.2);
        cursor: pointer;
      }
      li.type-tree {
        background-color: rgba(186, 222, 91, 0.4);
      }
      li.type-tree:hover {
        background-color: rgba(186, 222, 91, 0.8);
      }

      pre {
        background-color: #ccc;
        border-radius: 10px;
        padding: 12px;
        margin: 20px;
      }
    `

    this.#shadow.appendChild(style)

    const backButton = document.createElement('button')
    backButton.innerHTML = '<'
    backButton.onclick = () => {
      const pre = this.#shadow.querySelector('pre')

      if (pre) {
        const list = this.#shadow.querySelector('.list')
        if (list) list.classList.remove('hidden')

        this.#shadow.removeChild(pre)

        return
      }

      if (!this.#previousDir) return
      this.#selectedDir = this.#previousDir
      this.#previousDir = null
      this.#render()
    }
    this.#shadow.appendChild(backButton)
  }

  async connectedCallback() {
    if (!globalThis.db.opened) await globalThis.db.ready()

    const remotes = await db.openRemotes()
    this.#remote = remotes.get('punch')

    const tree = await this.#remote.getBranchFileTree('main')
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

    const items = Object.entries(this.#selectedDir.files).sort((a, b) => {
      if (a[1].type === 'tree' && b[1].type !== 'tree') return -1
      if (a[1].type === b[1].type && a[1].path.localeCompare(b[1].path)) return 1
      return 0
    })

    console.log(items)

    const nodes = []

    for (const [k, v] of items) {
      const item = document.createElement('li')
      item.innerText = k
      item.classList.add(`type-${v.type}`)

      if (v.type === 'tree') {
        item.onclick = () => {
          this.#previousDir = this.#selectedDir
          this.#selectedDir = v
          this.#render()
        }
      } else {
        item.onclick = async () => {
          const obj = await this.#remote.getObject(v.oid)

          const pre = document.createElement('pre')
          pre.innerText = b4a.toString(obj.data, 'utf-8')

          list.classList.add('hidden')

          this.#shadow.appendChild(pre)
        }
      }

      nodes.push(item)
    }

    list.replaceChildren(...nodes)
  }
}

window.customElements.define('remotes-list', RemotesList)
