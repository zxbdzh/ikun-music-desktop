import { desktopCapturer, session } from 'electron'
import { mainHandle } from '@common/mainIpc'
import { DESKTOP_CAPTURER_EVENT_NAME } from '@common/ipcNames'

interface DesktopCapturerSource {
  id: string
  name: string
}

export const registerRendererEvents = (
  sendEvent: <T = any>(name: string, params?: T | undefined) => void,
  ses?: Electron.Session
) => {
  console.log('[desktopCapturer] 注册 handler:', DESKTOP_CAPTURER_EVENT_NAME.get_sources)

  // 使用传入的 session 或 defaultSession
  const targetSession = ses || session.defaultSession

  // ========== Electron 38+ setDisplayMediaRequestHandler ==========
  targetSession.setDisplayMediaRequestHandler((request, callback) => {
    console.log('[desktopCapturer] Display media request:', {
      audioRequested: request.audioRequested,
      videoRequested: request.videoRequested,
    })

    const options: Electron.SourcesOptions = {
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    }

    desktopCapturer.getSources(options).then((sources) => {
      if (!sources.length) {
        console.log('[desktopCapturer] 未找到可用源')
        callback(null as unknown as Electron.Streams)
        return
      }

      // 优先选择屏幕源
      const screenSource = sources.find(s => s.id.startsWith('screen:'))
      const source = screenSource || sources[0]

      console.log('[desktopCapturer] 授权源:', source.name)

      // callback 格式：{ video: source, audio: 'loopback' }
      // eslint-disable-next-line standard/no-callback-literal
      callback({
        video: source,
        audio: 'loopback',
      })
    }).catch((err) => {
      console.error('[desktopCapturer] getSources error:', err)
      callback(null as unknown as Electron.Streams)
    })
  }, { useSystemPicker: false }) // useSystemPicker 仅 macOS 15+ 支持
  // ========== Electron 38+ setDisplayMediaRequestHandler ==========

  mainHandle<{ types: ('screen' | 'window')[]; fetchDesktopAudio?: boolean }, DesktopCapturerSource[]>(
    DESKTOP_CAPTURER_EVENT_NAME.get_sources,
    async ({ params }) => {
      const options: any = {
        types: params.types,
        thumbnailSize: { width: 0, height: 0 }, // 不需要缩略图
      }
      if (params.fetchDesktopAudio) {
        options.fetchDesktopAudio = true
      }

      // 添加超时控制，避免 IPC 挂起
      const timeoutMs = 10000
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('获取桌面源超时')), timeoutMs)
      })

      try {
        const sources = await Promise.race([
          desktopCapturer.getSources(options),
          timeout,
        ])
        console.log('[desktopCapturer] 获取源成功，数量:', sources.length)
        return sources.map((source) => ({
          id: source.id,
          name: source.name,
        }))
      } catch (err) {
        console.error('[desktopCapturer] 获取源失败:', err)
        throw err
      }
    }
  )
}

export default () => {}
