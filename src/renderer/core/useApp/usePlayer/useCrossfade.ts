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
} from '@renderer/store/player/state'
import {
  setPlayMusicInfo,
  addPlayedList,
  setMusicInfo,
} from '@renderer/store/player/action'
import { volume } from '@renderer/store/player/volume'
import { preloadCache } from './usePreloadNextMusic'
import { isCrossfading, isCrossfadeCompleting, crossfadeDoneMusicId, lastCrossfadeEndTime, isAfterCrossfade, registerCancelCrossfade } from './crossfadeState'

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

const estimateBpm = (interval: number): number => {
  if (!interval || interval <= 0) return 120
  if (interval < 180) return 140
  if (interval < 240) return 120
  if (interval < 360) return 100
  return 80
}

const getBeatAlignedDuration = (duration: number, bpm: number): number => {
  const beatInterval = 60 / bpm
  const beats = Math.round(duration / beatInterval)
  return Math.max(1, beats * beatInterval)
}

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
  resetCrossfadeGains()
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
  isCrossfadeCompleting.value = true
  isCompleting = true

  if (swapTimeout) {
    clearTimeout(swapTimeout)
    swapTimeout = null
  }
  swapActiveAudio()
  stopSecondary()

  // Update musicInfo.id FIRST, then set crossfadeDoneMusicId
  // This ensures handlePlaying sees the updated musicInfo.id when it fires
  setPlayMusicInfo(nextInfo.listId, nextInfo.musicInfo, nextInfo.isTempPlay)
  crossfadeDoneMusicId.value = nextInfo.musicInfo.id

  // Set maxPlayTime using the duration captured during canplaySecondary
  if (pendingNextDuration > 0) setMaxplayTime(pendingNextDuration)
  setNowPlayTime(0)
  pendingNextDuration = 0

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

  isCrossfading.value = false
  isPreparing = false
  isCompleting = false
  nextMusicUrl = null
  nextMusicInfoCache = null
  // Record when crossfade ended - handleEnded will guard against calling playNext within the next few seconds
  lastCrossfadeEndTime.value = Date.now()
  // Signal that we're in the "after crossfade" window - prevents buffering timeout from calling playNext
  isAfterCrossfade.value = true
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
const startGainAnimation = (durationSec: number, _smartMix: boolean) => {
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

const executeCrossfade = (nextInfo: LX.Player.PlayMusicInfo, url: string, duration: number, _smartMix: boolean) => {
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

    startGainAnimation(duration, _smartMix)

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

  try {
    initAdvancedAudioFeatures()
  } catch (_) {
    return
  }

  const mode = appSetting['player.transitionMode']
  if (mode === 'disabled') return

  const duration = getDuration()
  if (!duration || duration <= 0) return

  let transitionDuration = appSetting['player.transitionDuration']
  if (mode === 'smartMix') {
    const bpm = estimateBpm(duration)
    transitionDuration = getBeatAlignedDuration(transitionDuration, bpm)
  }

  if (duration - curTime > transitionDuration) return

  isPreparing = true

  const nextInfo = await getNextPlayMusicInfo()
  if (!nextInfo) {
    isPreparing = false
    return
  }

  nextMusicInfoCache = nextInfo

  const url = await fetchNextMusicUrl(nextInfo)
  if (!url) {
    isPreparing = false
    return
  }

  nextMusicUrl = url
  executeCrossfade(nextInfo, url, transitionDuration, mode === 'smartMix')
}

export default () => {
  registerCancelCrossfade(doCancelCrossfade)

  const rOnTimeupdate = onTimeupdate(() => {
    if (isCompleting) return
    const time = getCurrentTime()
    const duration = playProgress.maxPlayTime
    if (!duration || duration <= 0) return

    const mode = appSetting['player.transitionMode']
    if (mode === 'disabled') return

    const threshold = appSetting['player.transitionDuration'] + 2
    if (duration - time <= threshold) {
      void tryStartCrossfade(time)
    }
  })

  watch(
    () => appSetting['player.transitionMode'],
    (mode) => {
      console.log('transitionMode changed to:', mode)
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
