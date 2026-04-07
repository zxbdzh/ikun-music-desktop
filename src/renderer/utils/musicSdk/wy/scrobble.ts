/**
 * 网易云音乐歌曲打卡模块
 * 支持：听歌历史同步、播放进度上报
 */

// @ts-ignore
import { httpFetch } from '../../request'
// @ts-ignore
import { weapi } from './utils/crypto'
// @ts-ignore
import wyUtil from './wyUtil'

// 歌曲打卡模块
export default {
  /**
   * 获取用户播放历史
   * @param uid 用户ID
   * @param cookie 网易云Cookie
   */
  async getPlayHistory(
    uid: number,
    cookie: string
  ): Promise<{ allData: any[]; weekData: any[] }> {
    const csrfToken = wyUtil.getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/api/play-record/song', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        uid,
        type: 1, // 1=全部, 0=本周
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return { allData: [], weekData: [] }
    }

    return {
      allData: body.allData || [],
      weekData: body.weekData || [],
    }
  },

  /**
   * 获取用户累计听歌统计
   * @param uid 用户ID
   * @param cookie 网易云Cookie
   */
  async getListenCount(uid: number, cookie: string): Promise<any> {
    const csrfToken = wyUtil.getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/digitalAlbum/order/phone/batch', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        uid,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return { listenSongs: 0 }
    }

    return {
      listenSongs: body.listenSongs || 0,
    }
  },

  /**
   * 获取用户年度听歌报告
   * @param year 年份
   * @param cookie 网易云Cookie
   */
  async getYearReport(year: number, cookie: string): Promise<any> {
    const csrfToken = wyUtil.getCsrfToken(cookie)

    const response: any = httpFetch(`https://music.163.com/api/coverout/model/310/${year}`, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200) {
      return null
    }

    return body || null
  },

  /**
   * 创建播放记录上报器
   * 自动追踪播放状态并上报
   * @param getCookie 获取Cookie的回调函数
   */
  createScrobbleTracker(getCookie: () => string) {
    let currentSongId: string | number | null = null
    let currentPlaylistId: string | number | null = null
    let playStartTime: number = 0
    let isPlaying: boolean = false

    return {
      /**
       * 开始播放歌曲
       * @param songId 歌曲ID
       * @param playlistId 歌单ID（可选）
       */
      onPlay(songId: string | number, playlistId?: string | number) {
        const prevSongId: string | number | null = currentSongId
        if (prevSongId !== null) {
          const prevPlaylistId = currentPlaylistId ?? undefined
          this.onEnd(prevSongId as string | number, prevPlaylistId)
        }

        currentSongId = songId
        currentPlaylistId = playlistId || null
        playStartTime = Date.now()
        isPlaying = true
      },

      /**
       * 歌曲播放结束
       * @param endSongId 歌曲ID
       * @param playlistId 歌单ID（可选）
       */
      async onEnd(endSongId: string | number, playlistId?: string | number) {
        if (!isPlaying || currentSongId !== endSongId) return

        const duration = Math.floor((Date.now() - playStartTime) / 1000)
        isPlaying = false

        const cookie = getCookie()
        const targetSongId: string | number | undefined = currentSongId ?? undefined
        if (cookie && targetSongId !== undefined) {
          try {
            await wyUtil.scrobble(targetSongId as string | number, currentPlaylistId ?? undefined, duration, cookie)
          } catch (e) {
            console.error('Scrobble failed:', e)
          }
        }
      },

      /**
       * 歌曲暂停
       */
      onPause() {
        isPlaying = false
      },

      /**
       * 歌曲恢复播放
       */
      onResume() {
        isPlaying = true
        playStartTime = Date.now()
      },

      /**
       * 获取当前播放状态
       */
      getStatus() {
        return {
          currentSongId,
          currentPlaylistId,
          isPlaying,
          playDuration: isPlaying ? Date.now() - playStartTime : 0,
        }
      },
    }
  },
}

