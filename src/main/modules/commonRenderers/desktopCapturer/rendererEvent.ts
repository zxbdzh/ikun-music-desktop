import { desktopCapturer } from 'electron'
import { mainHandle } from '@common/mainIpc'
import { DESKTOP_CAPTURER_EVENT_NAME } from '@common/ipcNames'

interface DesktopCapturerSource {
  id: string
  name: string
}

export default () => {
  console.log('[desktopCapturer] 注册 handler:', DESKTOP_CAPTURER_EVENT_NAME.get_sources)
  mainHandle<{ types: ('screen' | 'window')[]; fetchDesktopAudio?: boolean }, DesktopCapturerSource[]>(
    DESKTOP_CAPTURER_EVENT_NAME.get_sources,
    async ({ params }) => {
      const options: any = {
        types: params.types,
        thumbnailSize: { width: 150, height: 150 },
      }
      if (params.fetchDesktopAudio) {
        options.fetchDesktopAudio = true
      }
      const sources = await desktopCapturer.getSources(options)
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
      }))
    }
  )
}
