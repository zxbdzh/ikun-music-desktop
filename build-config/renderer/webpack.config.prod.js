const path = require('path')
const { merge } = require('webpack-merge')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const baseConfig = require('./webpack.config.base')
const { prodDefines, vueDefines, perfProd, babelLoader, getGitInfo, SRC, DIST } = require('../shared')

const gitInfo = getGitInfo()

module.exports = merge(baseConfig, {
  mode: 'production',
  devtool: 'source-map',
  module: { rules: [babelLoader] },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: path.join(SRC, 'static'), to: path.join(DIST, 'static') },
      ],
    }),
    prodDefines({
      ...vueDefines,
      COMMIT_ID: `"${gitInfo.commit_id}"`,
      COMMIT_DATE: `"${gitInfo.commit_date}"`,
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
    splitChunks: { chunks: 'initial', minChunks: 2 },
  },
  performance: perfProd,
  node: { __dirname: false, __filename: false },
})
