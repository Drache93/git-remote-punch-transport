#!/usr/bin/env bare

/* globals Bare */
const process = require('process');

const run = require("pear-run")

const ARGV = global.Bare.argv.slice(1)
const punchGitArgs = global.Bare.argv.slice(2)

class API {
    static RUNTIME = "pear"
    static RTI = {}
    static RUNTIME_ARGV = []
    app = {}
  }

const runtimeDir = global.Bare.argv[1].split("/").slice(0, -1).join("/")
// TODO: replace to pear url
const link = "pear://cgnph3qsrfk55pcpzyd3ab7rheqd9jjcxfam3ypmu9989q1xk3zy"
global.Bare.argv.length = 1
global.Bare.argv.push('run', link)
global.Pear = new API()


// ? run direct and let it stdout/stderr itself?
run(link, punchGitArgs)