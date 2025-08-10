const readline = require('readline')
const tty = require('tty')

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
  }

  render () {
    throw new Error('Not implemented')
  }
}

class Text extends Element {
  constructor (x, y, text, color = '') {
    super(x, y, text.length, 1)
    this.text = text
    this.color = color
  }

  render () {
    const pixels = new Array(this.width * this.height).fill('')
    for (let i = 0; i < this.text.length && i < this.width; i++) {
      pixels[i] = {
        char: this.text[i],
        color: this.color
      }
    }
    return pixels
  }
}

class Box extends Element {
  constructor (x, y, width, height, title = '') {
    super(x, y, width, height)
    this.title = title
    this.children = []
  }

  render () {
    const pixels = new Array(this.width * this.height).fill('')
    const titleChars = this.title.split('')

    let charIndex = 0
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x

        if (this.title && x > 1) {
          if (charIndex < titleChars.length) {
            pixels[idx] = { char: titleChars[charIndex], color: '' }
            charIndex++
            continue
          }
        }

        if (x === 0 && y === 0) {
          pixels[idx] = { char: '┌', color: '' }
        } else if (x === 0 && y === this.height - 1) {
          pixels[idx] = { char: '└', color: '' }
        } else if (x === this.width - 1 && y === 0) {
          pixels[idx] = { char: '┐', color: '' }
        } else if (x === this.width - 1 && y === this.height - 1) {
          pixels[idx] = { char: '┘', color: '' }
        } else if (x === 0 || x === this.width - 1) {
          pixels[idx] = { char: '│', color: '' }
        } else if (y === 0 || y === this.height - 1) {
          pixels[idx] = { char: '─', color: '' }
        } else {
          pixels[idx] = { char: ' ', color: '' }
        }
      }
    }
    return pixels
  }
}

class Tui {
  constructor (width, height) {
    this.keyHandlers = new Map()
    this.children = []

    // Get terminal dimensions
    this._setSize(width, height)
    this.pixels = new Array(this.width * this.height).fill('')

    // Setup readline interface
    this.rl = readline.createInterface({
      input: new tty.ReadStream(0),
      output: new tty.WriteStream(1)
    })

    // Handle terminal resize
    process.stdout.on('resize', () => {
      this._setSize()
      this.render()
    })
  }

  _clearScreen () {
    process.stdout.write('\x1b[2J\x1b[H')
  }

  _setSize (width, height) {
    this.width = width || process.stdout.columns || 80
    this.height = height || process.stdout.rows || 24

    this.height -= 1

    // Resize children
    this.children.forEach(child => {
      this._setChildSize(child)
    })
  }

  _setChildSize (child) {
    if (typeof child.width === 'string' && child.width.endsWith('%')) {
      child.width = this.width * parseInt(child.width) / 100
    }
    if (typeof child.height === 'string' && child.height.endsWith('%')) {
      child.height = this.height * parseInt(child.height) / 100
    }
  }

  append (child) {
    this._setChildSize(child)

    this.children.push(child)
  }

  remove (child) {
    this.children = this.children.filter(c => c !== child)
  }

  buffer () {
    const pixels = new Array(this.width * this.height).fill({ char: '', color: '' })
    for (const child of this.children) {
      const childPixels = child.render()
      for (let i = 0; i < childPixels.length; i++) {
        const childX = i % child.width
        const childY = Math.floor(i / child.width)
        const targetX = child.x + childX
        const targetY = child.y + childY
        if (targetX < this.width && targetY < this.height) {
          const targetIdx = targetY * this.width + targetX
          const childPixel = childPixels[i]
          if (childPixel && childPixel.char && childPixel.char !== ' ') {
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

module.exports = { Tui, Box, Text }
