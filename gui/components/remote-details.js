import b4a from 'b4a'
import { Back, FolderBack, getIcon, Peers } from './icons'
import { css, html } from './helpers'

class RemoteDetails extends HTMLElement {
  #shadow = null
  #remote = null

  constructor() {
    super()

    this.#shadow = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = css`
      div {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 24px;
        position: relative;
        height: 32px;
      }

      i {
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        left: 0;
        top: 0;

        & > svg {
          width: 32px;
          height: 32px;
        }

        & > svg:hover {
          cursor: pointer;
          fill: rgba(186, 222, 91, 0.6);
        }
      }

      .peers {
        position: absolute;
        right: 0;
        top: 0;
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

      span {
        font-weight: bold;
      }
    `

    this.#shadow.appendChild(style)
  }

  #back() {}

  async connectedCallback() {
    this.#remote = globalThis.openedRemote

    this.#render()
  }

  #render() {
    const div = document.createElement('div')
    this.#shadow.appendChild(div)

    const button = document.createElement('i')
    button.innerHTML = Back
    button.onclick = () => {
      this.#shadow.dispatchEvent(
        new CustomEvent('navigate', {
          bubbles: true,
          composed: true,
          detail: '/'
        })
      )
    }

    const peers = document.createElement('div')
    div.append(button, peers)

    peers.outerHTML = html`<div class="peers" title="Number of connected peers">
      ${Peers}
      <span>${this.#remote.availablePeers > 99 ? `99>` : this.#remote.availablePeers}</span>
    </div>`

    const title = document.createElement('span')
    title.innerText = this.#remote.name

    div.append(title)
  }
}

window.customElements.define('remote-details', RemoteDetails)
