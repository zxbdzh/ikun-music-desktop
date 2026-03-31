/**
 * Factory for renderer-type webpack base configs.
 * Shared by both renderer (main UI) and renderer-lyric (floating lyrics).
 */
const path = require('path')
const { VueLoaderPlugin } = require('vue-loader')
const HTMLPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const vueLoaderConfig = require('./vue-loader.config')
const { mergeCSSLoader } = require('./utils')
const { rendererAliases, extensions, tsLoader, nodeLoader, isDev, DIST } = require('./shared')

const SRC = path.join(__dirname, '../src')

/**
 * @param {Object} opts
 * @param {string} opts.name          - Entry name, e.g. 'renderer' or 'renderer-lyric'
 * @param {string} opts.entry         - Entry file path
 * @param {string} opts.htmlFilename  - Output HTML filename, e.g. 'index.html' or 'lyric.html'
 * @param {string} opts.htmlTemplate  - HTML template path
 * @param {Object} [opts.extraRules]  - Additional module rules (e.g. audioWorklet parser)
 */
module.exports = function createRendererBaseConfig(opts) {
  const tsRule = tsLoader(true)
  if (opts.extraRules?.tsParserWorker) {
    tsRule.parser = opts.extraRules.tsParserWorker
  }

  const rules = [
    tsRule,
    nodeLoader,
    {
      test: /\.vue$/,
      loader: 'vue-loader',
      options: vueLoaderConfig,
    },
    {
      test: /\.pug$/,
      loader: 'pug-plain-loader',
    },
    {
      test: /\.css$/,
      oneOf: mergeCSSLoader(),
    },
    {
      test: /\.less$/,
      oneOf: mergeCSSLoader({
        loader: 'less-loader',
        options: { sourceMap: true },
      }),
    },
    {
      test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
      exclude: path.join(SRC, 'renderer/assets/svgs'),
      type: 'asset',
      parser: { dataUrlCondition: { maxSize: 10000 } },
      generator: { filename: 'imgs/[name]-[contenthash:8][ext]' },
    },
    {
      test: /\.svg$/,
      include: path.join(SRC, 'renderer/assets/svgs'),
      use: [
        { loader: 'svg-sprite-loader', options: { symbolId: 'icon-[name]' } },
        'svg-transform-loader',
        'svgo-loader',
      ],
    },
    {
      test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
      type: 'asset',
      parser: { dataUrlCondition: { maxSize: 10000 } },
      generator: { filename: 'media/[name]-[contenthash:8][ext]' },
    },
    {
      test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
      type: 'asset',
      parser: { dataUrlCondition: { maxSize: 10000 } },
      generator: { filename: 'fonts/[name]-[contenthash:8][ext]' },
    },
  ]

  return {
    target: 'electron-renderer',
    entry: { [opts.name]: opts.entry },
    output: {
      filename: '[name].js',
      library: { type: 'commonjs2' },
      path: DIST,
      publicPath: '',
    },
    resolve: {
      alias: rendererAliases,
      extensions,
    },
    module: { rules },
    plugins: [
      new HTMLPlugin({
        filename: opts.htmlFilename,
        template: opts.htmlTemplate,
        isProd: process.env.NODE_ENV === 'production',
        browser: process.browser,
        __dirname,
      }),
      new VueLoaderPlugin(),
      new MiniCssExtractPlugin({
        filename: isDev ? '[name].css' : '[name].[contenthash:8].css',
        chunkFilename: isDev ? '[id].css' : '[id].[contenthash:8].css',
      }),
    ],
  }
}
