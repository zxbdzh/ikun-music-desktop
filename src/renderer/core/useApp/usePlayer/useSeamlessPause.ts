import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import {
  initAdvancedAudioFeatures,
  getAudioContextInstance,
  setCrossfadeGainCurrent,
  rampCrossfadeGainCurrent,
  getActiveAudio,
  setPause,
} from '@renderer/plugins/player'
import { appSetting } from '@renderer/store/setting'
import { isPlay } from '@renderer/store/player/state'
import { setPlay } from '@renderer/store/player/action'

let pauseAnimId: number | null = null

const cancelSeamlessPause = () => {
  if (pauseAnimId != null) {
    cancelAnimationFrame(pauseAnimId)
    pauseAnimId = null
  }
}

const startFadeOut = (duration: number): Promise<void> => {
  return new Promise((resolve) => {
    const audioContext = getAudioContextInstance()
    if (!audioContext) {
      resolve()
      return
    }

    const now = audioContext.currentTime
    const endTime = now + duration

    setCrossfadeGainCurrent(1)
    rampCrossfadeGainCurrent(0, endTime)

    const animate = () => {
      if (audioContext.currentTime >= endTime) {
        pauseAnimId = null
        resolve()
        return
      }
      pauseAnimId = requestAnimationFrame(animate)
    }
    pauseAnimId = requestAnimationFrame(animate)
  })
}

const startFadeIn = (duration: number): Promise<void> => {
  return new Promise((resolve) => {
    const audioContext = getAudioContextInstance()
    if (!audioContext) {
      resolve()
      return
    }

    setCrossfadeGainCurrent(0)

    const activeAudio = getActiveAudio()
    if (activeAudio) {
      activeAudio.play().catch(() => {})
    }

    const now = audioContext.currentTime
    const endTime = now + duration

    rampCrossfadeGainCurrent(1, endTime)

    const animate = () => {
      if (audioContext.currentTime >= endTime) {
        pauseAnimId = null
        resolve()
        return
      }
      pauseAnimId = requestAnimationFrame(animate)
    }
    pauseAnimId = requestAnimationFrame(animate)
  })
}

export const seamlessPause = async (): Promise<boolean> => {
  if (!appSetting['player.seamlessPauseEnabled']) return false

  const duration = appSetting['player.seamlessPauseDuration']
  if (duration <= 0) return false

  if (isPlay.value) {
    try {
      initAdvancedAudioFeatures()
    } catch (_) {
      return false
    }

    await startFadeOut(duration)
    setPause()
    setPlay(false)
    return true
  }
  return false
}

export const seamlessResume = async (): Promise<boolean> => {
  if (!appSetting['player.seamlessPauseEnabled']) return false

  const duration = appSetting['player.seamlessPauseDuration']
  if (duration <= 0) return false

  if (!isPlay.value) {
    try {
      initAdvancedAudioFeatures()
    } catch (_) {
      return false
    }

    await startFadeIn(duration)
    setPlay(true)
    return true
  }
  return false
}

export const resetSeamlessPauseGain = () => {
  cancelSeamlessPause()
  setCrossfadeGainCurrent(1)
}

// 监听设置改变
watch(
  () => appSetting['player.seamlessPauseEnabled'],
  (enabled) => {
    if (!enabled) {
      resetSeamlessPauseGain()
    }
  }
)

export default () => {
  window.app_event.on('musicToggled', resetSeamlessPauseGain)

  onBeforeUnmount(() => {
    resetSeamlessPauseGain()
  })
}
