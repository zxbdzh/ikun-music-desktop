const fs = require('fs')
const fsPromises = require('fs').promises
const path = require('path')
const { Arch } = require('electron-builder')
const nodeAbi = require('node-abi')

const better_sqlite3_fileNameMap = {
  [Arch.x64]: 'linux-x64',
  [Arch.arm64]: 'linux-arm64',
  [Arch.armv7l]: 'linux-arm',
}

// windows-smtc-monitor 的 .node 在独立平台包里,pnpm 不会把平台包 hoist 到顶层
// node_modules/@coooookies/,导致 electron-builder files 白名单按顶层路径匹配不到。
// 这里把平台包的 .node 复制进主包目录,使运行时 binding.js 走 existsSync 本地加载分支
// (require("./xxx.node")),不再依赖独立平台包是否可在 asar 内被 require 解析。
const smtc_arch_triple_map = {
  [Arch.x64]: 'win32-x64-msvc',
  [Arch.ia32]: 'win32-ia32-msvc',
  [Arch.arm64]: 'win32-arm64-msvc',
}

const copySmtcBinary = async (arch) => {
  const triple = smtc_arch_triple_map[arch]
  if (!triple) return
  let mainPkgDir
  try {
    mainPkgDir = path.dirname(require.resolve('@coooookies/windows-smtc-monitor'))
  } catch {
    console.log('[smtc] 主包未安装,跳过 SMTC 原生模块复制')
    return
  }
  let srcNodeFile
  try {
    // optionalDependencies 仅安装当前平台/架构的包,目标架构缺失时直接跳过(静默降级)
    srcNodeFile = require.resolve(`@coooookies/windows-smtc-monitor-${triple}`, {
      paths: [mainPkgDir],
    })
  } catch {
    console.log(`[smtc] 平台包 ${triple} 未安装(架构不匹配本机),跳过`)
    return
  }
  const destNodeFile = path.join(mainPkgDir, `windows-smtc-monitor.${triple}.node`)
  await fsPromises.copyFile(srcNodeFile, destNodeFile)
  console.log(`[smtc] 已复制原生模块 -> ${destNodeFile}`)
}

const replaceSqliteLib = async (electronNodeAbi, arch) => {
  console.log('replace sqlite lib...')
  const filePath = path.join(
    __dirname,
    `./lib/better_sqlite3_electron-v${electronNodeAbi}-${better_sqlite3_fileNameMap[arch]}.node`
  )
  console.log(filePath)
  const targetPath = path.join(
    __dirname,
    '../node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  )
  await fsPromises.unlink(targetPath).catch((_) => _)
  await fsPromises.copyFile(filePath, targetPath)
}

module.exports = async (context) => {
  const {electronPlatformName, arch} = context
  if (electronPlatformName === 'win32') {
    await copySmtcBinary(arch)
  }
  const electronVersion =
    context.packager?.info?._framework?.version ??
    require('../package.json').devDependencies.electron.replace(/^\D*?(\d+)/, '$1')
  const electronNodeAbi = nodeAbi.getAbi(electronVersion, 'electron')
  if (electronPlatformName !== 'linux' || process.env.FORCE) return
  const bindingFilePath = path.join(__dirname, '../node_modules/better-sqlite3/binding.gyp')
  const bindingBakFilePath = path.join(__dirname, '../node_modules/better-sqlite3/binding.gyp.bak')
  switch (arch) {
    case Arch.x64:
    case Arch.arm64:
    case Arch.armv7l:
      if (fs.existsSync(bindingFilePath)) {
        await fsPromises.rename(bindingFilePath, bindingBakFilePath)
      }
      await replaceSqliteLib(electronNodeAbi, arch)
      break

    default:
      if (fs.existsSync(bindingFilePath)) return
      await fsPromises.rename(bindingBakFilePath, bindingFilePath)
      break
  }
}
