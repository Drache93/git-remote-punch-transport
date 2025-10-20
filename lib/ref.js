class Ref {
  constructor(ref, oid, objects) {
    this._ref = ref
    this._oid = oid
    this._objects = objects
  }

  static fromValue(value) {
    const [oid, ref] = value.split(' ')
    return new Ref(ref, oid)
  }

  replaceRef(ref) {
    this._ref = ref
  }

  get ref() {
    return this._ref
  }

  get oid() {
    return this._oid
  }

  get objects() {
    return this._objects
  }

  get value() {
    return `${this._oid} ${this._ref}`
  }

  get remoteValue() {
    return `${this._oid} ${this.remoteRef}`
  }

  get remoteRef() {
    return this._ref.replace('refs/heads/', 'refs/remotes/')
  }

  toString() {
    return this.value
  }

  toJSON() {
    return {
      oid: this._oid,
      ref: this._ref,
      objects: this._objects
    }
  }
}

module.exports = { Ref }
