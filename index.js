#!/usr/bin/env node
const run = require('pear-run')

const punchGitArgs = process.argv.slice(2)
class API {
  static RUNTIME = 'pear'
  static RTI = {}
  static RUNTIME_ARGV = []
  app = {
    applink: '/Users/odinsson/Dev/pear/git-remote-punch-transport'
  }
}

// TODO: add an arg to run locally
const link = '/Users/odinsson/Dev/pear/git-remote-punch-transport'
global.Pear = new API()

// ? run direct and let it stdout/stderr itself?
run(link, punchGitArgs)
