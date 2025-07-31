const _debug = true

function debug (message) {
  if (_debug) {
    process.stderr.write('Debug: ' + message + '\n')
  }
}

module.exports = {
  debug
}
