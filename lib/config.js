const c = require('compact-encoding')
const { punchConnection } = require('punch-connection-encoding')

const decodeUrl = (url) => {
  const decodeUrl = (url) => c.decode(punchConnection, Buffer.from(url.substring(8, url.indexOf('/', 8)), 'hex'))
  const decodedUrl = decodeUrl(url)
  const key = decodedUrl.publicKey.toString('hex')
  const bootstrap = decodedUrl.bootstrap.map(e => e.host + ':' + e.port)
  const repository = url.substring(url.indexOf('/', 8))

  return {
    key,
    bootstrap,
    repository
  }
}

module.exports = {
  decodeUrl
}
