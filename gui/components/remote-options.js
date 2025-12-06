import { Back, Peers } from './icons'
import { css, html } from './helpers'

class RemoteOptions extends HTMLElement {
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

      span {
        font-weight: bold;
      }
    `

    this.#shadow.appendChild(style)
  }

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

    const title = document.createElement('span')
    title.innerText = this.#remote.name

    div.append(button, title)
  }
}

window.customElements.define('remote-options', RemoteOptions)
