import { html } from './helpers'
import { getIcon, Peers } from './icons'

const css = (value) => value

class Remotes extends HTMLElement {
  #shadow = null
  #remotes = []

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
        color: white;
        list-style-type: none;
        width: 100%;
        display: flex;
        flex-flow: column nowrap;
        height: 100%;
        margin-inline: 0;
        padding-inline: 0;
      }
      li {
        padding: 12px 12px;
        border: 1px solid #bade5b;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;

        & > .title {
          font-weight: bold;
        }
        & > .peers {
          display: flex;
          align-items: center;

          & span {
            margin-left: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border: 1px solid #bade5b;
            font-size: 12px;
            border-radius: 100%;
          }
        }
      }
      li:hover {
        background-color: rgba(186, 222, 91, 0.2);
        cursor: pointer;
      }
    `

    this.#shadow.appendChild(style)
  }

  async connectedCallback() {
    if (!globalThis.db.opened) await globalThis.db.ready()

    this.#remotes = await db.openRemotes()

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
      for (const [k, v] of this.#remotes) {
        const item = document.createElement('li')
        item.setAttribute('data-repo', v.url)

        const title = document.createElement('span')
        title.classList.add('title')
        title.innerText = k

        const peers = document.createElement('div')
        item.append(title, peers)

        peers.outerHTML = html`<div class="peers" title="Number of connected peers">
          ${Peers}
          <span>${v.availablePeers > 99 ? `99>` : v.availablePeers}</span>
        </div>`

        item.onclick = () => {
          this.#shadow.dispatchEvent(
            new CustomEvent('navigate', {
              bubbles: true,
              composed: true,
              detail: v.url
            })
          )
        }

        nodes.push(item)
      }
    } finally {
      list.replaceChildren(...nodes)
    }
  }
}

window.customElements.define('remotes-list', Remotes)
