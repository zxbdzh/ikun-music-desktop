const path = require('path')
const createRendererBaseConfig = require('../renderer-base-factory')

module.exports = createRendererBaseConfig({
  name: 'renderer-lyric',
  entry: path.join(__dirname, '../../src/renderer-lyric/main.ts'),
  htmlFilename: 'lyric.html',
  htmlTemplate: path.join(__dirname, '../../src/renderer-lyric/index.html'),
})
