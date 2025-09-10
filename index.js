#!/usr/bin/env node
const run = require('pear-run')

const punchGitArgs = process.argv.slice(2)

class API {
  static RUNTIME = 'pear'
  static RTI = {}
  static RUNTIME_ARGV = []
  app = {}
}

// TODO: add an arg to run locally
const link = 'pear://fxo6uhz74dpz4cw95bjraw4a8g79c34zy6hgcfpcao458onmkzoy'
global.Pear = new API()

// ? run direct and let it stdout/stderr itself?
run(link, punchGitArgs)
