import { session } from 'electron'

// 主窗口使用独立分区会话(见 winMain/main.ts: session.fromPartition('persist:win-main'))
const WIN_MAIN_PARTITION = 'persist:win-main'

const getBase = () => (global.lx.appSetting['webdavPlay.url'] || '').trim().replace(/\/+$/, '')
const getCreds = () => ({
  username: global.lx.appSetting['webdavPlay.username'] || '',
  password: global.lx.appSetting['webdavPlay.password'] || '',
})

// 仅拦截 WebDAV 主机的请求(主机级匹配,端口由 startsWith(base) 内部精确判断)
const buildFilter = (): Electron.WebRequestFilter | null => {
  const base = getBase()
  if (!base) return null
  try {
    return { urls: [`*://${new URL(base).hostname}/*`] }
  } catch {
    return null
  }
}

/**
 * WebDAV 远程播放:audio.src 指向真实 WebDAV URL(不含凭证),
 * 这里在主窗口会话上为该主机的请求注入 Basic Auth,并补 CORS 头,
 * 以满足 createMediaElementSource(Web Audio)对 CORS 干净资源的要求,同时支持原生 Range/seek。
 */
const setup = (ses: Electron.Session) => {
  const filter = buildFilter()
  if (!filter) {
    ses.webRequest.onBeforeSendHeaders(null)
    ses.webRequest.onHeadersReceived(null)
    return
  }

  ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const base = getBase()
    if (base && details.url.startsWith(base)) {
      const { username, password } = getCreds()
      if (username) {
        details.requestHeaders.Authorization = `Basic ${Buffer.from(
          `${username}:${password}`
        ).toString('base64')}`
      }
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  ses.webRequest.onHeadersReceived(filter, (details, callback) => {
    const base = getBase()
    if (base && details.url.startsWith(base)) {
      const headers = details.responseHeaders ?? {}
      headers['Access-Control-Allow-Origin'] = ['*']
      callback({ responseHeaders: headers })
      return
    }
    callback({})
  })
}

export default () => {
  const ses = session.fromPartition(WIN_MAIN_PARTITION)
  setup(ses)
  global.lx.event_app.on('updated_config', (keys: Array<keyof LX.AppSetting>) => {
    if (keys.some((k) => String(k).startsWith('webdavPlay.'))) setup(ses)
  })
}
