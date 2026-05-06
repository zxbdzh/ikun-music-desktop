import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import {
  initAdvancedAudioFeatures,
  getAudioContextInstance,
  setCrossfadeGainCurrent,
  setCrossfadeGainSecondary,
  rampCrossfadeGainCurrent,
  getActiveAudio,
  setPause,
  stopSecondary,
} from '@renderer/plugins/player'
import { appSetting } from '@renderer/store/setting'
import { isPlay } from '@renderer/store/player/state'
import { setPlay } from '@renderer/store/player/action'
import { isCrossfading, cancelCrossfade, isSeamlessPausing } from './crossfadeState'

let pauseAnimId: number | null = null
let pauseTimeoutId: NodeJS.Timeout | null = null

// 等待一帧 / 短延迟（窗口后台时 RAF 会被节流，用 setTimeout 兜底）
const waitNextFrame = (): Promise<void> => {
  return new Promise((resolve) => {
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      resolve()
    }
    requestAnimationFrame(finish)
    setTimeout(finish, 50)
  })
}

const cancelSeamlessPause = () => {
  if (pauseAnimId != null) {
    cancelAnimationFrame(pauseAnimId)
    pauseAnimId = null
  }
  if (pauseTimeoutId != null) {
    clearTimeout(pauseTimeoutId)
    pauseTimeoutId = null
  }
  isSeamlessPausing.value = false
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

    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      if (pauseAnimId != null) {
        cancelAnimationFrame(pauseAnimId)
        pauseAnimId = null
      }
      if (pauseTimeoutId != null) {
        clearTimeout(pauseTimeoutId)
        pauseTimeoutId = null
      }
      resolve()
    }

    // setTimeout 兜底，确保窗口后台时 RAF 被节流也能完成
    pauseTimeoutId = setTimeout(finish, duration * 1000 + 50)

    const animate = () => {
      if (audioContext.currentTime >= endTime) {
        finish()
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

    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      if (pauseAnimId != null) {
        cancelAnimationFrame(pauseAnimId)
        pauseAnimId = null
      }
      if (pauseTimeoutId != null) {
        clearTimeout(pauseTimeoutId)
        pauseTimeoutId = null
      }
      resolve()
    }

    // setTimeout 兜底，确保窗口后台时 RAF 被节流也能完成
    pauseTimeoutId = setTimeout(finish, duration * 1000 + 50)

    const animate = () => {
      if (audioContext.currentTime >= endTime) {
        finish()
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

  if (!isPlay.value) return false

  // 立即设置标志，阻止任何新 crossfade 启动
  isSeamlessPausing.value = true
  // 立即同步标记为非播放状态，让 togglePlay 等同步逻辑能立即正确判断
  setPlay(false)

  // 如果正在 crossfade，强制取消并彻底清理 secondary 音频
  if (isCrossfading.value) {
    cancelCrossfade()
  }

  // 无论之前是否在 crossfade，都强制停止 secondary 音频
  // 防止 crossfade 已经 swap 后或处于中间状态时，仍有音频在后台播放
  stopSecondary()

  // 等待一帧让状态稳定
  await waitNextFrame()

  // 重置增益：当前 active 音频恢复满音量，secondary 静音
  setCrossfadeGainCurrent(1)
  setCrossfadeGainSecondary(0)

  try {
    initAdvancedAudioFeatures()
  } catch (_) {
    isSeamlessPausing.value = false
    return false
  }

  await startFadeOut(duration)

  // fadeout 完成后再次确认 secondary 已停止（防御性）
  stopSecondary()

  setPause()
  isSeamlessPausing.value = false
  return true
}

export const seamlessResume = async (): Promise<boolean> => {
  if (!appSetting['player.seamlessPauseEnabled']) return false

  const duration = appSetting['player.seamlessPauseDuration']
  if (duration <= 0) return false

  if (isPlay.value) return false

  // 立即同步标记为播放状态，让 togglePlay 等同步逻辑能立即正确判断
  setPlay(true)

  // 如果正在 crossfade，先取消它
  if (isCrossfading.value) {
    cancelCrossfade()
    await waitNextFrame()
  }

  try {
    initAdvancedAudioFeatures()
  } catch (_) {
    return false
  }

  await startFadeIn(duration)
  return true
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
