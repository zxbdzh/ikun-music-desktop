process.env.NODE_ENV = 'development'

const chalk = require('chalk')
const electron = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpackHotMiddleware = require('webpack-hot-middleware')
const { Arch } = require('electron-builder')
const treeKill = require('tree-kill')

const mainConfig = require('./main/webpack.config.dev')
const rendererConfig = require('./renderer/webpack.config.dev')
const rendererLyricConfig = require('./renderer-lyric/webpack.config.dev')
const rendererScriptConfig = require('./renderer-scripts/webpack.config.dev')
const replaceLib = require('./build-before-pack')
const { debounce } = require('./utils')

let electronProcess = null
const hotMiddlewares = {}

// ── Renderer dev server factory ──
function startRendererDevServer(name, config, port, staticOpts) {
  return new Promise((resolve) => {
    const compiler = webpack(config)
    const hmr = webpackHotMiddleware(compiler, { log: false, heartbeat: 2500 })
    hotMiddlewares[name] = hmr

    compiler.hooks.compilation.tap('compilation', (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
        'html-webpack-plugin-after-emit',
        (data, cb) => {
          hmr.publish({ action: 'reload' })
          cb()
        }
      )
    })

    const serverOpts = {
      port,
      hot: true,
      historyApiFallback: true,
      client: { logging: 'warn', overlay: true },
      setupMiddlewares(middlewares, devServer) {
        devServer.app.use(hmr)
        setImmediate(() => devServer.middleware.waitUntilValid(resolve))
        return middlewares
      },
    }
    if (staticOpts) serverOpts.static = staticOpts

    new WebpackDevServer(serverOpts, compiler).start()
  })
}

function startRendererScripts() {
  return new Promise((resolve) => {
    const compiler = webpack(rendererScriptConfig)
    compiler.watch({}, (err) => {
      if (err) console.log(err)
      resolve()
    })
  })
}

function startMain() {
  let firstRun = true
  return new Promise((resolve, reject) => {
    const runElectronDelay = debounce(startElectron, 200)
    const compiler = webpack(mainConfig)

    compiler.hooks.watchRun.tapAsync('watch-run', (compilation, done) => {
      Object.values(hotMiddlewares).forEach((hmr) => {
        hmr.publish({ action: 'compiling' })
      })
      done()
    })

    compiler.watch({}, (err, stats) => {
      if (err) {
        console.log(err)
        return reject(err)
      }
      if (electronProcess) {
        electronProcess.removeAllListeners()
        treeKill(electronProcess.pid)
      }
      if (firstRun) {
        firstRun = false
        resolve()
      } else {
        runElectronDelay()
      }
    })
  })
}

function startElectron() {
  let args = ['--inspect=5858', path.join(__dirname, '../dist/main.js')]

  if (process.env.npm_execpath.endsWith('yarn.js')) {
    args = args.concat(process.argv.slice(3))
  } else if (process.env.npm_execpath.endsWith('npm-cli.js')) {
    args = args.concat(process.argv.slice(2))
  }

  electronProcess = spawn(electron, args)
  electronProcess.stdout.on('data', (data) => electronLog(data, 'blue'))
  electronProcess.stderr.on('data', (data) => electronLog(data, 'red'))
  electronProcess.on('close', () => process.exit())
}

const suppressedLogs = [
  'Manifest version 2 is deprecated',
  'Extension server error: Operation failed: Permission denied',
  'Electron sandbox_bundle.js script failed to run',
  'TypeError: object null is not iterable',
]

function electronLog(data, color) {
  const log = data.toString()
  if (!/[0-9A-z]+/.test(log)) return
  if (color === 'red' && suppressedLogs.some((s) => log.includes(s))) return
  console.log(chalk[color](log))
}

function init() {
  const Spinnies = require('spinnies')
  const spinners = new Spinnies({ color: 'blue' })

  const targets = ['main', 'renderer', 'renderer-lyric', 'renderer-scripts']
  targets.forEach((name) => spinners.add(name, { text: `${name} compiling` }))

  const ok = (name) => spinners.succeed(name, { text: `${name} compile success!` })
  const fail = (name, err) => {
    spinners.fail(name, { text: `${name} compile fail!` })
    if (err?.message) console.error(err.message)
  }

  replaceLib({ electronPlatformName: process.platform, arch: Arch[process.arch] })

  Promise.all([
    startRendererDevServer('renderer', rendererConfig, 9080, {
      directory: path.join(__dirname, '../src/common/theme/images'),
      publicPath: '/theme_images',
    }).then(() => ok('renderer')).catch((err) => fail('renderer', err)),

    startRendererDevServer('renderer-lyric', rendererLyricConfig, 9081)
      .then(() => ok('renderer-lyric')).catch((err) => fail('renderer-lyric', err)),

    startRendererScripts()
      .then(() => ok('renderer-scripts')).catch((err) => fail('renderer-scripts', err)),

    startMain()
      .then(() => ok('main')).catch((err) => fail('main', err)),
  ])
    .then(startElectron)
    .catch(console.error)
}

init()
