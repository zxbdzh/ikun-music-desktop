import { registerRendererEvents as common } from '@main/modules/commonRenderers/common'
import { registerRendererEvents as list } from '@main/modules/commonRenderers/list'
import { registerRendererEvents as dislike } from '@main/modules/commonRenderers/dislike'
import { registerRendererEvents as desktopCapturer } from '@main/modules/commonRenderers/desktopCapturer'
import { session } from 'electron'
import app, { sendConfigChange } from './app'
import hotKey from './hotKey'
import userApi from './userApi'
import sync from './sync'
import data from './data'
import music from './music'
import download from './download'
import soundEffect from './soundEffect'
import openAPI from './openAPI'
import { sendEvent } from '../main'

export * from './app'
export * from './hotKey'
export * from './userApi'
export * from './sync'
export * from './process'

let isInitialized = false
export default () => {
  if (isInitialized) return
  isInitialized = true

  common(sendEvent)
  list(sendEvent)
  dislike(sendEvent)
  // 使用与窗口相同的 session 分区，确保 setDisplayMediaRequestHandler 能拦截 getDisplayMedia
  const ses = session.fromPartition('persist:win-main')
  desktopCapturer(sendEvent, ses)
  app()
  hotKey()
  userApi()
  sync()
  data()
  music()
  download()
  soundEffect()
  openAPI()

  global.lx.event_app.on('updated_config', (keys, setting) => {
    sendConfigChange(setting)
  })
}
