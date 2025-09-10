const git = require('isomorphic-git')
const process = require('process')
const { dirname } = require('path')
const { promises: fs } = require('fs')

/**
 * Rebuild a Git repo from in-memory objects and (optionally) refs, then pack it.
 */
async function rebuildRepo (opts) {
  const {
    objectFormat = 'sha1',
    objects,
    refs = {},
    head,
    verifySizes = true
  } = opts

  // TODO: Really?
  if (objectFormat !== 'sha1') {
    throw new Error('Only sha1 is supported')
  }

  if (!objects?.length) throw new Error('No objects supplied.')

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
    const oid = await git.writeObject({
      fs,
      dir: dirname(process.env.GIT_DIR),
      type: o.type,
      object: o.data
    })

    if (oid !== o.id) {
      // If this fires, your payload/type/format doesn't match the supplied id.
      throw new Error(
        `OID mismatch for ${o.type}: expected ${o.id} but git computed ${oid}`
      )
    }
  }

  // 2) write refs (branches/tags) if provided
  for (const [refName, oid] of Object.entries(refs)) {
    await git.writeRef({
      fs,
      dir: dirname(process.env.GIT_DIR),
      ref: refName,
      value: oid
    })
  }

  // Optionally set HEAD to a branch
  if (head) {
    await git.writeRef({
      fs,
      dir: dirname(process.env.GIT_DIR),
      ref: 'HEAD',
      value: `refs/heads/${head}`
    })
  }
}

module.exports = {
  rebuildRepo
}
