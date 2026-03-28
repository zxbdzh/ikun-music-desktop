const { createRendererBaseConfig } = require('../shared/createRendererBaseConfig')

module.exports = createRendererBaseConfig({
  entryName: 'renderer-lyric',
  entryPath: 'renderer-lyric/main.ts',
  htmlFilename: 'lyric.html',
  htmlTemplate: 'renderer-lyric/index.html',
})
