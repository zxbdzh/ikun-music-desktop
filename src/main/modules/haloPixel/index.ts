import { HaloPixelDevice } from './device'
import { LyricSender, type LyricSenderOptions } from './lyricSender'

const RECONNECT_INTERVAL = 3000

let device: HaloPixelDevice | null = null
let sender: LyricSender | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let enabled = false

const readOptions = (): LyricSenderOptions => ({
  autoScroll: global.lx.appSetting['haloPixel.autoScroll'],
  scrollThreshold: global.lx.appSetting['haloPixel.scrollThreshold'],
})

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

const handlePlayerStatus = (status: Partial<LX.Player.Status>): void => {
  if (!enabled || !sender) return
  if (status.status) {
    switch (status.status) {
      case 'playing':
        sender.sendLyric(global.lx.player_status.lyricLineText)
        break
      case 'paused':
      case 'stoped':
      case 'error':
        sender.showClock()
        break
    }
  } else if (status.lyricLineText != null) {
    sender.sendLyric(status.lyricLineText)
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
  })

  if (global.lx.appSetting['haloPixel.enable']) enable()
}
