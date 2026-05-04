/**
 * 花再音响歌词发送器
 * 协调歌词发送和布局设置
 */

import { haloPixelDevice } from './device'
import { HaloPixelTextLayout, HaloPixelSettings, LyricLineData } from './types'

// 默认设置
const DEFAULT_SETTINGS: HaloPixelSettings = {
  enable: false,
  autoScroll: true,
  lyricMode: 'original',
  scrollThreshold: 30,
}

// 歌词发送器单例
class LyricSender {
  private settings: HaloPixelSettings = { ...DEFAULT_SETTINGS }
  private currentLayout: HaloPixelTextLayout = HaloPixelTextLayout.Center

  /**
   * 更新设置
   */
  updateSettings(newSettings: Partial<HaloPixelSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
  }

  /**
   * 获取当前设置
   */
  getSettings(): HaloPixelSettings {
    return { ...this.settings }
  }

  /**
   * 获取要显示的歌词文本
   */
  private getLyricText(data: LyricLineData): string {
    switch (this.settings.lyricMode) {
      case 'translation':
        return data.translation || data.original
      case 'roma':
        return data.roma || data.original
      default:
        return data.original
    }
  }

  /**
   * 发送歌词到设备
   */
  sendLyric(data: LyricLineData | null): void {
    console.log('[HaloPixel] sendLyric called:', {
      enable: this.settings.enable,
      isConnected: haloPixelDevice.isConnected,
      data: data ? { line: data.line, original: data.original?.substring(0, 20) } : null
    })

    // 如果未启用或设备未连接，直接返回
    if (!this.settings.enable) {
      console.log('[HaloPixel] Skipped: not enabled')
      return
    }
    if (!haloPixelDevice.isConnected) {
      console.log('[HaloPixel] Skipped: device not connected')
      return
    }

    if (!data || !data.original) {
      // 发送空格清除显示
      console.log('[HaloPixel] Sending space to clear')
      haloPixelDevice.sendText(' ')
      return
    }

    const text = this.getLyricText(data)
    console.log('[HaloPixel] Sending text:', text.substring(0, 30), 'length:', text.length)

    // 自动滚动逻辑: 歌词长度超过阈值时启用滚动
    const shouldScroll = this.settings.autoScroll && text.length > this.settings.scrollThreshold
    const newLayout = shouldScroll ? HaloPixelTextLayout.ScrollRightToLeft : HaloPixelTextLayout.Center
    console.log('[HaloPixel] Layout:', HaloPixelTextLayout[newLayout], 'shouldScroll:', shouldScroll)

    // 只有布局变化时才发送布局命令
    if (newLayout !== this.currentLayout) {
      haloPixelDevice.setLayout(newLayout)
      this.currentLayout = newLayout
    }

    haloPixelDevice.sendText(text)
  }

  /**
   * 清除歌词显示
   */
  clear(): void {
    if (!this.settings.enable) return
    if (!haloPixelDevice.isConnected) return

    haloPixelDevice.sendText(' ')
    this.currentLayout = HaloPixelTextLayout.Center
  }

  /**
   * 重置布局为居中
   */
  resetLayout(): void {
    if (!this.settings.enable) return
    if (!haloPixelDevice.isConnected) return

    haloPixelDevice.setLayout(HaloPixelTextLayout.Center)
    this.currentLayout = HaloPixelTextLayout.Center
  }
}

// 导出单例
export const lyricSender = new LyricSender()
