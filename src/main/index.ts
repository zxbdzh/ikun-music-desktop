import { app, protocol } from 'electron'
import './utils/logInit'
import '@common/error'
import {
  initGlobalData,
  initSingleInstanceHandle,
  applyElectronEnvParams,
  setUserDataPath,
  registerDeeplink,
  listenerAppEvent,
} from './app'
import { isLinux } from '@common/utils'
import { initAppSetting } from '@main/app'
import registerModules from '@main/modules'

// 注册自定义协议 scheme（必须在 app ready 之前）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lxmusic-audio',
    privileges: {
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])

// 初始化应用
const init = () => {
  console.log('init')
  void initAppSetting().then(() => {
    registerModules()
    global.lx.event_app.app_inited()
  })
}

initGlobalData()
initSingleInstanceHandle()
applyElectronEnvParams()
setUserDataPath()
registerDeeplink(init)
listenerAppEvent(init)

// https://github.com/electron/electron/issues/16809
void app.whenReady().then(() => {
  isLinux ? setTimeout(init, 300) : init()
})
