const { createRendererBaseConfig } = require('../shared/createRendererBaseConfig')

module.exports = createRendererBaseConfig({
  entryName: 'renderer',
  entryPath: 'renderer/main.ts',
  htmlFilename: 'index.html',
  htmlTemplate: 'renderer/index.html',
  extraTsLoaderOptions: {
    parser: {
      worker: ['*audioContext.audioWorklet.addModule()', '...'],
    },
  },
})
