const pipe = require('pear-pipe')()

if (pipe) {
  require('./remote.js')
} else {
  require('./tui.js')
}
