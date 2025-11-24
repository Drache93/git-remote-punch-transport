const Runtime = require('pear-electron')
const Bridge = require('pear-bridge')

const run = async () => {
  const bridge = new Bridge()
  await bridge.ready()

  const runtime = new Runtime()
  const pipe = await runtime.start({ bridge })
  pipe.on('close', () => Pear.exit())

  pipe.on('data', (data) => {
    const cmd = Buffer.from(data).toString()
    if (cmd === 'hello from ui') pipe.write('sweet bidirectionality')
    console.log('PIPE DATA', data + '')
  })
}

run()
