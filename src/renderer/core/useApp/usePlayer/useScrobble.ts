import { onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import { getCurrentTime, getDuration, onPlaying, onPause, onEmptied } from '@renderer/plugins/player'

const MIN_PLAY_TIME = 120
const MIN_PLAY_PERCENT = 0.5

export default () => {
  let scrobbleInfo: {
    songId: string | number
    songName: string
    interval: number
    source: string
    isListItem: boolean
    totalTime: number
    accumulatedPlayTime: number
    isScrobbled: boolean
  } | null = null
  let reportTimer: ReturnType<typeof setInterval> | null = null
  let lastPlayTime = 0

  const updateScrobbleInfo = () => {
    const music = playMusicInfo.musicInfo as any
    if (!music || !music.id) {
      scrobbleInfo = null
      return
    }

    const isListItem = 'metadata' in music
    const songName = isListItem ? music.metadata.musicInfo.name : music.name
    const source = isListItem ? music.metadata.musicInfo.source : music.source
    const interval = isListItem ? music.metadata.musicInfo.interval : music.interval

    const parseIntervalToSeconds = (interval: string): number => {
      if (!interval) return 0
      const parts = interval.split(':')
      if (parts.length !== 2) return 0
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
    }

    const wySongId = isListItem
      ? music.metadata.musicInfo.meta?.songId
      : music.meta?.songId

    scrobbleInfo = {
      songId: wySongId || music.id,
      songName,
      interval: interval ? parseIntervalToSeconds(interval) : 300,
      source,
      isListItem,
      totalTime: getDuration(),
      accumulatedPlayTime: 0,
      isScrobbled: false,
    }
  }

  const checkAndReport = () => {
    if (!scrobbleInfo || scrobbleInfo.isScrobbled) return

    const playedTime = Math.floor(scrobbleInfo.accumulatedPlayTime)
    const { totalTime, songId, songName } = scrobbleInfo

    if (playedTime >= MIN_PLAY_TIME || (totalTime > 0 && playedTime >= totalTime * MIN_PLAY_PERCENT)) {
      scrobbleInfo.isScrobbled = true

      const cookie = appSetting['common.wy_cookie']
      if (!cookie) return

      void wyUtil.scrobble(songId, undefined, playedTime, cookie)
        .then(() => {
          console.log(`[Scrobble Old] Reported: ${songName}, time: ${playedTime}s`)
        })
        .catch((e) => {
          console.error('[Scrobble Old] Report failed:', e)
        })
    }
  }

  const updatePlayTime = () => {
    if (!scrobbleInfo || scrobbleInfo.isScrobbled) return

    const currentTime = getCurrentTime()
    let deltaTime = currentTime - lastPlayTime
    if (deltaTime < 0) deltaTime = 0
    if (deltaTime > 2) deltaTime = 1

    if (currentTime > 0 && deltaTime > 0) {
      scrobbleInfo.accumulatedPlayTime += deltaTime
    }
    lastPlayTime = currentTime

    scrobbleInfo.totalTime = getDuration()
    checkAndReport()
  }

  const startReportTimer = () => {
    if (reportTimer) return
    reportTimer = setInterval(() => {
      updatePlayTime()
    }, 1000)
  }

  const stopReportTimer = () => {
    if (reportTimer) {
      clearInterval(reportTimer)
      reportTimer = null
    }
  }

  const resetState = () => {
    stopReportTimer()
    lastPlayTime = 0
  }

  const handlePlaying = () => {
    updateScrobbleInfo()
    startReportTimer()
  }

  const handlePause = () => {
    stopReportTimer()
  }

  const handleEmptied = () => {
    checkAndReport()
    scrobbleInfo = null
    resetState()
  }

  const rOnPlaying = onPlaying(handlePlaying)
  const rOnPause = onPause(handlePause)
  const rOnEmptied = onEmptied(handleEmptied)

  onBeforeUnmount(() => {
    rOnPlaying()
    rOnPause()
    rOnEmptied()
    resetState()
  })
}