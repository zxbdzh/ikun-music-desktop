import { onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'
import wyScrobble from '@renderer/utils/musicSdk/wy/scrobble'
import musicSdk from '@renderer/utils/musicSdk'

export default () => {
  let playStartTime = 0
  let lastScrobbledSongId: string | number | null = null

  const handlePlay = () => {
    playStartTime = Date.now()
  }

  const handleScrobble = async () => {
    // 检查是否启用听歌记录同步
    if (!appSetting['common.wy_enableScrobble']) return

    // 检查是否已登录网易云
    const cookie = appSetting['common.wy_cookie']
    if (!cookie) return

    const music = playMusicInfo.musicInfo as any
    if (!music || !music.id) return

    // 解析歌曲信息 - ListItem 将信息存储在 metadata.musicInfo 中
    const isListItem = 'metadata' in music
    const songId = music.id
    const songName = isListItem ? music.metadata.musicInfo.name : music.name
    const singer = isListItem ? music.metadata.musicInfo.singer : music.singer
    const source = isListItem ? music.metadata.musicInfo.source : music.source
    const interval = isListItem ? music.metadata.musicInfo.interval : music.interval

    // 计算播放时长
    const duration = Date.now() - playStartTime
    if (duration < 5000) return // 播放时长少于5秒不记录

    // 如果是网易云歌曲，直接上报
    if (source === 'wy') {
      // 避免重复上报同一首歌
      if (lastScrobbledSongId === songId) return
      lastScrobbledSongId = songId

      try {
        await wyScrobble.scrobble(songId, duration, cookie)
        console.log(`[Scrobble] Reported wy song: ${songName}`)
      } catch (e) {
        console.error('[Scrobble] Failed to report wy song:', e)
      }
      return
    }

    // 如果不是网易云歌曲，搜索匹配的网易云歌曲
    try {
      const results: any[] = await musicSdk.findMusic({
        name: songName,
        singer: singer,
        albumName: '',
        interval: interval || undefined,
      })

      // 找到匹配的网易云歌曲（取第一个结果）
      if (results && results.length > 0) {
        const matchedSong = results[0]
        // 确保匹配的是网易云歌曲
        if (matchedSong.source === 'wy' && matchedSong.songmid) {
          // 避免重复上报同一首歌
          if (lastScrobbledSongId === matchedSong.songmid) return
          lastScrobbledSongId = matchedSong.songmid

          await wyScrobble.scrobble(matchedSong.songmid, duration, cookie)
          console.log(`[Scrobble] Matched and reported: ${songName} -> wy:${matchedSong.songmid}`)
        }
      } else {
        console.log(`[Scrobble] No wy match found for: ${songName}`)
      }
    } catch (e) {
      console.error('[Scrobble] Failed to find wy match:', e)
    }
  }

  window.app_event.on('play', handlePlay)
  window.app_event.on('playerPlaying', handleScrobble)

  onBeforeUnmount(() => {
    window.app_event.off('play', handlePlay)
    window.app_event.off('playerPlaying', handleScrobble)
  })
}
