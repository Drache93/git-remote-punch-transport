const { constructor: PearLink } = require('pear-link')
const z32 = require('z32')

const protocol = 'git+pear:'

class GitPearLink extends PearLink {
  serialize({ key, repo, length } = {}) {
    let drive = { key }
    if (length) {
      drive = {
        key,
        length,
        fork: 0
      }
    }

    return (
      'git+' +
      super.serialize({
        protocol: 'pear:',
        pathname: '/' + repo,
        origin: this.normalize(`pear://${z32.encode(key)}/${repo}`),
        drive
      })
    )
  }
  parse(link) {
    if (link.startsWith(protocol) === false) return super.parse(link)
    const parsed = super.parse(link.slice(4))
    parsed.protocol = 'git+' + parsed.protocol
    parsed.origin = 'git+' + parsed.origin

    const details = parsed.pathname.split('/').slice(1)
    // @todo org etc?
    parsed.repo = details[0]
    return parsed
  }
}

module.exports = new GitPearLink()
