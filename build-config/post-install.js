const { Arch } = require('electron-builder')
require('./build-before-pack').default({
  electronPlatformName: process.platform,
  arch: Arch[process.arch],
})
