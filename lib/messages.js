const c = require('compact-encoding')
const z32 = require('z32')
const { compile } = require('compact-encoding-struct')

const RepoConfig = compile({
  key: c.fixed32,
  name: c.string,
  bootstrap: c.array(c.ipv4Address)
})

function decodeUrl(url) {
  const value = url.replace('git+pear://', '').trim().split('/')[0]
  const configBuffer = z32.decode(value)
  const config = cenc.decode(RepoConfig, configBuffer)

  return config
}

module.exports = {
  RepoConfig,
  decodeUrl
}
