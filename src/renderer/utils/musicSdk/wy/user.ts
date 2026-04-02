/**
 * 网易云音乐用户操作模块
 * 支持：用户信息、喜欢歌曲、歌单管理、关注歌手、收藏专辑等
 */

// @ts-ignore
import { httpFetch } from '../../request'
// @ts-ignore
import { weapi } from './utils/crypto'

// CSRF Token提取
const getCsrfToken = (cookie: string): string => {
  const match = cookie.match(/_csrf=([^(;|$)]+)/)
  return match ? match[1] : ''
}

// 用户操作模块
export default {
  /**
   * 获取用户UID
   * @param cookie 网易云Cookie
   */
  async getUid(cookie: string): Promise<number> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/nuser/account/get', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({}),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取用户信息失败')
    }

    return body.account?.id || body.profile?.userId || 0
  },

  /**
   * 喜欢/取消喜欢歌曲
   * @param songId 歌曲ID
   * @param isLike true=喜欢, false=取消喜欢
   * @param cookie 网易云Cookie
   */
  async likeSong(songId: string | number, isLike: boolean, cookie: string): Promise<boolean> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/song/like', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        trackId: songId,
        like: isLike,
        alg: 'itembased',
        time: 3,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error(isLike ? '收藏歌曲失败' : '取消收藏失败')
    }

    return true
  },

  /**
   * 获取用户喜欢的歌曲ID列表
   * @param uid 用户ID
   * @param cookie 网易云Cookie
   */
  async getLikeList(uid: number, cookie: string): Promise<number[]> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/song/like/get', {
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
      return []
    }

    return body.ids || []
  },

  /**
   * 创建歌单
   * @param name 歌单名称
   * @param cookie 网易云Cookie
   * @param privacy 隐私设置 0=公开, 10=隐私
   */
  async createPlaylist(name: string, cookie: string, privacy: number = 0): Promise<number> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/playlist/create', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        name,
        privacy,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('创建歌单失败')
    }

    return body.id
  },

  /**
   * 删除歌单
   * @param id 歌单ID
   * @param cookie 网易云Cookie
   */
  async deletePlaylist(id: string | number, cookie: string): Promise<boolean> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/playlist/remove', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        ids: `[${id}]`,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('删除歌单失败')
    }

    return true
  },

  /**
   * 编辑歌单（名称/描述）
   * @param id 歌单ID
   * @param name 歌单名称
   * @param desc 歌单描述
   * @param cookie 网易云Cookie
   */
  async updatePlaylist(
    id: string | number,
    name: string,
    desc: string,
    cookie: string
  ): Promise<boolean> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/batch', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        '/api/playlist/desc/update': JSON.stringify({ id, desc }),
        '/api/playlist/update/name': JSON.stringify({ id, name }),
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('编辑歌单失败')
    }

    return true
  },

  /**
   * 收藏/取消收藏歌单
   * @param id 歌单ID
   * @param isSubscribe true=收藏, false=取消收藏
   * @param cookie 网易云Cookie
   */
  async subscribePlaylist(id: string | number, isSubscribe: boolean, cookie: string): Promise<boolean> {
    const csrfToken = getCsrfToken(cookie)
    const endpoint = isSubscribe ? '/weapi/playlist/subscribe' : '/weapi/playlist/unsubscribe'

    const response: any = httpFetch(`https://music.163.com${endpoint}`, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        id,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error(isSubscribe ? '收藏歌单失败' : '取消收藏失败')
    }

    return true
  },

  /**
   * 关注/取消关注歌手
   * @param artistId 歌手ID
   * @param isSubscribe true=关注, false=取消关注
   * @param cookie 网易云Cookie
   */
  async subscribeArtist(artistId: string | number, isSubscribe: boolean, cookie: string): Promise<boolean> {
    const csrfToken = getCsrfToken(cookie)
    const endpoint = isSubscribe ? '/weapi/artist/sub' : '/weapi/artist/unsub'

    const response: any = httpFetch(`https://music.163.com${endpoint}`, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        artistId,
        artistIds: `[${artistId}]`,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error(isSubscribe ? '关注歌手失败' : '取消关注失败')
    }

    return true
  },

  /**
   * 收藏/取消收藏专辑
   * @param id 专辑ID
   * @param isSubscribe true=收藏, false=取消收藏
   * @param cookie 网易云Cookie
   */
  async subscribeAlbum(id: string | number, isSubscribe: boolean, cookie: string): Promise<boolean> {
    const csrfToken = getCsrfToken(cookie)
    const endpoint = isSubscribe ? '/weapi/album/sub' : '/weapi/album/unsub'

    const response: any = httpFetch(`https://music.163.com${endpoint}`, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        id,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error(isSubscribe ? '收藏专辑失败' : '取消收藏失败')
    }

    return true
  },

  /**
   * 获取用户收藏的专辑列表
   * @param uid 用户ID
   * @param limit 每页数量
   * @param offset 偏移量
   * @param cookie 网易云Cookie
   */
  async getSubAlbumList(
    uid: number,
    limit: number = 30,
    offset: number = 0,
    cookie: string
  ): Promise<{ albums: any[]; total: number }> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/album/sublist', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        uid,
        limit,
        offset,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return { albums: [], total: 0 }
    }

    return {
      albums: body.data || [],
      total: body.count || 0,
    }
  },

  /**
   * 获取用户关注的歌手列表
   * @param uid 用户ID
   * @param limit 每页数量
   * @param offset 偏移量
   * @param cookie 网易云Cookie
   */
  async getSubArtistList(
    uid: number,
    limit: number = 30,
    offset: number = 0,
    cookie: string
  ): Promise<{ artists: any[]; total: number }> {
    const csrfToken = getCsrfToken(cookie)

    const response: any = httpFetch('https://music.163.com/weapi/artist/sublist', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        uid,
        limit,
        offset,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return { artists: [], total: 0 }
    }

    return {
      artists: body.data || [],
      total: body.count || 0,
    }
  },
}
