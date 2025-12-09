import { Back, Peers } from './icons'
import { css, html } from './helpers'

class RemoteOptions extends HTMLElement {
  #shadow = null
  #remote = null
  #dropdownOpen = false

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = css`
      .remote-options {
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
      .clone-container {
        position: absolute;
        right: 0;
        top: 0;
      }
      .clone-btn {
        padding: 6px 12px;
        background: rgba(186, 222, 91, 0.2);
        border: 1px solid rgba(186, 222, 91, 0.4);
        border-radius: 4px;
        color: #bade5b;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }
      .clone-btn:hover {
        background: rgba(186, 222, 91, 0.3);
      }
      .dropdown {
        position: absolute;
        top: 38px;
        right: 0;
        background: #1a1a1a;
        border: 1px solid rgba(186, 222, 91, 0.4);
        border-radius: 4px;
        padding: 12px;
        min-width: 300px;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-flow: column;
        align-items: flex-start;
        height: auto;
        padding: 16px;
      }
      .dropdown.hidden {
        display: none;
      }
      .dropdown-section {
        margin-bottom: 12px;
      }
      .dropdown-section:last-child {
        margin-bottom: 0;
      }
      .dropdown-label {
        font-size: 12px;
        color: #bade5b;
        margin-bottom: 6px;
        font-weight: 500;
      }
      .url-input-group {
        display: flex;
        gap: 6px;
      }
      .url-input {
        flex: 1;
        padding: 6px 8px;
        background: #2a2a2a;
        border: 1px solid rgba(186, 222, 91, 0.3);
        border-radius: 3px;
        color: #fff;
        font-size: 13px;
        font-family: monospace;
      }
      .copy-btn,
      .select-dir-btn {
        padding: 6px 10px;
        background: rgba(186, 222, 91, 0.2);
        border: 1px solid rgba(186, 222, 91, 0.4);
        border-radius: 3px;
        color: #bade5b;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
      }
      .copy-btn:hover,
      .select-dir-btn:hover {
        background: rgba(186, 222, 91, 0.3);
      }
      .select-dir-btn {
        width: 100%;
      }
    `

    this.#shadow.appendChild(style)
  }

  async connectedCallback() {
    this.#remote = globalThis.openedRemote
    this.#render()
  }

  #render() {
    this.#shadow.innerHTML += html`
      <div class="remote-options">
        <i id="back">${Back}</i>
        <span>${this.#remote.name}</span>

        <div class="clone-container">
          <button class="clone-btn" id="clone-btn">Clone</button>

          <div class="dropdown hidden" id="dropdown">
            <div class="dropdown-section">
              <div class="dropdown-label">Remote URL</div>
              <div class="url-input-group">
                <input
                  type="text"
                  class="url-input"
                  readonly
                  value="${this.#remote.url}"
                  id="url-input"
                />
                <button class="copy-btn" id="copy-btn">Copy</button>
              </div>
            </div>

            <div class="dropdown-section">
              <div class="dropdown-label">Clone to Directory</div>
              <button class="select-dir-btn" id="select-dir-btn">Select Directory...</button>
            </div>
          </div>
        </div>
      </div>
    `

    this.#attachEventListeners()
  }

  #attachEventListeners() {
    const back = this.#shadow.getElementById('back')
    const cloneBtn = this.#shadow.getElementById('clone-btn')
    const dropdown = this.#shadow.getElementById('dropdown')
    const copyBtn = this.#shadow.getElementById('copy-btn')
    const selectDirBtn = this.#shadow.getElementById('select-dir-btn')
    const cloneContainer = this.#shadow.querySelector('.clone-container')

    back.onclick = () => {
      this.#shadow.dispatchEvent(
        new CustomEvent('navigate', {
          bubbles: true,
          composed: true,
          detail: '/'
        })
      )
    }

    cloneBtn.onclick = (e) => {
      e.stopPropagation()

      this.#dropdownOpen = !this.#dropdownOpen
      dropdown.classList.toggle('hidden', !this.#dropdownOpen)
    }

    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(this.#remote.url)
      copyBtn.textContent = 'Copied!'
      setTimeout(() => {
        copyBtn.textContent = 'Copy'
      }, 2000)
    }

    selectDirBtn.onclick = async () => {
      try {
        const dirHandle = await window.showDirectoryPicker()
        console.log('Selected directory:', dirHandle.get)
        selectDirBtn.textContent = `[WIP] Cloning to ${dirHandle.name}...`
        // TODO: Implement actual clone logic here
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error selecting directory:', err)
        }
      }
    }

    document.addEventListener('click', (e) => {
      if (!cloneContainer.contains(e.target) && this.#dropdownOpen) {
        this.#dropdownOpen = false
        dropdown.classList.add('hidden')
      }
    })
  }
}

window.customElements.define('remote-options', RemoteOptions)
