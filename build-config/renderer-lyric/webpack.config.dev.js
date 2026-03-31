const path = require('path')
const { merge } = require('webpack-merge')
const baseConfig = require('./webpack.config.base')
const { devDefines, vueDefines, perfDev, SRC } = require('../shared')

module.exports = merge(baseConfig, {
  mode: 'development',
  devtool: 'eval-source-map',
  plugins: [
    devDefines({
      ...vueDefines,
      staticPath: `"${path.join(SRC, 'static').replace(/\\/g, '\\\\')}"`,
    }),
  ],
  performance: perfDev,
})
