#!/usr/bin/env node
const run = require("pear-run")

const ARGV = process.argv.slice(1)
const punchGitArgs = process.argv.slice(2)

class API {
    static RUNTIME = "pear"
    static RTI = {}
    static RUNTIME_ARGV = []
    app = {}
  }

// TODO: add an arg to run locally
// const runtimeDir = global.Bare.argv[1].split("/").slice(0, -1).join("/")
const link = "pear://cgnph3qsrfk55pcpzyd3ab7rheqd9jjcxfam3ypmu9989q1xk3zy"
global.Pear = new API()

// ? run direct and let it stdout/stderr itself?
run(link, punchGitArgs)