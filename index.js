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
const link = 'pear://cgnph3qsrfk55pcpzyd3ab7rheqd9jjcxfam3ypmu9989q1xk3zy'
global.Pear = new API()

// ? run direct and let it stdout/stderr itself?
run(link, punchGitArgs)
