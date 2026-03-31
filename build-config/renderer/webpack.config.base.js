const path = require('path')
const createRendererBaseConfig = require('../renderer-base-factory')

module.exports = createRendererBaseConfig({
  name: 'renderer',
  entry: path.join(__dirname, '../../src/renderer/main.ts'),
  htmlFilename: 'index.html',
  htmlTemplate: path.join(__dirname, '../../src/renderer/index.html'),
  extraRules: {
    tsParserWorker: {
      worker: ['*audioContext.audioWorklet.addModule()', '...'],
    },
  },
})
