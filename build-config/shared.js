const path = require('path')
const webpack = require('webpack')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(__dirname, '../src')
const DIST = path.join(__dirname, '../dist')

const isDev = process.env.NODE_ENV === 'development'

// ── Path aliases (superset used by renderer targets) ──
const rendererAliases = {
  '@root': SRC,
  '@main': path.join(SRC, 'main'),
  '@renderer': path.join(SRC, 'renderer'),
  '@lyric': path.join(SRC, 'renderer-lyric'),
  '@static': path.join(SRC, 'static'),
  '@common': path.join(SRC, 'common'),
}

// main process only needs a subset
const mainAliases = {
  '@main': rendererAliases['@main'],
  '@renderer': rendererAliases['@renderer'],
  '@lyric': rendererAliases['@lyric'],
  '@common': rendererAliases['@common'],
}

// ── Common resolve extensions ──
const extensions = ['.tsx', '.ts', '.js', '.json', '.node']
const extensionsWithMjs = ['.tsx', '.ts', '.js', '.mjs', '.json', '.node']

// ── Common loaders ──
const tsLoader = (vueSupport = false) => ({
  test: /\.tsx?$/,
  exclude: /node_modules/,
  use: {
    loader: 'ts-loader',
    options: vueSupport ? { appendTsSuffixTo: [/\.vue$/] } : {},
  },
})

const nodeLoader = {
  test: /\.node$/,
  use: 'node-loader',
}

const babelLoader = {
  test: /\.js$/,
  loader: 'babel-loader',
  exclude: /node_modules/,
}

// ── DefinePlugin helpers ──
const vueDefines = {
  __VUE_OPTIONS_API__: 'true',
  __VUE_PROD_DEVTOOLS__: 'false',
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
}

function devDefines(extra = {}) {
  return new webpack.DefinePlugin({
    'process.env': {
      NODE_ENV: '"development"',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    ...extra,
  })
}

function prodDefines(extra = {}) {
  return new webpack.DefinePlugin({
    'process.env': {
      NODE_ENV: '"production"',
    },
    ...extra,
  })
}

// ── Performance presets ──
const MB = 1024 * 1024
const perfDev = { hints: false }
const perfProd = {
  maxEntrypointSize: 10 * MB,
  maxAssetSize: 20 * MB,
  hints: 'warning',
}
const perfDevRelaxed = {
  maxEntrypointSize: 50 * MB,
  maxAssetSize: 30 * MB,
}

// ── Git info (for prod builds) ──
function getGitInfo() {
  const info = { commit_id: '', commit_date: '' }
  try {
    let isClean = !execSync('git status --porcelain').toString().trim()
    if (process.env.BUILD_WIN7) {
      console.warn('BUILD_WIN7 is set, skipping git status check.')
      isClean = true
    }
    if (isClean) {
      info.commit_id = execSync('git log -1 --pretty=format:"%H"').toString().trim()
      info.commit_date = execSync('git log -1 --pretty=format:"%ad" --date=iso-strict').toString().trim()
    } else if (process.env.IS_CI) {
      throw new Error('Working directory is not clean')
    }
  } catch {}
  return info
}

// ── Common output config ──
function output(filename) {
  return {
    filename: filename || '[name].js',
    library: { type: 'commonjs2' },
    path: DIST,
  }
}

module.exports = {
  ROOT,
  SRC,
  DIST,
  isDev,
  rendererAliases,
  mainAliases,
  extensions,
  extensionsWithMjs,
  tsLoader,
  nodeLoader,
  babelLoader,
  vueDefines,
  devDefines,
  prodDefines,
  perfDev,
  perfProd,
  perfDevRelaxed,
  getGitInfo,
  output,
}
