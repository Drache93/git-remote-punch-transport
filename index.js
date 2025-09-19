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
const link = 'pear://1y7g19xae7ohpeh9x45p7j1iz4hpqrpmdi7dq4m5rebfwji5koby'
global.Pear = new API()

// ? run direct and let it stdout/stderr itself?
run(link, punchGitArgs)
