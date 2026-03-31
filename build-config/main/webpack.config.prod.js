const path = require('path')
const { merge } = require('webpack-merge')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const baseConfig = require('./webpack.config.base')
const { prodDefines, perfProd, SRC, DIST } = require('../shared')

module.exports = merge(baseConfig, {
  mode: 'production',
  devtool: false,
  entry: {
    main: path.join(__dirname, '../../src/main/index.ts'),
  },
  node: { __dirname: false, __filename: false },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(SRC, 'main/modules/userApi/renderer/user-api.html'),
          to: path.join(DIST, 'userApi/renderer/user-api.html'),
        },
        {
          from: path.join(SRC, 'common/theme/images/*').replace(/\\/g, '/'),
          to: path.join(DIST, 'theme_images/[name][ext]'),
        },
      ],
    }),
    prodDefines(),
  ],
  performance: perfProd,
  optimization: { minimize: false },
})
