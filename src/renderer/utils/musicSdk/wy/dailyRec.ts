/**
 * 网易云音乐每日推荐模块
 * 支持：每日推荐歌曲、推荐歌单、心动模式、私人FM等
 */

// @ts-ignore
import { httpFetch } from '../../request'
// @ts-ignore
import { weapi } from './utils/crypto'

// 每日推荐模块
export default {
  /**
   * 获取每日推荐歌曲
   * @param cookie 网易云Cookie
   */
  async getDailySongs(cookie: string): Promise<any> {
    const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

    const response: any = httpFetch('https://music.163.com/weapi/v3/discover/recommend/songs', {
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

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取每日推荐失败')
    }

    return {
      recommend: (body.data || []).map((song: any) => ({
        id: song.id,
        name: song.name,
        ar: song.ar || [],
        al: {
          id: song.al?.id || 0,
          name: song.al?.name || '',
          picUrl: song.al?.picUrl || '',
        },
        dt: song.dt || 0,
        fee: song.fee || 0,
      })),
      haveRcmdSongs: body.haveRcmdSongs || [],
    }
  },

  /**
   * 风格化推荐（根据歌曲推荐相似歌曲）
   * @param songId 歌曲ID
   * @param playlistId 歌单ID（可选）
   * @param cookie 网易云Cookie
   */
  async getStyleRecSongs(
    songId: string | number,
    playlistId: string | number,
    cookie: string
  ): Promise<any[]> {
    const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

    const response: any = httpFetch('https://music.163.com/weapi/playmode/intelligence/list', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        songId,
        playlistId,
        type: 'fromPlayList',
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return (body.data || []).map((item: any) => ({
      songId: item.songId,
      songName: item.songName,
      artists: item.artists || [],
      albumId: item.albumId,
      albumName: item.albumName,
      duration: item.duration,
      score: item.score,
    }))
  },

  /**
   * 获取推荐歌单
   * @param limit 每页数量
   */
  async getRecommendPlaylist(limit: number = 30): Promise<any[]> {
    const response: any = httpFetch('https://music.163.com/weapi/personalized/playlist', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        limit,
        offset: 0,
        total: true,
        n: limit,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return body.result || []
  },

  /**
   * 获取心动模式歌曲
   * @param songId 歌曲ID
   * @param playlistId 歌单ID
   * @param cookie 网易云Cookie
   */
  async getHeartbeatSongs(
    songId: string | number,
    playlistId: string | number,
    cookie: string
  ): Promise<any[]> {
    return this.getStyleRecSongs(songId, playlistId, cookie)
  },

  /**
   * 获取相似歌曲
   * @param songId 歌曲ID
   * @param limit 每页数量
   */
  async getSimiSongs(songId: string | number, limit: number = 50): Promise<any[]> {
    const response: any = httpFetch('https://music.163.com/weapi/v1/discovery/simiSong', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        songid: songId,
        limit,
        offset: 0,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return (body.songs || []).map((song: any) => ({
      id: song.id,
      name: song.name,
      ar: song.artists || [],
      al: {
        id: song.album?.id || 0,
        name: song.album?.name || '',
        picUrl: song.album?.picUrl || '',
      },
      dt: song.duration || 0,
      fee: song.fee || 0,
    }))
  },

  /**
   * 获取私人FM
   * @param cookie 网易云Cookie
   */
  async getPersonalFm(cookie: string): Promise<any[]> {
    const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

    const response: any = httpFetch('https://music.163.com/weapi/v1/getrcmd', {
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

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return (body.data || []).map((song: any) => ({
      id: song.songId,
      name: song.songName,
      ar: song.artists || [],
      al: {
        id: song.albumId,
        name: song.albumName,
        picUrl: song.albumPic || '',
      },
      duration: song.duration,
      fee: song.fee || 0,
    }))
  },

  /**
   * 获取推荐新音乐
   * @param limit 每页数量
   */
  async getRecommendNewSongs(limit: number = 30): Promise<any[]> {
    const response: any = httpFetch('https://music.163.com/weapi/personalized/newsong', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        limit,
        areaId: 1,
        refresh: true,
        total: true,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return (body.result || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      ar: item.artists || [],
      al: {
        id: item.album?.id || 0,
        name: item.album?.name || '',
        picUrl: item.album?.picUrl || '',
      },
      dt: item.duration || 0,
      fee: item.fee || 0,
    }))
  },

  /**
   * 获取每日推荐歌单
   * @param cookie 网易云Cookie
   */
  async getDailyPlaylist(cookie: string): Promise<any[]> {
    const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

    const response: any = httpFetch('https://music.163.com/weapi/djradio/home/recommend/v2', {
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

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return body.data || []
  },

  /**
   * 获取雷达歌单
   * @param cookie 网易云Cookie
   */
  async getRadarPlaylist(cookie: string): Promise<any[]> {
    const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

    const response: any = httpFetch('https://music.163.com/weapi/social/tracks/radar', {
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

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return body.recommend || []
  },
}
