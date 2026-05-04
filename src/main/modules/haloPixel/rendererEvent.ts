/**
 * 花再音响 IPC 事件处理
 */

import { mainHandle, mainOn, mainSend } from '@common/mainIpc'
import { HALO_PIXEL_EVENT_NAME } from '@common/ipcNames'
import { haloPixelDevice } from './device'
import { lyricSender } from './lyricSender'
import { HaloPixelSettings, LyricLineData } from './types'

export default () => {
  // 初始化设备
  mainHandle(HALO_PIXEL_EVENT_NAME.init_device, async () => {
    return await haloPixelDevice.initialize()
  })

  // 关闭设备
  mainHandle(HALO_PIXEL_EVENT_NAME.close_device, async () => {
    haloPixelDevice.close()
    return true
  })

  // 获取设备状态
  mainHandle(HALO_PIXEL_EVENT_NAME.get_device_status, async () => {
    return haloPixelDevice.isConnected
  })

  // 获取设置
  mainHandle(HALO_PIXEL_EVENT_NAME.get_settings, async () => {
    return lyricSender.getSettings()
  })

  // 更新设置
  mainHandle<HaloPixelSettings, boolean>(HALO_PIXEL_EVENT_NAME.set_settings, async ({ params }) => {
    console.log('[HaloPixel] set_settings received:', JSON.stringify(params))
    lyricSender.updateSettings(params)
    console.log('[HaloPixel] settings after update:', JSON.stringify(lyricSender.getSettings()))

    // 如果启用设备但未连接，则尝试连接
    if (params.enable && !haloPixelDevice.isConnected) {
      const connected = await haloPixelDevice.initialize()
      if (!connected) {
        console.warn('[HaloPixel] Failed to connect device')
      }
    }

    // 如果禁用设备，则断开连接
    if (params.enable === false) {
      haloPixelDevice.close()
    }

    return true
  })

  // 发送歌词
  mainOn<LyricLineData>(HALO_PIXEL_EVENT_NAME.send_lyric, ({ params }) => {
    lyricSender.sendLyric(params)
  })

  // 清除歌词
  mainOn(HALO_PIXEL_EVENT_NAME.clear_lyric, () => {
    lyricSender.clear()
  })
}

/**
 * 发送歌词到花再音响（从渲染进程调用）
 */
export const sendLyricToHaloPixel = (
  mainWindow: Electron.BrowserWindow,
  line: number,
  original: string,
  translation?: string | null,
  roma?: string | null
) => {
  if (!original) {
    mainSend(mainWindow, HALO_PIXEL_EVENT_NAME.clear_lyric)
    return
  }

  mainSend(mainWindow, HALO_PIXEL_EVENT_NAME.send_lyric, {
    line,
    original,
    translation,
    roma,
  })
}
