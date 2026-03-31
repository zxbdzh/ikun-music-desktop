const path = require('path')
const { rendererAliases, extensions, tsLoader, nodeLoader, DIST } = require('../shared')

module.exports = {
  target: 'electron-renderer',
  entry: {
    'user-api-preload': path.join(__dirname, '../../src/main/modules/userApi/renderer/preload.js'),
  },
  output: {
    filename: '[name].js',
    library: { type: 'commonjs2' },
    path: DIST,
    publicPath: '',
  },
  resolve: {
    alias: rendererAliases,
    extensions,
  },
  module: {
    rules: [tsLoader(true), nodeLoader],
  },
}
