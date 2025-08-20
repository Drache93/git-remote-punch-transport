const process = require('process')
const { spawn } = require('child_process')

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
}

class Element {
  constructor (x, y, width, height) {
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.paddingX = 0
    this.paddingY = 0
  }

  _getSize (parentWidth, parentHeight) {
    let width = this.width
    if (typeof this.width === 'string' && this.width.endsWith('%')) {
      width = parentWidth * parseInt(this.width) / 100
    }
    let height = this.height
    if (typeof this.height === 'string' && this.height.endsWith('%')) {
      height = parentHeight * parseInt(this.height) / 100
    }
    return { width: Math.floor(width), height: Math.floor(height) }
  }

  render (parentWidth, parentHeight) {
    throw new Error('Not implemented')
  }
}

class Text extends Element {
  constructor (x, y, text, { color = '', width = 100, paddingX = 1, paddingY = 0 } = {}) {
    super(x, y, text.length, 1)
    this.text = text
    this.color = color
    this.paddingX = paddingX
    this.paddingY = paddingY
    this.width = width - paddingX * 2
    this.height = Math.ceil(this.text.length / this.width)
  }

  render (parentWidth, parentHeight) {
    this.width = parentWidth - this.paddingX * 2
    this.height = Math.ceil(this.text.length / this.width)

    const pixels = new Array(this.width * this.height).fill('')

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        pixels[y * this.width + x] = { char: this.text[y * this.width + x], color: this.color }
      }
    }

    return { pixels, width: this.width, height: this.height }
  }
}

class TextInput extends Text {
  constructor (x, y, width, height, { text = '', color = 'white', border = 'white', paddingX = 0, paddingY = 0, clear = false } = {}) {
    super(x, y, text, { color, paddingX, paddingY, width })
  }

  render (parentWidth, parentHeight) {
    // Add box cursor to start of text
    this.text = this.text + '█'

    return super.render(parentWidth, parentHeight)
  }
}

class Box extends Element {
  constructor (x, y, width, height, { title = '', color = 'white', border = 'white', paddingX = 0, paddingY = 0, clear = false } = {}) {
    super(x, y, width, height)
    this.title = title
    this.color = color
    this.border = border
    this.paddingX = paddingX
    this.paddingY = paddingY
    this.clear = clear
  }

  render (parentWidth, parentHeight) {
    const { width, height } = this._getSize(parentWidth, parentHeight)

    const pixels = new Array(width * height).fill('')
    const titleChars = this.title.split('')

    let charIndex = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x

        if (this.title && x > 1) {
          if (charIndex < titleChars.length + 2) {
            pixels[idx] = { char: titleChars[charIndex - 1] || ' ', color: this.color }
            charIndex++
            continue
          }
        }

        if (x === 0 && y === 0) {
          pixels[idx] = { char: '┌', color: this.border }
        } else if (x === 0 && y === height - 1) {
          pixels[idx] = { char: '└', color: this.border }
        } else if (x === width - 1 && y === 0) {
          pixels[idx] = { char: '┐', color: this.border }
        } else if (x === width - 1 && y === height - 1) {
          pixels[idx] = { char: '┘', color: this.border }
        } else if (x === 0 || x === width - 1) {
          pixels[idx] = { char: '│', color: this.border }
        } else if (y === 0 || y === height - 1) {
          pixels[idx] = { char: '─', color: this.border }
        } else {
          pixels[idx] = { char: ' ', color: '' }
        }
      }
    }

    return { pixels, width, height, clear: this.clear }
  }
}

class SelectableList extends Element {
  constructor (x, y, width, height, { items = [], onSelect = null, onCopy = null } = {}) {
    super(x, y, width, height)
    this.items = items
    this.selectedIndex = -1
    this.textElements = []
    this.onSelect = onSelect
    this.onCopy = onCopy
    this._createTextElements()
  }

  _createTextElements () {
    this.textElements = []
    this.items.forEach((item, index) => {
      const text = `• ${item.name}`
      const textElement = new Text(0, index, text, { color: 'yellow', paddingX: 2 })
      this.textElements.push(textElement)
    })
  }

  setItems (items) {
    this.items = items
    this.selectedIndex = -1
    this._createTextElements()
  }

  select (index) {
    if (index >= 0 && index < this.items.length) {
      this.selectedIndex = index
      this._updateSelection()
      if (this.onSelect) {
        this.onSelect(this.items[index], index)
      }
    }
  }

  selectNext () {
    if (this.items.length > 0) {
      const newIndex = Math.min(this.selectedIndex + 1, this.items.length - 1)
      this.select(newIndex)
    }
  }

  selectPrevious () {
    if (this.items.length > 0) {
      const newIndex = Math.max(this.selectedIndex - 1, 0)
      this.select(newIndex)
    }
  }

  copySelected () {
    if (this.items.length > 0 && this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
      const selectedItem = this.items[this.selectedIndex]
      if (this.onCopy) {
        this.onCopy(selectedItem)
      }
    }
  }

  _updateSelection () {
    this.textElements.forEach((textElement, index) => {
      textElement.color = index === this.selectedIndex ? 'bright' : 'yellow'
    })
  }

  render (parentWidth, parentHeight) {
    const { width, height } = this._getSize(parentWidth, parentHeight)
    const pixels = new Array(width * height).fill({ char: '', color: '' })

    this.textElements.forEach((textElement, index) => {
      const { pixels: textPixels, width: textWidth } = textElement.render(width, height)

      for (let i = 0; i < textPixels.length; i++) {
        const textX = i % textWidth
        const textY = Math.floor(i / textWidth)

        const targetX = this.x + textX
        const targetY = this.y + index + textY

        if (targetX < parentWidth && targetY < parentHeight) {
          const targetIdx = targetY * parentWidth + targetX
          const textPixel = textPixels[i]
          if (textPixel && textPixel.char && textPixel.char !== ' ') {
            pixels[targetIdx] = textPixel
          }
        }
      }
    })

    return { pixels, width, height }
  }
}

class Tui {
  constructor (width, height) {
    this.keyHandlers = new Map()
    this.children = []
    this.isFullScreen = false
    this.originalRawMode = null
    this.originalStdin = null
    this.handleInput = null

    // Handle terminal resize
    process.stdout.on('resize', () => {
      this._setSize()
      this.render()
    })

    // Handle process termination
    this._setupExitHandlers()

    // Get terminal dimensions
    this._setSize(width, height)
  }

  _setupExitHandlers () {
    const cleanup = () => {
      this.exitFullScreen()
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('exit', cleanup)
    process.on('SIGWINCH', () => {
      if (this.isFullScreen) {
        this._setSize()
        this.render()
      }
    })
  }

  enterFullScreen () {
    if (this.isFullScreen) return

    // Store original terminal state
    if (process.stdin.isTTY) {
      this.originalRawMode = process.stdin.isRaw
      this.originalStdin = process.stdin

      // Set raw mode and disable echo
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')
    }

    this.isFullScreen = true

    // Clear screen and hide cursor
    this._clearScreen()
    this._hideCursor()

    // Set up keyboard input handling
    this._setupKeyboardInput()
  }

  exitFullScreen () {
    if (!this.isFullScreen) return

    // Restore original terminal state
    if (this.originalStdin && this.originalRawMode !== null) {
      process.stdin.setRawMode(this.originalRawMode)
    }

    this.isFullScreen = false

    // Show cursor and clear screen
    this._showCursor()
    this._clearScreen()

    // Remove keyboard input handler
    this._removeKeyboardInput()
  }

  _setupKeyboardInput () {
    if (!process.stdin.isTTY) return

    this._keyboardHandler = (data) => {
      const key = data.toString()

      if (this.handleInput) {
        this.handleInput(key)
        return
      }

      // Handle special keys
      if (key === '\u0003') { // Ctrl+C
        this.exitFullScreen()
        process.exit(0)
      } else if (key === '\u001b') { // Escape
        this.exitFullScreen()
        process.exit(0)
      } else if (key === 'q') {
        this.exitFullScreen()
        process.exit(0)
      }

      // Call registered key handlers
      if (this.keyHandlers.has(key)) {
        this.keyHandlers.get(key)(key)
      }
    }

    process.stdin.on('data', this._keyboardHandler)
  }

  _removeKeyboardInput () {
    if (this._keyboardHandler) {
      process.stdin.removeListener('data', this._keyboardHandler)
      this._keyboardHandler = null
    }
  }

  setHandlingInput (handlingInput) {
    this.handleInput = handlingInput
  }

  onKey (key, handler) {
    this.keyHandlers.set(key, handler)
  }

  copyToClipboard (text) {
    if (process.platform === 'darwin') {
      // macOS
      const pbcopy = spawn('pbcopy')
      pbcopy.stdin.write(text)
      pbcopy.stdin.end()
    } else if (process.platform === 'linux') {
      // Linux
      const xclip = spawn('xclip', ['-selection', 'clipboard'])
      xclip.stdin.write(text)
      xclip.stdin.end()
    } else if (process.platform === 'win32') {
      // Windows
      const clip = spawn('clip')
      clip.stdin.write(text)
      clip.stdin.end()
    }
  }

  _clearScreen () {
    process.stdout.write('\x1b[3J\x1b[H')
  }

  _hideCursor () {
    process.stdout.write('\x1b[?25l')
  }

  _showCursor () {
    process.stdout.write('\x1b[?25h')
  }

  _setSize (width, height) {
    this.width = width || process.stdout.columns || 80
    this.height = height || process.stdout.rows || 24

    // Don't subtract 1 for full-screen mode
    if (!this.isFullScreen) {
      this.height -= 1
    }

    this.pixels = new Array(this.width * this.height).fill('')
  }

  append (child) {
    this.children.push(child)
  }

  remove (child) {
    this.children = this.children.filter(c => c !== child)
  }

  buffer () {
    const pixels = new Array(this.width * this.height).fill({ char: '', color: '' })
    for (const child of this.children) {
      const { pixels: childPixels, width: childWidth } = child.render(this.width, this.height)

      for (let i = 0; i < childPixels.length; i++) {
        const childXOffset = i % childWidth
        const childYOffset = Math.floor(i / childWidth)
        const childX = typeof child.x === 'function' ? child.x(this.width, this.height) : child.x
        const childY = typeof child.y === 'function' ? child.y(this.width, this.height) : child.y

        const targetX = childX < 0 ? this.width + childX + childXOffset : childX + childXOffset
        const targetY = childY < 0 ? this.height + childY + childYOffset : childY + childYOffset

        if (targetX < this.width && targetY < this.height) {
          const targetIdx = targetY * this.width + targetX
          const childPixel = childPixels[i]

          if (childPixel && childPixel.char) {
            pixels[targetIdx] = childPixel
          }
        }
      }
    }
    return pixels
  }

  render () {
    const pixels = this.buffer()

    this._clearScreen()

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const pixel = pixels[y * this.width + x]
        if (pixel.color) {
          process.stdout.write(colors[pixel.color])
        }
        process.stdout.write(pixel.char || ' ')
        if (pixel.color) {
          process.stdout.write(colors.reset)
        }
      }
      process.stdout.write('\n')
    }
  }
}

module.exports = { Tui, Box, Text, TextInput, SelectableList }
