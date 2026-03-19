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
  Cell,
  cellery,
  BoxDecoration,
  Border
} = require('cellery')
const { PunchRemoteDB } = require('../../lib/db/remote2.cjs')

const css = String.raw

class Repo extends Cell {
  /** @type {PunchRemoteDB} */
  repo = null

  constructor(opts = {}) {
    super(opts)
    this.repo = opts.repo
  }

  _render() {
    const res = cellery`
      <Container id="${this.repo.name}" onclick>
        <Style.HTML>
          Container {
            flex: 1 1 auto;
            padding: 0.5rem;
            color: #00c950;
            border: 1px solid #00c950;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          Container:hover {
            color: #00d3f2;
            border: 1px solid #00d3f2;
            cursor: pointer;
          }
        </Style.HTML>

        <Text>${this.repo.name}</Text>
        <Text>${this.repo.core.length}</Text>
      </Container>
    `
    console.log(res)
    return res
  }
}

module.exports = { Repo }
