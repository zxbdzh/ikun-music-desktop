const { merge } = require('webpack-merge')
const TerserPlugin = require('terser-webpack-plugin')
const baseConfig = require('./webpack.config.base')
const { prodDefines, perfProd, babelLoader } = require('../shared')

module.exports = merge(baseConfig, {
  mode: 'production',
  devtool: 'source-map',
  module: { rules: [babelLoader] },
  plugins: [prodDefines()],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  performance: perfProd,
  node: { __dirname: false, __filename: false },
})
