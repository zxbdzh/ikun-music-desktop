const { merge } = require('webpack-merge')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const baseConfig = require('./webpack.config.base')
const { prodDefines, vueDefines, perfProd, babelLoader } = require('../shared')

module.exports = merge(baseConfig, {
  mode: 'production',
  devtool: 'source-map',
  module: { rules: [babelLoader] },
  plugins: [
    prodDefines(vueDefines),
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
  },
  performance: perfProd,
  node: { __dirname: false, __filename: false },
})
