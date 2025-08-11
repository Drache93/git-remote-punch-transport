const readline = require('readline')
const tty = require('tty')
const process = require('process')

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

  render () {
    throw new Error('Not implemented')
  }
}

class Text extends Element {
  constructor (x, y, text, { color = '', paddingX = 0, paddingY = 0 } = {}) {
    super(x, y, text.length, 1)
    this.text = text
    this.color = color
    this.width = this.text.length
    this.height = 1
    this.paddingX = paddingX
    this.paddingY = paddingY
  }

  render () {
    return this.text.split('').map(char => ({ char, color: this.color }))
  }
}

class Box extends Element {
  constructor (x, y, width, height, { title = '', color = 'white', border = 'white', paddingX = 0, paddingY = 0 } = {}) {
    super(x, y, width, height)
    this.title = title
    this.color = color
    this.border = border
    this.paddingX = paddingX
    this.paddingY = paddingY
  }

  render () {
    const pixels = new Array(this.width * this.height).fill('')
    const titleChars = this.title.split('')

    let charIndex = 0
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x

        if (this.title && x > 1) {
          if (charIndex < titleChars.length + 2) {
            pixels[idx] = { char: titleChars[charIndex - 1] || ' ', color: this.color }
            charIndex++
            continue
          }
        }

        if (x === 0 && y === 0) {
          pixels[idx] = { char: '┌', color: this.border }
        } else if (x === 0 && y === this.height - 1) {
          pixels[idx] = { char: '└', color: this.border }
        } else if (x === this.width - 1 && y === 0) {
          pixels[idx] = { char: '┐', color: this.border }
        } else if (x === this.width - 1 && y === this.height - 1) {
          pixels[idx] = { char: '┘', color: this.border }
        } else if (x === 0 || x === this.width - 1) {
          pixels[idx] = { char: '│', color: this.border }
        } else if (y === 0 || y === this.height - 1) {
          pixels[idx] = { char: '─', color: this.border }
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

        let targetX = child.x + childX + child.paddingX
        let targetY = child.y + childY + child.paddingY

        // Handle wrapping when content exceeds parent width
        if (targetX >= this.width) {
          const wrapOffset = Math.floor((targetX - child.x - child.paddingX) / (this.width - child.paddingX * 2))
          targetX = child.x + child.paddingX + (targetX - child.x - child.paddingX) % (this.width - child.paddingX * 2)
          targetY += wrapOffset
        }

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
