class Ref {
  constructor (ref, oid) {
    this._ref = ref
    this._oid = oid
  }

  static fromValue (value) {
    const [oid, ref] = value.split(' ')
    return new Ref(ref, oid)
  }

  replaceRef (ref) {
    this._ref = ref
  }

  get ref () {
    return this._ref
  }

  get oid () {
    return this._oid
  }

  get value () {
    return `${this._oid} ${this._ref}`
  }

  get remoteValue () {
    return `${this._oid} ${this._ref.replace('refs/heads/', 'refs/remotes/')}`
  }

  toString () {
    return this.value
  }
}

module.exports = { Ref }
