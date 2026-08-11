const path = require('path')
const { merge } = require('webpack-merge')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const baseConfig = require('./webpack.config.base')
const { devDefines, perfDevRelaxed, SRC, DIST } = require('../shared')

module.exports = merge(baseConfig, {
  mode: 'development',
  entry: {
    main: path.join(__dirname, '../../src/main/index-dev.ts'),
    smtcWorker: path.join(__dirname, '../../src/main/modules/haloPixel/smtcWorker.ts'),
    podcastSpeakerWorker: path.join(
      __dirname,
      '../../src/main/modules/podcast/podcastSpeakerWorker.ts'
    ),
  },
  // smtcWorker 由 utilityProcess.fork(path.join(__dirname,'smtcWorker.js')) 加载,
  // __dirname 须保留为运行时真实目录(dist),否则 webpack 会把它替换成 '/' 导致找不到文件。
  node: { __dirname: false, __filename: false },
  devtool: 'eval-source-map',
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(SRC, 'main/modules/userApi/renderer/user-api.html'),
          to: path.join(DIST, 'userApi/renderer/user-api.html'),
        },
        // Copy node-hid native module
        {
          from: 'node_modules/node-hid/build/Release/HID.node',
          to: path.join(DIST, 'build/Release/HID.node'),
        },
      ],
    }),
    devDefines({
      webpackStaticPath: `"${path.join(SRC, 'static').replace(/\\/g, '\\\\')}"`,
      webpackUserApiPath: `"${path.join(SRC, 'main/modules/userApi').replace(/\\/g, '\\\\')}"`,
    }),
  ],
  performance: perfDevRelaxed,
})
