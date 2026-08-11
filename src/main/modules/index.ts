import registerUserApi from './userApi'
import registerWinMain from './winMain'
import registerHotKey from './hotKey'
import registerTray from './tray'
import registerAppMenu from './appMenu'
import registerWinLyric from './winLyric'
import registerCommonRenderers from './commonRenderers'
import registerWebdavStream from './webdavStream'
import registerBilibiliHeaders from './bilibiliHeaders'
import registerHaloPixel from './haloPixel'
import registerExternalMediaDucking from './externalMediaDucking'
import registerPodcast from './podcast'

let isRegistered = false
export default () => {
  if (isRegistered) return
  registerUserApi()
  registerCommonRenderers()
  registerWinMain()
  registerHotKey()
  registerTray()
  registerAppMenu()
  registerWinLyric()
  registerWebdavStream()
  registerBilibiliHeaders()
  registerHaloPixel()
  registerExternalMediaDucking()
  registerPodcast()
  isRegistered = true
}
