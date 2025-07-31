const { readFileSync } = require('fs')
const { join } = require('path')

const isLocalRef = (ref, branchName) => {
  if (branchName === 'HEAD') {
    // TODO: do we need to read this every time?
    const head = readFileSync(join(process.env.GIT_DIR, 'HEAD')).toString()
    return ref.split(' ')[1].indexOf(head) !== -1
  }
  return ref.split(' ')[1].split('/').pop() === branchName && ref.split(' ')[1].startsWith('refs/heads')
}

module.exports = {
  isLocalRef
}
