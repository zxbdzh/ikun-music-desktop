import { onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'
import { updateNowPlaying, scrobble } from '@renderer/utils/musicSdk/lastfm'
import { getCurrentTime, getDuration, onPlaying, onPause, onEmptied } from '@renderer/plugins/player'

const MIN_PLAY_TIME = 120
const MIN_PLAY_PERCENT = 0.5

interface LastfmScrobbleInfo {
  trackName: string
  artistName: string
  albumName: string
  totalTime: number
  accumulatedPlayedTime: number
  isScrobbled: boolean
  isNowPlayingReported: boolean
  playStartTime: number
}

export default () => {
  let scrobbleInfo: LastfmScrobbleInfo | null = null
  let reportTimer: ReturnType<typeof setInterval> | null = null
  let lastPlayTime = 0

  // 检查并上报旧歌曲
  const checkAndReportOldSong = () => {
    if (!scrobbleInfo || scrobbleInfo.isScrobbled) return

    const playedTime = Math.floor(scrobbleInfo.accumulatedPlayedTime)
    const { totalTime, trackName, artistName, albumName, playStartTime } = scrobbleInfo

    if (playedTime >= MIN_PLAY_TIME || (totalTime > 0 && playedTime >= totalTime * MIN_PLAY_PERCENT)) {
      scrobbleInfo.isScrobbled = true

      const sessionKey = appSetting['common.lastfm_session_key']
      if (!sessionKey) return

      void scrobble({
        track: trackName,
        artist: artistName,
        album: albumName || undefined,
        duration: totalTime,
        timestamp: playStartTime,
        sessionKey,
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

    // 获取歌曲信息
    const isListItem = 'metadata' in music
    const name = isListItem ? music.metadata.musicInfo.name : music.name
    const singer = isListItem ? music.metadata.musicInfo.singer : music.singer
    const albumName = isListItem
      ? music.metadata.musicInfo.meta?.albumName
      : music.meta?.albumName

    // artist 为空时跳过
    if (!singer) {
      scrobbleInfo = null
      return
    }

    const duration = getDuration()

    scrobbleInfo = {
      trackName: name,
      artistName: singer,
      albumName: albumName || '',
      totalTime: duration,
      accumulatedPlayedTime: 0,
      isScrobbled: false,
      isNowPlayingReported: false,
      playStartTime: Math.floor(Date.now() / 1000),
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

    // 上报正在播放（首次）
    if (!scrobbleInfo.isNowPlayingReported) {
      const sessionKey = appSetting['common.lastfm_session_key']
      if (sessionKey && appSetting['common.lastfm_enable_now_playing']) {
        scrobbleInfo.isNowPlayingReported = true
        void updateNowPlaying({
          track: scrobbleInfo.trackName,
          artist: scrobbleInfo.artistName,
          album: scrobbleInfo.albumName || undefined,
          duration: scrobbleInfo.totalTime,
          sessionKey,
        })
      }
    }

    const playedTime = Math.floor(scrobbleInfo.accumulatedPlayedTime)
    const { totalTime, trackName, artistName, albumName, playStartTime } = scrobbleInfo

    if (playedTime >= MIN_PLAY_TIME || (totalTime > 0 && playedTime >= totalTime * MIN_PLAY_PERCENT)) {
      scrobbleInfo.isScrobbled = true

      const sessionKey = appSetting['common.lastfm_session_key']
      if (!sessionKey) return

      void scrobble({
        track: trackName,
        artist: artistName,
        album: albumName || undefined,
        duration: totalTime,
        timestamp: playStartTime,
        sessionKey,
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
