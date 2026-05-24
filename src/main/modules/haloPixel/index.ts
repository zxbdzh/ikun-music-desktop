import { HaloPixelDevice } from './device'
import { LyricSender, type LyricSenderOptions } from './lyricSender'
import { LyricMatcher } from './lyricMatcher'
import { LyricTimer } from './lyricTimer'
import { app } from 'electron'

const RECONNECT_INTERVAL = 3000

let device: HaloPixelDevice | null = null
let sender: LyricSender | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let enabled = false
const matcher = new LyricMatcher()
const timer = new LyricTimer()

const DISPLAY_KEYS = [
  'haloPixel.lyricMode',
  'haloPixel.autoScroll',
  'haloPixel.scrollThreshold',
  'haloPixel.typewriter',
  'haloPixel.typewriterSpeed',
  'haloPixel.typewriterSync',
  'haloPixel.alternateSplit',
  'haloPixel.alternateInterval',
] satisfies Array<keyof LX.AppSetting>

const readOptions = (): LyricSenderOptions => ({
  autoScroll: global.lx.appSetting['haloPixel.autoScroll'],
  scrollThreshold: global.lx.appSetting['haloPixel.scrollThreshold'],
  typewriter: global.lx.appSetting['haloPixel.typewriter'],
  typewriterSpeed: global.lx.appSetting['haloPixel.typewriterSpeed'],
  typewriterSync: global.lx.appSetting['haloPixel.typewriterSync'],
  playbackRate: global.lx.player_status.playbackRate || 1,
  alternateSplit: global.lx.appSetting['haloPixel.alternateSplit'],
  alternateInterval: global.lx.appSetting['haloPixel.alternateInterval'],
})

const getProgress = (): number => global.lx.player_status.progress || 0

const startReconnect = (): void => {
  if (reconnectTimer) return
  reconnectTimer = setInterval(() => {
    if (enabled && device && !device.isConnected) device.open()
  }, RECONNECT_INTERVAL)
}

const stopReconnect = (): void => {
  if (!reconnectTimer) return
  clearInterval(reconnectTimer)
  reconnectTimer = null
}

const enable = (): void => {
  if (enabled) return
  enabled = true
  device ??= new HaloPixelDevice()
  sender ??= new LyricSender(device, readOptions())
  sender.setOptions(readOptions())
  sender.reset()
  device.open()
  startReconnect()
}

const disable = (): void => {
  if (!enabled) return
  enabled = false
  stopReconnect()
  sender?.reset()
  device?.close()
}

const resolveText = (rawText: string): string => {
  const mode = global.lx.appSetting['haloPixel.lyricMode']
  if (mode === 'original' || !rawText) return rawText
  const extLrc = mode === 'roma' ? global.lx.player_status.rlyric : global.lx.player_status.tlyric
  return matcher.resolve(rawText, global.lx.player_status.lyric ?? '', extLrc ?? '')
}

const sendResolved = (rawText: string): void => {
  if (!sender) return
  sender.updateProgress(getProgress())
  const resolved = resolveText(rawText)
  const { timings, lineDurationMs } = timer.getTimingsWithDuration(rawText)
  sender.sendLyric(resolved, timings, lineDurationMs)
}

const handlePlayerStatus = (status: Partial<LX.Player.Status>): void => {
  if (!enabled || !sender) return

  if (status.playbackRate != null) {
    sender.setOptions(readOptions())
  }
  if (status.lxlyric != null) {
    timer.updateLxlyric(status.lxlyric as string)
  }
  if (status.lyric != null) {
    timer.updateLyric(status.lyric as string)
  }

  if (status.status) {
    switch (status.status) {
      case 'playing':
        sendResolved(global.lx.player_status.lyricLineText)
        break
      case 'paused':
      case 'stoped':
      case 'error':
        sender.showClock()
        break
    }
  } else if (status.lyricLineText != null) {
    sendResolved(status.lyricLineText as string)
  }
}

export const isDeviceConnected = (): boolean => enabled && (device?.isConnected ?? false)

export default () => {
  global.lx.event_app.on('player_status', handlePlayerStatus)
  global.lx.event_app.on('updated_config', (keys) => {
    if (keys.includes('haloPixel.enable')) {
      global.lx.appSetting['haloPixel.enable'] ? enable() : disable()
    }
    sender?.setOptions(readOptions())
    if (enabled && DISPLAY_KEYS.some((k) => keys.includes(k))) {
      sender?.reset()
      sendResolved(global.lx.player_status.lyricLineText)
    }
  })

  if (global.lx.appSetting['haloPixel.enable']) enable()

  app.on('will-quit', () => {
    sender?.showClock()
    device?.close()
  })
}
