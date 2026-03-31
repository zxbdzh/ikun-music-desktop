process.env.NODE_ENV = 'production'

const chalk = require('chalk')
const del = require('del')
const webpack = require('webpack')
const Spinnies = require('spinnies')
const { Worker, isMainThread, parentPort } = require('worker_threads')

const errorLog = chalk.bgRed.white(' ERROR ') + ' '
const okayLog = chalk.bgGreen.white(' OKAY ') + ' '

const targets = [
  { name: 'main', config: './main/webpack.config.prod' },
  { name: 'renderer', config: './renderer/webpack.config.prod' },
  { name: 'renderer-lyric', config: './renderer-lyric/webpack.config.prod' },
  { name: 'renderer-scripts', config: './renderer-scripts/webpack.config.prod' },
]

function build() {
  console.time('build')
  del.sync(['dist/**', 'build/**'])

  const spinners = new Spinnies({ color: 'blue' })
  let results = ''

  const tasks = targets.map(({ name, config }) => {
    spinners.add(name, { text: `${name} building` })
    return pack(config)
      .then((result) => {
        results += result + '\n\n'
        spinners.succeed(name, { text: `${name} build success!` })
      })
      .catch((err) => {
        spinners.fail(name, { text: `${name} build fail :(` })
        console.log(`\n  ${errorLog}failed to build ${name} process`)
        console.error(`\n${err}\n`)
        process.exit(1)
      })
  })

  Promise.all(tasks).then(() => {
    process.stdout.write('\x1B[2J\x1B[0f')
    console.log(`\n\n${results}`)
    console.log(`${okayLog}take it away ${chalk.yellow('`electron-builder`')}\n`)
    console.timeEnd('build')
    process.exit()
  })
}

function pack(config) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename)
    const subChannel = new MessageChannel()
    worker.postMessage({ port: subChannel.port1, config }, [subChannel.port1])
    subChannel.port2.on('message', ({ status, message }) => {
      if (status === 'success') resolve(message)
      else reject(message)
    })
  })
}

function runPack(config) {
  return new Promise((resolve, reject) => {
    config = require(config)
    config.mode = 'production'
    webpack(config, (err, stats) => {
      if (err) return reject(err.stack || err)
      if (stats.hasErrors()) {
        return reject(
          stats
            .toString({ chunks: false, modules: false, colors: true })
            .split(/\r?\n/)
            .map((line) => `    ${line}`)
            .join('\n')
        )
      }
      resolve(stats.toString({ chunks: false, colors: true }))
    })
  })
}

if (isMainThread) {
  build()
} else {
  parentPort.once('message', ({ port, config }) => {
    runPack(config)
      .then((result) => port.postMessage({ status: 'success', message: result }))
      .catch((err) => port.postMessage({ status: 'error', message: err }))
      .finally(() => port.close())
  })
}
