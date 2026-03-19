const {
  Text,
  App,
  Container,
  Cellery,
  Input,
  Spacing,
  Color,
  Alignment,
  Size,
  Cell
} = require('cellery')

const app = new App({
  children: [
    new Container({
      id: 'main',
      flex: Container.FlexAuto,
      scroll: Container.ScrollVertical,
      padding: Spacing.all(1),
      alignment: Alignment.Horizontal({}),
      children: [new Text({ value: 'Loading...' })]
    })
  ]
})

module.exports = { app }
