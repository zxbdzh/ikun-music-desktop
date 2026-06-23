import { session } from 'electron'

// 主窗口使用独立分区会话(见 winMain/main.ts: session.fromPartition('persist:win-main'))。
// Electron 每个会话只允许一个 onBeforeSendHeaders / onHeadersReceived 监听器,
// 多个功能(webdav 鉴权、bilibili 防盗链)需共用同一监听器,故由本协调器统一分发。
const WIN_MAIN_PARTITION = 'persist:win-main'

type BeforeSendHandler = (details: Electron.OnBeforeSendHeadersListenerDetails) => void
type HeadersReceivedHandler = (
  details: Electron.OnHeadersReceivedListenerDetails,
  responseHeaders: Record<string, string[]>
) => Record<string, string[]> | void

const beforeSendHandlers = new Set<BeforeSendHandler>()
const headersReceivedHandlers = new Set<HeadersReceivedHandler>()

let registered = false
const ensureRegistered = () => {
  if (registered) return
  registered = true
  const ses = session.fromPartition(WIN_MAIN_PARTITION)

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    for (const handler of beforeSendHandlers) {
      try {
        handler(details)
      } catch (err) {
        console.error(err)
      }
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  ses.webRequest.onHeadersReceived((details, callback) => {
    let responseHeaders: Record<string, string[]> = { ...(details.responseHeaders ?? {}) }
    for (const handler of headersReceivedHandlers) {
      try {
        const result = handler(details, responseHeaders)
        if (result) responseHeaders = result
      } catch (err) {
        console.error(err)
      }
    }
    callback({ responseHeaders })
  })
}

export const registerWinMainBeforeSendHeaders = (handler: BeforeSendHandler) => {
  ensureRegistered()
  beforeSendHandlers.add(handler)
}

export const registerWinMainHeadersReceived = (handler: HeadersReceivedHandler) => {
  ensureRegistered()
  headersReceivedHandlers.add(handler)
}
