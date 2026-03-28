const path = require('path')
const { VueLoaderPlugin } = require('vue-loader')
const HTMLPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const vueLoaderConfig = require('../vue-loader.config')
const { mergeCSSLoader } = require('../utils')

const isDev = process.env.NODE_ENV === 'development'
const rootDir = path.join(__dirname, '../..')

/**
 * 创建 renderer 类型的 webpack base 配置
 * @param {Object} options
 * @param {string} options.entryName - 入口名称 (如 'renderer', 'renderer-lyric')
 * @param {string} options.entryPath - 入口文件路径 (相对于 src/)
 * @param {string} options.htmlFilename - 输出 HTML 文件名 (如 'index.html', 'lyric.html')
 * @param {string} options.htmlTemplate - HTML 模板路径 (相对于 src/)
 * @param {Object} [options.extraTsLoaderOptions] - ts-loader 额外选项
 */
function createRendererBaseConfig({
  entryName,
  entryPath,
  htmlFilename,
  htmlTemplate,
  extraTsLoaderOptions = {},
}) {
  const tsLoaderRule = {
    test: /\.tsx?$/,
    exclude: /node_modules/,
    use: {
      loader: 'ts-loader',
      options: {
        appendTsSuffixTo: [/\.vue$/],
      },
    },
  }

  // 合并额外的 ts-loader 选项（如 worker parser）
  if (extraTsLoaderOptions.parser) {
    tsLoaderRule.parser = extraTsLoaderOptions.parser
  }

  return {
    target: 'electron-renderer',
    entry: {
      [entryName]: path.join(rootDir, 'src', entryPath),
    },
    output: {
      filename: '[name].js',
      library: {
        type: 'commonjs2',
      },
      path: path.join(rootDir, 'dist'),
      publicPath: '',
    },
    resolve: {
      alias: {
        '@root': path.join(rootDir, 'src'),
        '@main': path.join(rootDir, 'src/main'),
        '@renderer': path.join(rootDir, 'src/renderer'),
        '@lyric': path.join(rootDir, 'src/renderer-lyric'),
        '@static': path.join(rootDir, 'src/static'),
        '@common': path.join(rootDir, 'src/common'),
      },
      extensions: ['.tsx', '.ts', '.js', '.json', '.node'],
    },
    module: {
      rules: [
        tsLoaderRule,
        {
          test: /\.node$/,
          use: 'node-loader',
        },
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
            options: {
              sourceMap: true,
            },
          }),
        },
        {
          test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
          exclude: path.join(rootDir, 'src/renderer/assets/svgs'),
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: 10000,
            },
          },
          generator: {
            filename: 'imgs/[name]-[contenthash:8][ext]',
          },
        },
        {
          test: /\.svg$/,
          include: path.join(rootDir, 'src/renderer/assets/svgs'),
          use: [
            {
              loader: 'svg-sprite-loader',
              options: {
                symbolId: 'icon-[name]',
              },
            },
            'svg-transform-loader',
            'svgo-loader',
          ],
        },
        {
          test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: 10000,
            },
          },
          generator: {
            filename: 'media/[name]-[contenthash:8][ext]',
          },
        },
        {
          test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: 10000,
            },
          },
          generator: {
            filename: 'fonts/[name]-[contenthash:8][ext]',
          },
        },
      ],
    },
    plugins: [
      new HTMLPlugin({
        filename: htmlFilename,
        template: path.join(rootDir, 'src', htmlTemplate),
        isProd: process.env.NODE_ENV == 'production',
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

module.exports = { createRendererBaseConfig }
