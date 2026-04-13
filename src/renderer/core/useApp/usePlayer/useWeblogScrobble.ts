import { onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'
import { sendWeblog } from '@renderer/utils/musicSdk/wy/weblog'
import { getCurrentTime, getDuration, onPlaying, onPause, onEmptied } from '@renderer/plugins/player'

const MIN_PLAY_TIME = 120
const MIN_PLAY_PERCENT = 0.5

interface ScrobbleInfo {
  songId: string | number
  sourceId: string
  totalTime: number
  accumulatedPlayedTime: number
  lastReportedTime: number
  isScrobbled: boolean
}

export default () => {
  let scrobbleInfo: ScrobbleInfo | null = null
  let reportTimer: ReturnType<typeof setInterval> | null = null
  let lastPlayTime = 0

  const parseSourceId = (listId: string | null): string => {
    if (!listId) return ''
    const match = listId.match(/^wy__user_playlist_(\d+)$/)
    return match ? match[1] : ''
  }

  // 检查旧歌曲是否需要补报
  const checkAndReportOldSong = () => {
    if (!scrobbleInfo || scrobbleInfo.isScrobbled) return

    const playedTime = Math.floor(scrobbleInfo.accumulatedPlayedTime)
    const { totalTime, songId, sourceId } = scrobbleInfo

    if (playedTime >= MIN_PLAY_TIME || (totalTime > 0 && playedTime >= totalTime * MIN_PLAY_PERCENT)) {
      scrobbleInfo.isScrobbled = true

      const cookie = appSetting['common.wy_cookie']
      if (!cookie) return

      console.log(`[Weblog] 切歌补报: ${songId}, time: ${playedTime}s`)
      void sendWeblog(songId, sourceId, playedTime, cookie)
        .then(() => {
          console.log(`[Weblog] Reported: ${songId}, time: ${playedTime}s`)
        })
        .catch((e) => {
          console.error('[Weblog] Report failed:', e)
        })
    }
  }

  const updateScrobbleInfo = () => {
    // 先检查旧歌曲是否需要补报
    checkAndReportOldSong()

    const music = playMusicInfo.musicInfo as any
    if (!music || !music.id) {
      scrobbleInfo = null
      return
    }

    const isListItem = 'metadata' in music
    const source = isListItem ? music.metadata.musicInfo.source : music.source

    if (source !== 'wy') {
      scrobbleInfo = null
      return
    }

    const wySongId = isListItem
      ? music.metadata.musicInfo.meta?.songId
      : music.meta?.songId

    if (!wySongId) {
      scrobbleInfo = null
      return
    }

    const sourceId = parseSourceId(playMusicInfo.listId)
    const duration = getDuration()

    scrobbleInfo = {
      songId: wySongId,
      sourceId,
      totalTime: duration,
      accumulatedPlayedTime: 0,
      lastReportedTime: 0,
      isScrobbled: false,
    }
  }

  const updateScrobblePlayTime = (currentTime: number) => {
    if (!scrobbleInfo || scrobbleInfo.isScrobbled) return

    let deltaTime = currentTime - lastPlayTime
    if (deltaTime < 0) deltaTime = 0
    if (deltaTime > 2) deltaTime = 1

    if (currentTime > 0 && deltaTime > 0) {
      scrobbleInfo.accumulatedPlayedTime += deltaTime
    }

    lastPlayTime = currentTime

    const playedTime = Math.floor(scrobbleInfo.accumulatedPlayedTime)
    const { totalTime } = scrobbleInfo

    if (playedTime >= MIN_PLAY_TIME || (totalTime > 0 && playedTime >= totalTime * MIN_PLAY_PERCENT)) {
      scrobbleInfo.isScrobbled = true

      const cookie = appSetting['common.wy_cookie']
      if (!cookie) return

      void sendWeblog(scrobbleInfo.songId, scrobbleInfo.sourceId, playedTime, cookie)
        .then(() => {
          console.log(`[Weblog] Reported: ${scrobbleInfo?.songId}, time: ${playedTime}s`)
        })
        .catch((e) => {
          console.error('[Weblog] Report failed:', e)
        })
    }
  }

  const startReportTimer = () => {
    if (reportTimer) return
    reportTimer = setInterval(() => {
      const currentTime = getCurrentTime()
      updateScrobblePlayTime(currentTime)
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
    // 清空前检查旧歌曲是否需要补报
    checkAndReportOldSong()
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