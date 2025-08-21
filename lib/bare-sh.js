const { spawn } = require('child_process')

function exec (
  cmd,
  args,
  opts = {}
) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: opts.input ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe']
    })

    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)

    child.stdout.on('data', (data) => {
      stdout = Buffer.concat([stdout, data])
    })

    child.stderr.on('data', (data) => {
      stderr = Buffer.concat([stderr, data])
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('exit', (code) => {
      resolve({
        stdout,
        stderr,
        status: code ?? 0
      })
    })

    if (opts.input) {
      child.stdin.write(opts.input)
      child.stdin.end()
    }
  })
}

function cat (filePath, cmd, opts = {}) {
  return pipe(`cat ${filePath}`, { cwd: opts.cwd, env: opts.env })
    .pipe(cmd)
    .exec()
}

function pipe (initialCmd, opts = {}) {
  return new PipeChain(initialCmd, opts)
}

class PipeChain {
  constructor (initialCmd, opts = {}) {
    this.commands = [initialCmd]
    this.opts = opts
  }

  pipe (cmd) {
    this.commands.push(cmd)
    return this
  }

  async exec () {
    return new Promise((resolve, reject) => {
      if (this.commands.length === 0) {
        reject(new Error('No commands to execute'))
        return
      }

      // Build the pipeline command
      const pipelineCmd = this.commands.join(' | ')

      const child = spawn('sh', ['-c', pipelineCmd], {
        cwd: this.opts.cwd,
        env: this.opts.env,
        stdio: ['inherit', 'pipe', 'pipe']
      })

      let stdout = Buffer.alloc(0)
      let stderr = Buffer.alloc(0)

      child.stdout.on('data', (data) => {
        stdout = Buffer.concat([stdout, data])
      })

      child.stderr.on('data', (data) => {
        stderr = Buffer.concat([stderr, data])
      })

      child.on('error', (error) => {
        reject(error)
      })

      child.on('exit', (code) => {
        resolve({
          stdout,
          stderr,
          status: code ?? 0
        })
      })
    })
  }
}

module.exports = {
  exec,
  cat,
  pipe
}
