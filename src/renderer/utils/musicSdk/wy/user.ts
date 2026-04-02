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
    // 先尝试使用 /weapi/nuser/account/get 接口
    try {
      const response: any = httpFetch('https://music.163.com/weapi/nuser/account/get', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          origin: 'https://music.163.com',
          Referer: 'https://music.163.com/',
          cookie,
        },
        body: weapi({}),
      })

      const { body, statusCode } = await response.promise

      if (statusCode === 200 && body.code === 200) {
        return body.account?.id || body.profile?.userId || 0
      }
    } catch (err) {
      console.error('weapi/nuser/account/get failed:', err)
    }

    // 如果第一个接口失败，尝试使用用户详情接口
    try {
      const uidMatch = cookie.match(/(?:NMTID|music\.163\.com[^=]*=)[^;]+/gi)
      if (!uidMatch) {
        // 尝试从 Cookie 中提取已知信息
        const musicUMatch = cookie.match(/MUSIC_U=([^;]+)/)
        if (musicUMatch && musicUMatch[1]) {
          // MUSIC_U 存在但无法解析UID，需要使用其他方式验证
          // 返回 0 表示 Cookie 可能有效但无法获取 UID
          console.warn('Cookie contains MUSIC_U but cannot extract UID')
          return 0
        }
        throw new Error('Invalid cookie: missing MUSIC_U')
      }
    } catch (err) {
      console.error('Cookie validation error:', err)
      throw err
    }

    return 0
  },

  /**
   * 验证Cookie是否有效（简化版）
   * 只要包含 MUSIC_U= 或 NMTID= 就认为 Cookie 格式正确
   * @param cookie 网易云Cookie
   */
  async verifyCookie(cookie: string): Promise<{ valid: boolean; uid: number }> {
    // 检查必要的 Cookie 字段
    const hasMusicU = cookie.includes('MUSIC_U=')
    const hasNmtid = cookie.includes('NMTID=')

    if (!hasMusicU && !hasNmtid) {
      console.warn('Cookie validation failed: missing MUSIC_U and NMTID')
      return { valid: false, uid: 0 }
    }

    // 尝试获取 UID（可能失败，但只要有 MUSIC_U 就认为 Cookie 可能有效）
    try {
      const uid = await this.getUid(cookie)
      if (uid > 0) {
        console.log('Cookie validated, UID:', uid)
        return { valid: true, uid }
      }
    } catch (err) {
      console.warn('Failed to get UID from API:', err)
    }

    // 如果获取 UID 失败，但 MUSIC_U 存在，仍然认为 Cookie 有效
    if (hasMusicU) {
      console.log('Cookie contains MUSIC_U, treating as valid (UID unknown)')
      return { valid: true, uid: 0 }
    }

    return { valid: false, uid: 0 }
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
