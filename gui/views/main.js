const { cellery: html } = require('cellery')

const app = html`<>
  <style>
    #main {
        flex: 1 1 auto;
        display: flex;
        flex-flow: row;
        padding: 1em;
    }
  </style>
  <div id="main">
      <p>Loading...</p>
  </div>
</>`

module.exports = { app }
