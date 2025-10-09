const { homedir } = require('os')
const { join } = require('path')
const Id = require('hypercore-id-encoding')
const b4a = require('b4a')
const IdentityKey = require('keet-identity-key')
const fs = require('fs')
const sodium = require('sodium-native')

const idPath = join(homedir(), '.punch', 'identity.json')

function identityExists() {
  return fs.existsSync(idPath)
}

/**
 * IdentityConfig
 * * @typedef {Object} IdentityConfig
 * @property {string} keetUsername - The Keet username associated with this identity
 * @property {string} identityPublicKey - The encoded identity public key
 * @property {string} devicePublicKey - The encoded device public key
 * @property {string} deviceSecretKey - The hex-encoded device secret key
 * @property {string} bootstrapProof - The hex-encoded bootstrap proof
 */

/**
 * Get the identity object from the file system.
 * @returns {Promise<IdentityConfig|null>} - The identity object or null if it doesn't exist.
 */
async function getIdentity() {
  try {
    const exists = identityExists()
    if (!exists) {
      return null
    }

    const contents = fs.readFileSync(idPath, 'utf8')
    const data = JSON.parse(contents)

    return {
      keetUsername: data.keetUsername,
      identityPublicKey: Id.decode(data.identityPublicKey),
      devicePublicKey: Id.decode(data.devicePublicKey),
      deviceSecretKey: b4a.from(data.deviceSecretKey, 'hex'),
      bootstrapProof: b4a.from(data.bootstrapProof, 'hex')
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Create a new identity and device keypair.
 * @param {string} keetUsername - The Keet username.
 * @param {string} mnemonic - The mnemonic phrase.
 * @returns {Promise<IdentityConfig>} - The created identity object.
 */
async function createIdentity(keetUsername, existingMnemonic) {
  let mnemonic = existingMnemonic

  if (!mnemonic) {
    mnemonic = IdentityKey.generateMnemonic()
  }

  // Create identity from mnemonic
  const identity = await IdentityKey.from({ mnemonic })

  // Generate device keypair
  const devicePublicKey = b4a.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  const deviceSecretKey = b4a.alloc(sodium.crypto_sign_SECRETKEYBYTES)
  sodium.crypto_sign_keypair(devicePublicKey, deviceSecretKey)

  // Create bootstrap proof
  const bootstrapProof = await identity.bootstrap(devicePublicKey)

  // Prepare data for storage
  const signingData = {
    keetUsername,
    identityPublicKey: Id.normalize(identity.identityKeyPair.publicKey),
    devicePublicKey: Id.encode(devicePublicKey),
    deviceSecretKey: b4a.toString(deviceSecretKey, 'hex'),
    bootstrapProof: b4a.toString(bootstrapProof, 'hex')
  }

  // Write file with restrictive permissions
  fs.writeFileSync(idPath, JSON.stringify(signingData, null, 2), {
    mode: 0o600
  })

  // Ensure permissions are set correctly (some systems might not respect the mode option)
  fs.chmodSync(idPath, 0o600)

  return getIdentity()
}

module.exports = {
  getIdentity,
  createIdentity
}
