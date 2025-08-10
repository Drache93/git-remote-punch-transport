const tui = require('./lib/tui')

const screen = new tui.Tui()

screen.append(new tui.Box(0, 0, '100%', '100%', 'Hello, world!'))
screen.append(new tui.Text(3, 2, 'Hello, world!', 'red'))

screen.render()
