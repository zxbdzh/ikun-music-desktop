import { app } from 'electron'
import path from 'node:path'
import { mainHandle } from '@common/mainIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { sendEvent } from '@main/modules/winMain/main'
import * as smtcMirror from '@main/modules/haloPixel/smtcMirror'

const STOP_DELAY_MS = 1200

let isExternalMediaPlaying = false
let stopTimer: NodeJS.Timeout | null = null
let unsubscribe: (() => void) | null = null

const clearTimer = (timer: NodeJS.Timeout | null): void => {
  if (timer) clearTimeout(timer)
}

const isOwnSession = (sourceAppId: string): boolean => {
  const id = sourceAppId.trim().toLowerCase()
  if (!id) return false

  const executableName = path.basename(process.execPath).toLowerCase()
  const appName = app.getName().toLowerCase()
  return (
    id === executableName ||
    id.endsWith(`\\${executableName}`) ||
    id === appName ||
    id.includes('cn.toside.music.desktop') ||
    id.includes('ikun-music-desktop')
  )
}

const setExternalMediaPlaying = (value: boolean): void => {
  if (isExternalMediaPlaying === value) return
  isExternalMediaPlaying = value
  sendEvent(WIN_MAIN_RENDERER_EVENT_NAME.external_media_playing, value)
}

const hasExternalPlayingSession = (): boolean => {
  return smtcMirror.getPlayingSessions().some((session) => !isOwnSession(session.sourceAppId))
}

const syncPlaybackState = (): void => {
  if (!smtcMirror.isAvailable()) {
    clearTimer(stopTimer)
    stopTimer = null
    setExternalMediaPlaying(false)
    return
  }
  const hasExternalSession = hasExternalPlayingSession()
  if (hasExternalSession) {
    clearTimer(stopTimer)
    stopTimer = null
    setExternalMediaPlaying(true)
    return
  }

  if (!isExternalMediaPlaying || stopTimer) return
  stopTimer = setTimeout(() => {
    stopTimer = null
    if (!hasExternalPlayingSession()) setExternalMediaPlaying(false)
  }, STOP_DELAY_MS)
}

const stopMonitoring = (): void => {
  unsubscribe?.()
  unsubscribe = null
  clearTimer(stopTimer)
  stopTimer = null
  setExternalMediaPlaying(false)
}

const syncMonitoring = (): void => {
  if (!global.lx.appSetting['player.externalMediaDuckingEnabled'] || !smtcMirror.isAvailable()) {
    stopMonitoring()
    return
  }
  unsubscribe ??= smtcMirror.subscribe(syncPlaybackState)
  syncPlaybackState()
}

export default () => {
  mainHandle<boolean>(WIN_MAIN_RENDERER_EVENT_NAME.external_media_playing, async () => {
    return isExternalMediaPlaying
  })

  global.lx.event_app.on('updated_config', (keys) => {
    if (keys.includes('player.externalMediaDuckingEnabled')) syncMonitoring()
  })

  syncMonitoring()
  app.on('will-quit', stopMonitoring)
}
