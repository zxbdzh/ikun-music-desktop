const path = require('path')
const { merge } = require('webpack-merge')
const baseConfig = require('./webpack.config.base')
const { devDefines, perfDev, SRC } = require('../shared')

module.exports = merge(baseConfig, {
  mode: 'development',
  devtool: 'eval-source-map',
  plugins: [
    devDefines({
      staticPath: `"${path.join(SRC, 'static').replace(/\\/g, '\\\\')}"`,
    }),
  ],
  performance: perfDev,
})
