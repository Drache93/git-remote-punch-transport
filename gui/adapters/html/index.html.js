const css = require('./output.css', { with: { type: 'text' } })

const html = String.raw

module.exports = ({ port, token, isAndroid, isIOS }) =>
  html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Git+Pear</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          ${css}
        </style>
      </head>
      <body class="bg-black font-mono overflow-hidden">
        <main
          id="app"
          class="container mx-auto w-screen overflow-hidden flex flex-col text-green-500 p-2 ${isAndroid
            ? 'h-screen pb-12 pt-14'
            : isIOS
              ? 'h-[90vh]'
              : 'h-screen'}"
        ></main>
        <script>
          const socket = new WebSocket('ws://localhost:${port}?token=${token}')

          socket.onmessage = (msg) => {
            const { id, content, insert, value, clear, destroy } = JSON.parse(msg.data)

            const target = document.getElementById(id)
            console.log(target)

            if (!target) {
              socket.send(JSON.stringify({ error: 'NOT_FOUND', id }))
              return
            }

            if (destroy) {
              target.remove()
              return
            }

            if (value !== undefined) {
              target.value = value
            }

            if (clear) {
              target.innerHTML = ''
            }

            if (!content) return

            if (insert) {
              target.insertAdjacentHTML(insert, content)
              target.scrollTop = target.scrollHeight
            } else {
              target.innerHTML = content
            }
          }

          const supportedKeys = ['Enter', 'ArrowUp', 'ArrowDown']

          function onClick(target) {
            socket.send(
              JSON.stringify({
                event: 'click',
                data: {
                  id: target.id
                }
              })
            )
          }

          document.addEventListener('keydown', (e) => {
            // TODO: register for events
            if (!supportedKeys.includes(e.key)) return
            if (!e.shiftKey) e.preventDefault()

            socket.send(
              JSON.stringify({
                event: 'keydown',
                data: {
                  key: e.key,
                  id: e.target.id,
                  shift: e.shiftKey,
                  value: e.target.value
                }
              })
            )

            if (e.key === 'Enter') {
              e.target.value = ''
            }
          })

          let startY = 0

          document.addEventListener('touchstart', (e) => {
            if (e.target.id !== 'cmd-input') return
            startY = e.touches[0].clientY
          })

          document.addEventListener('touchend', (e) => {
            if (e.target.id !== 'cmd-input') return
            const endY = e.changedTouches[0].clientY
            const diff = startY - endY

            if (Math.abs(diff) < 40) return // ignore small swipes

            if (diff > 0) {
              socket.send(
                JSON.stringify({
                  event: 'keydown',
                  data: {
                    key: 'ArrowUp',
                    id: e.target.id,
                    shift: false
                  }
                })
              )
            } else {
              socket.send(
                JSON.stringify({
                  event: 'keydown',
                  data: {
                    key: 'ArrowDown',
                    id: e.target.id,
                    shift: false
                  }
                })
              )
            }
          })
        </script>
      </body>
    </html>`
