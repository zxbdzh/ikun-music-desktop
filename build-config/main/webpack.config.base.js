const path = require('path')
const { merge } = require('webpack-merge')
const { mainAliases, extensionsWithMjs, tsLoader, nodeLoader, DIST } = require('../shared')

module.exports = {
  target: 'electron-main',
  output: {
    filename: '[name].js',
    library: { type: 'commonjs2' },
    path: DIST,
  },
  externals: {
    'font-list': 'font-list',
    'better-sqlite3': 'better-sqlite3',
    'electron-font-manager': 'electron-font-manager',
    bufferutil: 'bufferutil',
    'utf-8-validate': 'utf-8-validate',
  },
  resolve: {
    alias: mainAliases,
    extensions: extensionsWithMjs,
  },
  module: {
    rules: [nodeLoader, tsLoader()],
  },
}
