const z32 = require('z32')

function encodeUrl (key, name) {
  return `git+pear://${z32.encode(key)}/${name}`
}

function decodeUrl (url) {
  const stripped = url.replace('git+pear://', '')
  const idx = stripped.indexOf('/')
  const key = z32.decode(stripped.slice(0, idx))
  const name = stripped.slice(idx + 1)
  return { key, name }
}

module.exports = { encodeUrl, decodeUrl }
