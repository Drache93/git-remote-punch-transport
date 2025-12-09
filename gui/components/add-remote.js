import { decodeUrl } from '../../lib/messages'
import { css } from './helpers'

const regexRepoName = /^[a-zA-Z0-9_-]+$/

class AddRemote extends HTMLElement {
  #shadow = null

  constructor() {
    super()

    this.#shadow = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = css`
      input {
        width: 100%;
        padding: 12px 12px;
        border: 1px solid #bade5b;
        border-radius: 8px;
        background-color: transparent;
        color: #bade5b;
        box-sizing: border-box;
      }
    `

    this.#shadow.appendChild(style)
  }

  async connectedCallback() {
    this.#render()
  }

  async #onsubmit() {
    try {
      if (!this.value.startsWith('git+pear://')) {
        const valid = regexRepoName.test(this.value)
        if (!valid) throw new Error('Invalid repo name')

        const remote = await globalThis.db.createRemote(this.value)

        console.log('created repo', remote)

        this.#shadow.dispatchEvent(
          new CustomEvent('navigate', {
            bubbles: true,
            composed: true,
            detail: '/'
          })
        )

        return
      }

      const config = decodeUrl(this.value)

      const repo = await globalThis.db.joinRemote(config)

      console.log('joined repo', repo)

      this.value = ''
      this.shadowRoot.querySelector('input').value = ''
    } catch (e) {
      console.error('failed to add remote', e)
    }
  }

  #render() {
    const form = document.createElement('form')
    form.onsubmit = this.#onsubmit.bind(this)

    const input = document.createElement('input')
    input.placeholder = `Add or create a repo without cloning it e.g. 'my-new-repo' or 'git+pear://...'`
    input.onchange = (el) => {
      this.value = el.target.value
    }

    form.appendChild(input)
    this.#shadow.appendChild(form)
  }
}

window.customElements.define('add-remote', AddRemote)
