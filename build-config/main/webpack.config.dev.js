const path = require('path')
const { merge } = require('webpack-merge')
const baseConfig = require('./webpack.config.base')
const { devDefines, perfDevRelaxed, SRC } = require('../shared')

module.exports = merge(baseConfig, {
  mode: 'development',
  entry: {
    main: path.join(__dirname, '../../src/main/index-dev.ts'),
  },
  devtool: 'eval-source-map',
  plugins: [
    devDefines({
      webpackStaticPath: `"${path.join(SRC, 'static').replace(/\\/g, '\\\\')}"`,
      webpackUserApiPath: `"${path.join(SRC, 'main/modules/userApi').replace(/\\/g, '\\\\')}"`,
    }),
  ],
  performance: perfDevRelaxed,
})
