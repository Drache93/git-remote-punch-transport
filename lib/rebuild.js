const { rmSync } = require('bare-fs')
const { mkdirSync, existsSync } = require('fs')
const sh = require('./bare-sh')
const process = require('process')

/**
 * Rebuild a Git repo from in-memory objects and (optionally) refs, then pack it.
 */
async function rebuildRepo (opts) {
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
  if (existsSync(repoPath)) {
    rmSync(repoPath, {recursive: true})
  }
  mkdirSync(repoPath, { recursive: true })
  
  let r = await sh.exec('git', ['init', '--bare', `--object-format=${objectFormat}`, repoPath])
  if (r.status !== 0) throw new Error(`git init failed: ${r.stderr.toString() || r.stdout.toString()}`)

  const env = { ...(global.Bare?.env || global.process?.env || {}), GIT_DIR: repoPath } // run plumbing against this repo

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
    r = await sh.exec('git', ['hash-object', '-t', o.type, '-w', '--stdin'], { env, input: o.data })

    if (r.status !== 0) {
      throw new Error(`hash-object failed for ${o.id}: ${r.stderr.toString() || r.stdout.toString()}`)
    }
    const wrote = r.stdout.toString().trim()

    if (wrote !== o.id) {
      // If this fires, your payload/type/format doesn't match the supplied id.
      throw new Error(
        `OID mismatch for ${o.type}: expected ${o.id} but git computed ${wrote}`
      )
    }
  }

  // 2) write refs (branches/tags) if provided
  for (const [refName, oid] of Object.entries(refs)) {
    r = await sh.exec('git', ['update-ref', refName, oid], { env })
    if (r.status !== 0) throw new Error(`update-ref failed (${refName}): ${r.stderr.toString() || r.stdout.toString()}`)
  }

  // Optionally set HEAD to a branch
  if (head) {
    r = await sh.exec('git', ['symbolic-ref', 'HEAD', head], { env })
    if (r.status !== 0) throw new Error(`symbolic-ref HEAD -> ${head} failed: ${r.stderr.toString() || r.stdout.toString()}`)
  }

  // 3) pack everything (optional but recommended)
  if (pack) {
    r = await sh.exec('git', ['repack', '-Ad'], { env })
    if (r.status !== 0) throw new Error(`git repack failed: ${r.stderr.toString() || r.stdout.toString()}`)
  }

  // 4) sanity check
  r = await sh.exec('git', ['fsck', '--full'], { env })
  if (r.status !== 0) {
    // Some repos return warnings on stdout; only throw for nonzero + useful message
    throw new Error(`git fsck reported issues:\n${r.stdout.toString() || r.stderr.toString()}`)
  }
}

module.exports = {
  rebuildRepo
}
