import { registerWinMainBeforeSendHeaders, registerWinMainHeadersReceived } from '../winMainSession'

const getBase = () => (global.lx.appSetting['webdavPlay.url'] || '').trim().replace(/\/+$/, '')
const getCreds = () => ({
  username: global.lx.appSetting['webdavPlay.username'] || '',
  password: global.lx.appSetting['webdavPlay.password'] || '',
})

/**
 * WebDAV 远程播放:audio.src 指向真实 WebDAV URL(不含凭证),
 * 这里在主窗口会话上为该主机的请求注入 Basic Auth,并补 CORS 头,
 * 以满足 createMediaElementSource(Web Audio)对 CORS 干净资源的要求,同时支持原生 Range/seek。
 * 配置变更无需重新注册:处理器每次请求都实时读取最新配置。
 */
export default () => {
  registerWinMainBeforeSendHeaders((details) => {
    const base = getBase()
    if (base && details.url.startsWith(base)) {
      const { username, password } = getCreds()
      if (username) {
        details.requestHeaders.Authorization = `Basic ${Buffer.from(
          `${username}:${password}`
        ).toString('base64')}`
      }
    }
  })

  registerWinMainHeadersReceived((details, responseHeaders) => {
    const base = getBase()
    if (base && details.url.startsWith(base)) {
      responseHeaders['Access-Control-Allow-Origin'] = ['*']
      return responseHeaders
    }
  })
}
