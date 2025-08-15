const { spawn } = require('child_process')
const { createReadStream } = require('fs')
const process = require('process')

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
          stdout: stdout,
          stderr: stderr,
          status: code ?? 0
        })
      })
  
      if (opts.input) {
        child.stdin.write(opts.input)
        child.stdin.end()
      }
    })
  }

function cat (filePath, cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    // Use shell to expand glob patterns and pipe to the target command
    const catProcess = spawn('sh', ['-c', `cat ${filePath}`], {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['inherit', 'pipe', 'pipe']
    })

    const targetProcess = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let catStderr = Buffer.alloc(0)

    targetProcess.stdout.on('data', (data) => {
      stdout = Buffer.concat([stdout, data])
    })

    targetProcess.stderr.on('data', (data) => {
      stderr = Buffer.concat([stderr, data])
    })

    catProcess.stderr.on('data', (data) => {
      catStderr = Buffer.concat([catStderr, data])
    })

    // Pipe cat output to target command input
    catProcess.stdout.pipe(targetProcess.stdin)

    // Handle cat process completion
    catProcess.on('error', (error) => {
      reject(new Error(`cat command failed: ${error.message}`))
    })

    catProcess.on('exit', (code) => {
      if (code !== 0) {
        process.stderr.write(`Cat stderr: ${catStderr.toString()}\n`)
        reject(new Error(`cat command failed with code ${code}: ${catStderr.toString()}`))
        return
      }
      // Close the target process stdin after cat is done
      targetProcess.stdin.end()
    })

    targetProcess.on('error', (error) => {
      reject(new Error(`Target command failed: ${error.message}`))
    })

    targetProcess.on('exit', (code) => {
      resolve({
        stdout: stdout,
        stderr: stderr,
        status: code ?? 0
      })
    })
  })
}

module.exports = {
  exec,
  cat
}