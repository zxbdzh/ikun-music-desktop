import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import {
  onTimeupdate,
  getCurrentTime,
  getDuration,
  setResourceSecondary,
  playSecondary,
  stopSecondary,
  setVolumeSecondary,
  swapActiveAudio,
  resetCrossfadeGains,
  setCrossfadeGain1,
  setCrossfadeGain2,
  onCanplaySecondary,
  onErrorSecondary,
  onTimeupdateSecondary,
  onLoadedmetadataSecondary,
  initAdvancedAudioFeatures,
  getSecondaryDuration,
  getSecondaryCurrentTime,
  setCrossfadeGainCurrent,
  setCrossfadeGainSecondary,
  rampCrossfadeGainCurrent,
  rampCrossfadeGainSecondary,
  getAudioContextInstance,
} from '@renderer/plugins/player'
import { playProgress, setMaxplayTime, setNowPlayTime } from '@renderer/store/player/playProgress'
import { appSetting } from '@renderer/store/setting'
import {
  getNextPlayMusicInfo,
  resetRandomNextMusicInfo,
} from '@renderer/core/player'
import { getMusicUrl, getPicPath, getLyricInfo } from '@renderer/core/music'
import {
  playMusicInfo,
  musicInfo as _musicInfo,
  isPlay,
} from '@renderer/store/player/state'
import {
  setPlayMusicInfo,
  addPlayedList,
  setMusicInfo,
} from '@renderer/store/player/action'
import { volume } from '@renderer/store/player/volume'
import { preloadCache } from './usePreloadNextMusic'
import { isCrossfading, isCrossfadeCompleting, crossfadeDoneMusicId, lastCrossfadeEndTime, isAfterCrossfade, registerCancelCrossfade, isSeamlessPausing } from './crossfadeState'

let crossfadeAnimId: number | null = null
let swapTimeout: NodeJS.Timeout | null = null
let nextMusicUrl: string | null = null
let nextMusicInfoCache: LX.Player.PlayMusicInfo | null = null
let canplayUnsub: (() => void) | null = null
let errorUnsub: (() => void) | null = null
let timeupdateUnsub: (() => void) | null = null
let loadedmetadataUnsub: (() => void) | null = null
let isPreparing = false
let isCompleting = false
export { isCompleting }  // exported so usePlayProgress can guard setProgress during crossfade
let pendingNextDuration = 0

const doCancelCrossfade = () => {
  if (crossfadeAnimId != null) {
    cancelAnimationFrame(crossfadeAnimId)
    crossfadeAnimId = null
  }
  if (swapTimeout) {
    clearTimeout(swapTimeout)
    swapTimeout = null
  }
  if (canplayUnsub) {
    canplayUnsub()
    canplayUnsub = null
  }
  if (errorUnsub) {
    errorUnsub()
    errorUnsub = null
  }
  if (timeupdateUnsub) {
    timeupdateUnsub()
    timeupdateUnsub = null
  }
  if (loadedmetadataUnsub) {
    loadedmetadataUnsub()
    loadedmetadataUnsub = null
  }
  stopSecondary()

  // Immediately reset gains to 1 for the active audio
  // This is critical: if crossfade was in progress, the active audio's gain
  // was being ramped down. We need to reset it immediately.
  setCrossfadeGainCurrent(1)
  setCrossfadeGainSecondary(1)

  isCrossfading.value = false
  isCrossfadeCompleting.value = false
  crossfadeDoneMusicId.value = null
  lastCrossfadeEndTime.value = 0
  isAfterCrossfade.value = false
  isPreparing = false
  isCompleting = false
  nextMusicUrl = null
  nextMusicInfoCache = null
  pendingNextDuration = 0
}

const completeCrossfade = (nextInfo: LX.Player.PlayMusicInfo) => {
  // 如果正在无缝暂停，取消 crossfade 并停止切换后的音频
  if (isSeamlessPausing.value) {
    console.log('completeCrossfade: seamless pausing, cancelling')
    doCancelCrossfade()
    return
  }

  isCrossfadeCompleting.value = true
  isCompleting = true

  if (swapTimeout) {
    clearTimeout(swapTimeout)
    swapTimeout = null
  }
  swapActiveAudio()
  stopSecondary()

  // Update musicInfo and immediately clear crossfadeDoneMusicId
  // This ensures progress bar and other components work correctly
  setPlayMusicInfo(nextInfo.listId, nextInfo.musicInfo, nextInfo.isTempPlay)

  // Set maxPlayTime using the duration captured during canplaySecondary
  if (pendingNextDuration > 0) setMaxplayTime(pendingNextDuration)
  setNowPlayTime(0)
  pendingNextDuration = 0

  // Clear crossfade state immediately
  // handlePlaying will set this if needed for other purposes
  crossfadeDoneMusicId.value = null
  isAfterCrossfade.value = false
  isCrossfading.value = false
  isCrossfadeCompleting.value = false
  isPreparing = false
  isCompleting = false

  resetRandomNextMusicInfo()

  void getPicPath({ musicInfo: nextInfo.musicInfo, listId: nextInfo.listId })
    .then((url: string) => {
      if (nextInfo.musicInfo.id != playMusicInfo.musicInfo?.id || url == _musicInfo.pic) return
      setMusicInfo({ pic: url })
      window.app_event.picUpdated()
    })
    .catch((_) => _)

  void getLyricInfo({ musicInfo: nextInfo.musicInfo })
    .then((lyricInfo) => {
      if (nextInfo.musicInfo.id != playMusicInfo.musicInfo?.id) return
      setMusicInfo({
        lrc: lyricInfo.lyric,
        tlrc: lyricInfo.tlyric,
        lxlrc: lyricInfo.lxlyric,
        rlrc: lyricInfo.rlyric,
        rawlrc: lyricInfo.rawlrcInfo.lyric,
      })
      window.app_event.lyricUpdated()
    })
    .catch((_) => _)

  if (appSetting['player.togglePlayMethod'] == 'random' && !nextInfo.isTempPlay)
    addPlayedList({ ...(nextInfo as LX.Player.PlayMusicInfo) })

  // Trigger crossfade ended event AFTER all state is cleared
  window.app_event.crossfadeEnded()
}

/**
 * Crossfade gain animation using Web Audio API
 *
 * HyPlayer-style implementation:
 * - Old song fades out: gain 1.0 → 0.0 (linear)
 * - New song fades in: gain 0.0 → 1.0 (linear)
 * - Animation driven by AudioContext timing (hardware-accelerated)
 */
const startGainAnimation = (durationSec: number) => {
  console.log('startGainAnimation: duration =', durationSec, 's')

  const audioContext = getAudioContextInstance()
  if (!audioContext) {
    console.warn('startGainAnimation: audioContext not available')
    return
  }

  const now = audioContext.currentTime
  const endTime = now + durationSec

  // Old song (current active): linear fade out 1.0 → 0.0
  // New song (secondary): linear fade in 0.0 → 1.0
  // Use active-index based functions to handle both activeIndex=1 and activeIndex=2 cases
  setCrossfadeGainCurrent(1)
  rampCrossfadeGainCurrent(0, endTime)
  setCrossfadeGainSecondary(0)
  rampCrossfadeGainSecondary(1, endTime)

  // RAF for UI sync (progress updates, etc.)
  // The actual gain animation is handled by Web Audio API hardware
  const animate = () => {
    if (!isCrossfading.value) return
    // Could add UI progress sync here if needed
    crossfadeAnimId = requestAnimationFrame(animate)
  }
  crossfadeAnimId = requestAnimationFrame(animate)
}

const executeCrossfade = (nextInfo: LX.Player.PlayMusicInfo, url: string, duration: number) => {
  // 如果正在无缝暂停，取消 crossfade
  if (isSeamlessPausing.value) {
    console.log('executeCrossfade: seamless pausing, cancelling')
    doCancelCrossfade()
    return
  }

  // 立即同步设置 isCrossfading，防止异步加载期间重入
  isCrossfading.value = true

  setVolumeSecondary(volume.value)
  setResourceSecondary(url)

  canplayUnsub = onCanplaySecondary(() => {
    // Get duration from loadedmetadata for accuracy
    // loadedmetadata fires after duration is known
    const handleLoadedMetadata = () => {
      pendingNextDuration = getSecondaryDuration()
      console.log('loadedmetadata: duration =', pendingNextDuration)
      if (loadedmetadataUnsub) { loadedmetadataUnsub(); loadedmetadataUnsub = null }
    }

    // Check if duration is already available (loadedmetadata may have already fired)
    const currentDuration = getSecondaryDuration()
    if (currentDuration > 0) {
      pendingNextDuration = currentDuration
      console.log('canplay: duration already available =', pendingNextDuration)
    } else {
      // Wait for loadedmetadata
      console.log('canplay: waiting for loadedmetadata...')
      loadedmetadataUnsub = onLoadedmetadataSecondary(handleLoadedMetadata)
    }

    if (canplayUnsub) { canplayUnsub(); canplayUnsub = null }
    if (errorUnsub) { errorUnsub(); errorUnsub = null }

    playSecondary()
    isCrossfading.value = true
    window.app_event.crossfadeStarted()

    startGainAnimation(duration)

    // Audio event driven: listen to secondary audio timeupdate as primary trigger
    // When secondary audio is near end (200ms margin), trigger swap immediately
    timeupdateUnsub = onTimeupdateSecondary(() => {
      const time = getSecondaryCurrentTime()
      const dur = getSecondaryDuration()
      // console.log('timeupdateSecondary:', time, '/', dur)
      if (dur > 0 && time >= dur - 0.2) {
        // Audio-driven swap: cleaner than pure setTimeout
        console.log('timeupdateSecondary: triggering swap at', time, '/', dur)
        if (timeupdateUnsub) { timeupdateUnsub(); timeupdateUnsub = null }
        if (swapTimeout) { clearTimeout(swapTimeout); swapTimeout = null }
        if (loadedmetadataUnsub) { loadedmetadataUnsub(); loadedmetadataUnsub = null }
        crossfadeAnimId = null
        completeCrossfade(nextInfo)
      }
    })

    // Fallback: setTimeout as safety net (prevents stuck state if event is missed)
    swapTimeout = setTimeout(() => {
      console.log('setTimeout fallback: triggering swap')
      if (timeupdateUnsub) { timeupdateUnsub(); timeupdateUnsub = null }
      if (loadedmetadataUnsub) { loadedmetadataUnsub(); loadedmetadataUnsub = null }
      crossfadeAnimId = null
      completeCrossfade(nextInfo)
    }, duration * 1000)
  })

  errorUnsub = onErrorSecondary(() => {
    if (canplayUnsub) { canplayUnsub(); canplayUnsub = null }
    if (errorUnsub) { errorUnsub(); errorUnsub = null }
    if (timeupdateUnsub) { timeupdateUnsub(); timeupdateUnsub = null }
    if (loadedmetadataUnsub) { loadedmetadataUnsub(); loadedmetadataUnsub = null }
    if (swapTimeout) { clearTimeout(swapTimeout); swapTimeout = null }
    doCancelCrossfade()
  })
}

const fetchNextMusicUrl = async (nextInfo: LX.Player.PlayMusicInfo): Promise<string | null> => {
  // NOTE: Do NOT use preloadCache URL here because:
  // 1. 163 music URLs are signed with timestamps and expire quickly
  // 2. A URL valid during preload may return 403 when actually used
  // 3. Always fetch fresh URL to ensure validity
  const musicName = 'name' in nextInfo.musicInfo ? nextInfo.musicInfo.name : nextInfo.musicInfo.id
  console.log('fetchNextMusicUrl: fetching fresh URL for', musicName)

  try {
    return await getMusicUrl({ musicInfo: nextInfo.musicInfo, isRefresh: true })
  } catch (_) {
    try {
      return await getMusicUrl({ musicInfo: nextInfo.musicInfo })
    } catch (_) {
      console.error('fetchNextMusicUrl: failed to get URL')
      return null
    }
  }
}

const tryStartCrossfade = async (curTime: number) => {
  if (isCrossfading.value || isPreparing) return
  if (isSeamlessPausing.value) return
  if (!isPlay.value) return

  try {
    initAdvancedAudioFeatures()
  } catch (_) {
    return
  }

  if (!appSetting['player.transitionEnabled']) return

  const duration = getDuration()
  if (!duration || duration <= 0) return

  const transitionDuration = appSetting['player.transitionDuration']

  if (duration - curTime > transitionDuration) return

  isPreparing = true

  const nextInfo = await getNextPlayMusicInfo()
  if (!nextInfo) {
    isPreparing = false
    return
  }

  // 异步操作后再次检查无缝暂停状态
  if (isSeamlessPausing.value) {
    isPreparing = false
    return
  }

  nextMusicInfoCache = nextInfo

  const url = await fetchNextMusicUrl(nextInfo)
  if (!url) {
    isPreparing = false
    return
  }

  // 异步操作后再次检查无缝暂停状态
  if (isSeamlessPausing.value) {
    isPreparing = false
    return
  }

  nextMusicUrl = url
  executeCrossfade(nextInfo, url, transitionDuration)
}

export default () => {
  registerCancelCrossfade(doCancelCrossfade)

  const rOnTimeupdate = onTimeupdate(() => {
    if (isCompleting) return
    if (isSeamlessPausing.value) return
    if (!isPlay.value) return
    const time = getCurrentTime()
    const duration = playProgress.maxPlayTime
    if (!duration || duration <= 0) return

    if (!appSetting['player.transitionEnabled']) return

    const threshold = appSetting['player.transitionDuration'] + 2
    if (duration - time <= threshold) {
      void tryStartCrossfade(time)
    }
  })

  watch(
    () => appSetting['player.transitionEnabled'],
    () => {
      console.log('transitionEnabled changed')
      if (isCrossfading.value) doCancelCrossfade()
    }
  )

  window.app_event.on('musicToggled', () => {
    if (isCrossfading.value) doCancelCrossfade()
    isPreparing = false
    nextMusicUrl = null
    nextMusicInfoCache = null
  })

  onBeforeUnmount(() => {
    rOnTimeupdate()
    doCancelCrossfade()
  })
}
