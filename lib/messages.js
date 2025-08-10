const c = require('compact-encoding')
const { compile } = require('compact-encoding-struct')
const { ipv4Address } = require('compact-encoding-net')

const repoConfig = compile({
  discoveryKey: c.fixed32,
  key: c.fixed32,
  name: c.string,
  bootstrap: c.array(ipv4Address)
})

module.exports = {
  repoConfig
}
