import { onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'
import wyScrobble from '@renderer/utils/musicSdk/wy/scrobble'
import musicSdk from '@renderer/utils/musicSdk'

export default () => {
  let lastScrobbledSongId: string | number | null = null

  // 播放结束时上报听歌记录
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

    // 如果是网易云歌曲，直接上报
    if (source === 'wy') {
      // 避免重复上报同一首歌
      if (lastScrobbledSongId === songId) return
      lastScrobbledSongId = songId

      try {
        // 播放时长使用歌曲的 interval（分钟转换为秒）
        const duration = interval ? parseIntervalToSeconds(interval) * 1000 : 300000 // 默认5分钟
        await wyScrobble.scrobble(songId, duration, cookie)
        console.log(`[Scrobble] Reported wy song: ${songName}, duration: ${duration}ms`)
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
        source: 'wy', // 只搜索网易云
      })

      // 找到匹配的网易云歌曲（取第一个结果）
      if (results && results.length > 0) {
        const matchedSong = results[0]
        // 确保匹配的是网易云歌曲
        if (matchedSong.source === 'wy' && matchedSong.songmid) {
          // 避免重复上报同一首歌
          if (lastScrobbledSongId === matchedSong.songmid) return
          lastScrobbledSongId = matchedSong.songmid

          const duration = interval ? parseIntervalToSeconds(interval) * 1000 : 300000
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

  // 辅助函数：将 "03:55" 格式转换为秒
  const parseIntervalToSeconds = (interval: string): number => {
    if (!interval) return 0
    const parts = interval.split(':')
    if (parts.length !== 2) return 0
    const minutes = parseInt(parts[0], 10) || 0
    const seconds = parseInt(parts[1], 10) || 0
    return minutes * 60 + seconds
  }

  // 监听播放结束和停止事件
  window.app_event.on('playerEnded', handleScrobble)
  window.app_event.on('stop', handleScrobble)

  onBeforeUnmount(() => {
    window.app_event.off('playerEnded', handleScrobble)
    window.app_event.off('stop', handleScrobble)
  })
}
