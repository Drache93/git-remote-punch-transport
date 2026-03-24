const { cellery: html } = require('cellery')

const app = html`<>
  <style>
    #main {
      display: flex;
      height: 100%;
      flex-flow: column nowrap;
    }
  </style>
  <div id="main">
      <p>Loading...</p>
  </div>
</>`

module.exports = { app }
