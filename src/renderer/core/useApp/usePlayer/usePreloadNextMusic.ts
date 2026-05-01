import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { onTimeupdate, getCurrentTime } from '@renderer/plugins/player'
import { playProgress } from '@renderer/store/player/playProgress'
import { musicInfo } from '@renderer/store/player/state'
// import { getList } from '@renderer/store/utils'
import { getNextPlayMusicInfo, resetRandomNextMusicInfo } from '@renderer/core/player'
import { getMusicUrl } from '@renderer/core/music'
import { appSetting } from '@renderer/store/setting'

/**
 * Calculate preload trigger threshold using HyPlayer's strategy:
 * - HyPlayer uses: Math.Max(duration * 0.125, 20)
 * - This ensures enough time for crossfade while avoiding premature loading
 */
const getPreloadThreshold = (duration: number, isCrossfadeEnabled: boolean): number => {
  if (!isCrossfadeEnabled) {
    // Non-crossfade mode: simpler 10-second threshold
    return 10
  }

  // HyPlayer strategy: 12.5% of duration, minimum 20 seconds
  const crossfadeThreshold = Math.max(duration * 0.125, 20)
  const transitionDuration = appSetting['player.transitionDuration']

  // Ensure we have enough time for both crossfade preparation and execution
  return Math.max(crossfadeThreshold + transitionDuration, transitionDuration + 5)
}

let audio: HTMLAudioElement
const initAudio = () => {
  if (audio) return
  audio = new Audio()
  audio.controls = false
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'
  audio.muted = true
  audio.volume = 0
  audio.autoplay = true
  audio.addEventListener('playing', () => {
    audio.pause()
  })
}
const checkMusicUrl = async (url: string): Promise<boolean> => {
  initAudio()
  return new Promise((resolve) => {
    const clear = () => {
      audio.removeEventListener('error', handleErr)
      audio.removeEventListener('canplay', handlePlay)
    }
    const handleErr = () => {
      clear()
      if (audio?.error?.code !== 1) {
        resolve(false)
      } else {
        resolve(true)
      }
    }
    const handlePlay = () => {
      clear()
      resolve(true)
    }
    audio.addEventListener('error', handleErr)
    audio.addEventListener('canplay', handlePlay)
    audio.src = url
  })
}

const preloadMusicInfo = {
  isLoading: false,
  preProgress: 0,
  info: null as LX.Player.PlayMusicInfo | null,
}

export const preloadCache = {
  url: '',
  musicInfo: null as LX.Player.PlayMusicInfo | null,
  isValid: false,
}

const resetPreloadInfo = () => {
  preloadMusicInfo.preProgress = 0
  preloadMusicInfo.info = null
  preloadMusicInfo.isLoading = false
  preloadCache.url = ''
  preloadCache.musicInfo = null
  preloadCache.isValid = false
}
const preloadNextMusicUrl = async (curTime: number) => {
  if (preloadMusicInfo.isLoading || curTime - preloadMusicInfo.preProgress < 3) return
  preloadMusicInfo.isLoading = true
  console.log('preload next music url')
  const info = await getNextPlayMusicInfo()
  if (info) {
    preloadMusicInfo.info = info
    const url = await getMusicUrl({ musicInfo: info.musicInfo }).catch(() => '')
    if (url) {
      console.log('preload url', url)
      const result = await checkMusicUrl(url)
      if (result) {
        preloadCache.url = url
        preloadCache.musicInfo = info
        preloadCache.isValid = true
      } else {
        const refreshUrl = await getMusicUrl({ musicInfo: info.musicInfo, isRefresh: true }).catch(
          () => ''
        )
        if (refreshUrl) {
          const refreshResult = await checkMusicUrl(refreshUrl)
          if (refreshResult) {
            preloadCache.url = refreshUrl
            preloadCache.musicInfo = info
            preloadCache.isValid = true
          }
        }
        console.log('preload url refresh', refreshUrl)
      }
    }
  }
  preloadMusicInfo.isLoading = false
}

export default () => {
  const setProgress = (time: number) => {
    if (!musicInfo.id) return
    preloadMusicInfo.preProgress = time
  }

  const handleSetPlayInfo = () => {
    resetPreloadInfo()
  }

  watch(
    () => appSetting['player.togglePlayMethod'],
    () => {
      if (!preloadMusicInfo.info || preloadMusicInfo.info.isTempPlay) return
      resetRandomNextMusicInfo()
      preloadMusicInfo.info = null
      preloadMusicInfo.preProgress = playProgress.nowPlayTime
    }
  )

  window.app_event.on('setProgress', setProgress)
  window.app_event.on('musicToggled', handleSetPlayInfo)

  const rOnTimeupdate = onTimeupdate(() => {
    const time = getCurrentTime()
    const duration = playProgress.maxPlayTime
    const isCrossfadeEnabled = appSetting['player.transitionEnabled']
    const threshold = getPreloadThreshold(duration, isCrossfadeEnabled)
    if (duration > threshold && duration - time < threshold && !preloadMusicInfo.info) {
      void preloadNextMusicUrl(time)
    }
  })

  onBeforeUnmount(() => {
    rOnTimeupdate()
    window.app_event.off('setProgress', setProgress)
    window.app_event.off('musicToggled', handleSetPlayInfo)
  })
}
