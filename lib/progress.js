const createSpinner = require('bare-spinner').default

class ProgressReporter {
  constructor () {
    this.spinner = null
    this.currentPhase = null
    this.objectCount = 0
    this.totalObjects = 0
    this.writtenObjects = 0
    this.writtenBytes = 0
    this.startTime = null
  }

  punching () {
    this.spinner = createSpinner({ text: 'Punching...' }).start()
  }

  punched (remote) {
    if (this.spinner) {
      if (!remote.availablePeers) {
        this.spinner.success('Punching, no peers found')
        this.spinner = null
        return
      }

      this.spinner.success(
        `Punched, found peer${remote.availablePeers?.length > 1 ? 's' : ''}: ${remote.availablePeers?.length || 0}`
      )
      this.spinner = null
    }
  }

  startCounting (phase = 'Enumerating objects') {
    this.currentPhase = phase
    this.startTime = Date.now()
    this.spinner = createSpinner({ text: `${phase}...` }).start()
  }

  updateCount (count) {
    if (this.spinner && this.currentPhase) {
      this.objectCount = count
      this.spinner.text = `${this.currentPhase}: ${count}`
    }
  }

  finishCounting (totalCount) {
    if (this.spinner) {
      this.totalObjects = totalCount
      this.spinner.success(`${this.currentPhase}: ${totalCount}, done.`)
      this.spinner = null
    }
  }

  startWriting () {
    this.currentPhase = 'Writing objects'
    this.writtenObjects = 0
    this.writtenBytes = 0
    this._updateWritingProgress()
  }

  updateWriting (objectsWritten, bytesWritten) {
    this.writtenObjects = objectsWritten
    this.writtenBytes = bytesWritten
    this._updateWritingProgress()
  }

  _updateWritingProgress () {
    const percentage =
      this.totalObjects > 0
        ? Math.floor((this.writtenObjects / this.totalObjects) * 100)
        : 0
    const bytesStr = this._formatBytes(this.writtenBytes)

    let progressBar = ''
    if (this.totalObjects > 0) {
      const barWidth = 20
      const filled = Math.floor(
        (this.writtenObjects / this.totalObjects) * barWidth
      )
      progressBar = `[${'='.repeat(filled)}${' '.repeat(barWidth - filled)}]`
    }

    const message = `Writing objects: ${percentage}% (${this.writtenObjects}/${this.totalObjects}) ${progressBar} ${bytesStr}`

    if (this.spinner) {
      this.spinner.text = message
    } else {
      this.spinner = createSpinner({ text: message }).start()
    }
  }

  finishWriting () {
    if (this.spinner) {
      const bytesStr = this._formatBytes(this.writtenBytes)
      const rateStr = this._getRate()
      this.spinner.success(
        `Writing objects: 100% (${this.writtenObjects}/${this.totalObjects}), ${bytesStr} | ${rateStr}, done.`
      )
      this.spinner = null
    }
  }

  reportError (error) {
    if (this.spinner) {
      this.spinner.error(`Error: ${error}`)
      this.spinner = null
    } else {
      process.stderr.write(`Error: ${error}\n`)
    }
  }

  reportInfo (message) {
    if (this.spinner) {
      this.spinner.stop()
      process.stderr.write(`${message}\n`)
    } else {
      process.stderr.write(`${message}\n`)
    }
  }

  stop () {
    if (this.spinner) {
      this.spinner.stop()
      this.spinner = null
    }
  }

  _formatBytes (bytes) {
    if (bytes === 0) return '0 bytes'

    const k = 1024
    const sizes = ['bytes', 'KiB', 'MiB', 'GiB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    if (i === 0) return `${bytes} ${sizes[i]}`
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  _getElapsedTime () {
    if (!this.startTime) return '0s'
    const elapsed = (Date.now() - this.startTime) / 1000
    if (elapsed < 60) return `${elapsed.toFixed(1)}s`
    const minutes = Math.floor(elapsed / 60)
    const seconds = Math.floor(elapsed % 60)
    return `${minutes}m${seconds}s`
  }

  _getRate () {
    if (!this.startTime || this.writtenBytes === 0) return '0 bytes/s'
    const elapsed = (Date.now() - this.startTime) / 1000
    const rate = this.writtenBytes / elapsed
    return `${this._formatBytes(rate)}/s`
  }

  // Static method for simple one-off messages
  static write (message) {
    process.stderr.write(`${message}\n`)
  }
}

module.exports = { ProgressReporter }
