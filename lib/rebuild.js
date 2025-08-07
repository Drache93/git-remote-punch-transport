const { spawnSync } = require('child_process')
const { mkdirSync, existsSync } = require('fs')

function sh (
  cmd,
  args,
  opts = {}
) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024 // 1 GiB just to be safe for large packs
  })
  if (res.error) throw res.error
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    status: res.status ?? 0
  }
}

/**
 * Rebuild a Git repo from in-memory objects and (optionally) refs, then pack it.
 */
function rebuildRepo (opts) {
  const {
    repoPath,
    objectFormat = 'sha1',
    objects,
    refs = {},
    head,
    pack = true,
    verifySizes = true
  } = opts

  if (!objects?.length) throw new Error('No objects supplied.')

  // 0) init bare repo with the desired object format
  if (!existsSync(repoPath)) mkdirSync(repoPath, { recursive: true })
  let r = sh('git', ['init', '--bare', `--object-format=${objectFormat}`, repoPath])
  if (r.status !== 0) throw new Error(`git init failed: ${r.stderr || r.stdout}`)

  const env = { ...process.env, GIT_DIR: repoPath } // run plumbing against this repo

  // 1) write each object
  for (const o of objects) {
    if (!o.type || !o.id || !o.data) {
      throw new Error('Invalid object entry: missing type/id/data')
    }
    if (verifySizes && o.data.length !== o.size) {
      throw new Error(
        `Size mismatch for ${o.type} ${o.id}: declared ${o.size}, buffer ${o.data.length}`
      )
    }

    // Feed raw canonical bytes via stdin; Git will compute the id and store the object.
    // Note: repo's object-format governs the hash algorithm, so no extra flags needed.
    r = sh('git', ['hash-object', '-t', o.type, '-w', '--stdin'], { env, input: o.data })

    if (r.status !== 0) {
      throw new Error(`hash-object failed for ${o.id}: ${r.stderr || r.stdout}`)
    }
    const wrote = r.stdout.trim()

    if (wrote !== o.id) {
      // If this fires, your payload/type/format doesn't match the supplied id.
      throw new Error(
        `OID mismatch for ${o.type}: expected ${o.id} but git computed ${wrote}`
      )
    }
  }

  // 2) write refs (branches/tags) if provided
  for (const [refName, oid] of Object.entries(refs)) {
    r = sh('git', ['update-ref', refName, oid], { env })
    if (r.status !== 0) throw new Error(`update-ref failed (${refName}): ${r.stderr || r.stdout}`)
  }

  // Optionally set HEAD to a branch
  if (head) {
    r = sh('git', ['symbolic-ref', 'HEAD', head], { env })
    if (r.status !== 0) throw new Error(`symbolic-ref HEAD -> ${head} failed: ${r.stderr || r.stdout}`)
  }

  // 3) pack everything (optional but recommended)
  if (pack) {
    r = sh('git', ['repack', '-Ad'], { env })
    if (r.status !== 0) throw new Error(`git repack failed: ${r.stderr || r.stdout}`)
  }

  // 4) sanity check
  r = sh('git', ['fsck', '--full'], { env })
  if (r.status !== 0) {
    // Some repos return warnings on stdout; only throw for nonzero + useful message
    throw new Error(`git fsck reported issues:\n${r.stdout || r.stderr}`)
  }
}

module.exports = {
  rebuildRepo
}
