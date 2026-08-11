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
    'node-hid': 'node-hid',
    'sherpa-onnx-node': 'sherpa-onnx-node',
    'sherpa-onnx-node/addon.js': 'sherpa-onnx-node/addon.js',
    // napi 预编译原生模块,必须外置:打包进 bundle 会破坏其 binding.js 内的 __dirname /
    // 动态 require('./*.node') 解析,导致运行时加载异常(主进程构造 SMTCMonitor 时卡死)。
    '@coooookies/windows-smtc-monitor': '@coooookies/windows-smtc-monitor',
  },
  resolve: {
    alias: mainAliases,
    extensions: extensionsWithMjs,
  },
  module: {
    rules: [nodeLoader, tsLoader()],
  },
}
