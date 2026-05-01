import {onBeforeUnmount} from '@common/utils/vueTools'
import {playMusicInfo} from '@renderer/store/player/state'
import {appSetting} from '@renderer/store/setting'
import {scrobble, updateNowPlaying} from '@renderer/utils/musicSdk/lastfm'
import {getCurrentTime, getDuration, onEmptied, onEnded, onPause, onPlaying} from '@renderer/plugins/player'

const MIN_PLAY_TIME = 120
const MIN_PLAY_PERCENT = 0.5

// 取第一个歌手（多艺术家时只取第一个）
const convertArtistFormat = (artist: string): string => {
  return artist.split(/[、,，]/)[0].trim()
}

interface LastfmScrobbleInfo {
  trackName: string
  artistName: string
  albumName: string
  totalTime: number
  accumulatedPlayedTime: number
  isScrobbled: boolean
  isNowPlayingReported: boolean
}

export default () => {
  let scrobbleInfo: LastfmScrobbleInfo | null = null
  let reportTimer: ReturnType<typeof setInterval> | null = null
  let lastPlayTime = 0
  let currentMusicId: string | null = null

  // 发送 scrobble
  const sendScrobble = async (info: LastfmScrobbleInfo) => {
    const sessionKey = appSetting['common.lastfm_session_key']
    if (!sessionKey) return

    // 使用当前时间作为 timestamp（参考 BetterLyrics 实现）
    const timestamp = Math.floor(Date.now() / 1000)

    const result = await scrobble({
      track: info.trackName,
      artist: info.artistName,
      album: info.albumName || undefined,
      duration: info.totalTime,
      timestamp,
      sessionKey,
    })
    console.log('[LastFM] sendScrobble result:', result)
  }

  // 检查并上报旧歌曲（切歌或播放完成时调用）
  const checkAndReportOldSong = () => {
    if (!scrobbleInfo || scrobbleInfo.isScrobbled) return

    const playedTime = Math.floor(scrobbleInfo.accumulatedPlayedTime)
    const { totalTime } = scrobbleInfo

    if (playedTime >= MIN_PLAY_TIME || (totalTime > 0 && playedTime >= totalTime * MIN_PLAY_PERCENT)) {
      scrobbleInfo.isScrobbled = true
      sendScrobble(scrobbleInfo)
    }
  }

  const updateScrobbleInfo = () => {
    const music = playMusicInfo.musicInfo as any
    if (!music || !music.id) {
      scrobbleInfo = null
      currentMusicId = null
      return
    }

    // 如果歌曲 ID 没变，不需要更新
    if (currentMusicId === music.id) return

    // 先检查旧歌曲是否需要补报
    checkAndReportOldSong()

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
      currentMusicId = null
      return
    }

    const duration = getDuration()

    scrobbleInfo = {
      trackName: name,
      artistName: convertArtistFormat(singer),
      albumName: albumName || '',
      totalTime: duration,
      accumulatedPlayedTime: 0,
      isScrobbled: false,
      isNowPlayingReported: false,
    }
    currentMusicId = music.id
    console.log('[LastFM] updateScrobbleInfo:', name, 'duration:', duration)
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

  // 播放完成时检查是否需要 scrobble
  const handleEnded = () => {
    if (scrobbleInfo && !scrobbleInfo.isScrobbled) {
      const playedTime = Math.floor(scrobbleInfo.accumulatedPlayedTime)
      const { totalTime } = scrobbleInfo

      // 播放完成时，几乎一定满足 scrobble 条件
      if (playedTime >= MIN_PLAY_TIME || (totalTime > 0 && playedTime >= totalTime * MIN_PLAY_PERCENT)) {
        scrobbleInfo.isScrobbled = true
        sendScrobble(scrobbleInfo)
      }
    }
  }

  // 切歌时检查是否需要 scrobble
  const handleEmptied = () => {
    checkAndReportOldSong()
    scrobbleInfo = null
    currentMusicId = null
    resetState()
  }

  // 监听歌曲切换事件，确保 crossfade 后能正确更新 scrobble 信息
  const handleMusicToggled = () => {
    console.log('[LastFM] musicToggled - resetting scrobble info')
    checkAndReportOldSong()
    scrobbleInfo = null
    currentMusicId = null
    lastPlayTime = 0
  }

  const rOnPlaying = onPlaying(handlePlaying)
  const rOnPause = onPause(handlePause)
  const rOnEnded = onEnded(handleEnded)
  const rOnEmptied = onEmptied(handleEmptied)

  // 监听歌曲切换事件
  window.app_event.on('musicToggled', handleMusicToggled)

  onBeforeUnmount(() => {
    rOnPlaying()
    rOnPause()
    rOnEnded()
    rOnEmptied()
    window.app_event.off('musicToggled', handleMusicToggled)
    resetState()
  })
}
