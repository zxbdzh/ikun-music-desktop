/**
 * 网易云音乐工具类
 * 统一管理 API 调用，包括登录、打卡等
 */

// @ts-ignore
import {httpFetch} from '../../request'
// @ts-ignore
import { weapi } from './utils/crypto'

const API_BASE_URL = 'https://music.zxbdwy.online'

// CSRF Token提取
const getCsrfToken = (cookie: string): string => {
  const match = cookie.match(/_csrf=([^(;|$)]+)/)
  return match ? match[1] : ''
}

// 发送手机验证码
const sendCaptcha = async (phone: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/captcha/sent`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `phone=${encodeURIComponent(phone)}`,
    })

    const {body, statusCode} = await response.promise

    if (statusCode === 200 && body.code === 200) {
      return {success: true, message: '验证码已发送'}
    }

    return {success: false, message: body.message || '发送验证码失败'}
  } catch (err: any) {
    console.error('Send captcha error:', err)
    return {success: false, message: err.message || '网络错误'}
  }
}

// 验证码登录
const loginByCaptcha = async (phone: string, captcha: string): Promise<{
  success: boolean
  cookie: string
  uid: number
  message: string
}> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/login/cellphone`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `phone=${encodeURIComponent(phone)}&captcha=${encodeURIComponent(captcha)}`,
    })

    const {body, statusCode} = await response.promise

    if (statusCode === 200) {
      if (body.code === 200) {
        const cookie = body.cookie || ''
        const uid = body.profile?.userId || body.account?.id || 0
        return {success: true, cookie, uid, message: '登录成功'}
      } else if (body.code === 400) {
        return {success: false, cookie: '', uid: 0, message: body.message || '验证码错误'}
      }
    }

    return {success: false, cookie: '', uid: 0, message: body.message || '登录失败'}
  } catch (err: any) {
    console.error('Login by captcha error:', err)
    return {success: false, cookie: '', uid: 0, message: err.message || '网络错误'}
  }
}

// 听歌打卡
const scrobble = async (
  songId: string | number,
  sourceId: string | number | undefined,
  duration: number,
  cookie: string
): Promise<boolean> => {
  try {
    let url = `${API_BASE_URL}/scrobble?id=${songId}&time=${duration}`
    if (sourceId) {
      url += `&sourceid=${sourceId}`
    }

    const response: any = httpFetch(`${url}?cookie=${encodeURIComponent(cookie)}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const {body, statusCode} = await response.promise

    console.log('[Scrobble API] Response:', {statusCode, body})
    return statusCode === 200 && body.code === 200
  } catch (err: any) {
    console.error('Scrobble error:', err)
    return false
  }
}

// 获取相似歌单
const getSimiPlaylist = async (songId: string | number): Promise<any[]> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/simi/playlist?id=${songId}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const {body, statusCode} = await response.promise

    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: 获取相似歌单失败`)
    }

    if (body.code !== 200) {
      console.error('Simi playlist API error:', body)
      throw new Error(body.message || '获取相似歌单失败')
    }

    return (body.playlists || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      author: item.creator?.nickname || '',
      img: item.coverImgUrl || '',
      total: item.trackCount || 0,
      playCount: item.playCount || 0,
      description: item.description || '',
      tags: item.tags || [],
      createTime: item.createTime || 0,
      updateTime: item.updateTime || 0,
      subscribedCount: item.subscribedCount || 0,
    }))
  } catch (err: any) {
    console.error('Get simi playlist error:', err)
    throw err
  }
}

// 获取相似歌曲
const getSimiSongs = async (songId: string | number): Promise<any[]> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/simi/song?id=${songId}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const {body, statusCode} = await response.promise

    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: 获取相似歌曲失败`)
    }

    if (body.code !== 200) {
      console.error('Simi songs API error:', body)
      throw new Error(body.message || '获取相似歌曲失败')
    }

    // 格式化返回数据
    const getAlbum = (song: any) => {
      if (song.al) return song.al
      if (song.album) return song.album
      return {id: 0, name: '', picUrl: ''}
    }
    return (body.songs || []).map((song: any) => ({
      id: song.id,
      name: song.name,
      ar: song.ar || song.artists || [],
      al: getAlbum(song),
      dt: song.dt || song.duration || 0,
      fee: song.fee || 0,
    }))
  } catch (err: any) {
    console.error('Get simi songs error:', err)
    throw err
  }
}

// 获取歌手详情
interface ArtistInfo {
  videoCount: number
  artist: {
    id: number
    name: string
    cover: string
    avatar: string
    briefDesc: string
    albumSize: number
    musicSize: number
    mvSize: number
    transNames: string[]
    alias: string[]
    identities: string[]
    identifyTag: string[]
  }
  user: any
}

const getArtistInfo = async (artistId: string | number): Promise<ArtistInfo> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/artist/detail?id=${artistId}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    const { body, statusCode } = await response.promise
    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: 获取歌手详情失败`)
    }
    if (body.code !== 200) {
      console.error('Get artist info error:', body)
      throw new Error(body.message || '获取歌手详情失败')
    }
    return body.data
  } catch (err: any) {
    console.error('Get artist info error:', err)
    throw err
  }
}

// 获取歌手全部/热门歌曲
const getArtistSongs = async (artistId: string | number, order = 'hot', limit = 50, offset = 0): Promise<{ songs: any[]; total: number }> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/artist/songs?id=${artistId}&order=${order}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    const { body, statusCode } = await response.promise
    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: 获取歌手歌曲失败`)
    }
    if (body.code !== 200) {
      console.error('Get artist songs error:', body)
      throw new Error(body.message || '获取歌手歌曲失败')
    }
    return { songs: body.songs || [], total: body.total || 0 }
  } catch (err: any) {
    console.error('Get artist songs error:', err)
    throw err
  }
}

// 获取每日推荐歌曲
const getDailySongs = async (cookie: string): Promise<any[]> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/recommend/songs?cookie=${encodeURIComponent(cookie)}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const {body, statusCode} = await response.promise

    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: 获取每日推荐失败`)
    }

    if (body.code !== 200) {
      console.error('Daily songs API error:', body)
      throw new Error(body.message || '获取每日推荐失败')
    }

    // 格式化返回数据
    const getAlbum = (song: any) => {
      if (song.al) return song.al
      if (song.album) return song.album
      return {id: 0, name: '', picUrl: ''}
    }
    return (body.data.dailySongs || []).map((song: any) => ({
      id: song.id,
      name: song.name,
      ar: song.ar || song.artists || [],
      al: getAlbum(song),
      dt: song.dt || song.duration || 0,
      fee: song.fee || 0,
    }))
  } catch (err: any) {
    console.error('Get daily songs error:', err)
    throw err
  }
}

// 验证 Cookie 是否有效
const verifyCookie = async (cookie: string): Promise<{ valid: boolean; message?: string }> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/login/status?cookie=${encodeURIComponent(cookie)}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const {body, statusCode} = await response.promise
    if (statusCode === 200 && body.data?.code === 0) {
      return {valid: true}
    }
    return {valid: false, message: body.message || 'Cookie无效'}
  } catch (err: any) {
    console.error('Verify cookie error:', err)
    return {valid: false, message: err.message || '验证失败'}
  }
}

// 获取用户歌单列表
interface UserPlaylist {
  id: number
  name: string
  coverImgUrl: string
  trackCount: number
  creatorNickname: string
}

const getUserPlaylist = async (cookie: string, uid: number): Promise<UserPlaylist[]> => {
  try {
    const csrfToken = getCsrfToken(cookie)
    console.log('[getUserPlaylist] 请求参数:', { uid, csrfToken: csrfToken || '' })
    const response: any = httpFetch(
      `${API_BASE_URL}/user/playlist?uid=${uid}&cookie=${encodeURIComponent(cookie)}`,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    )
    const {body, statusCode} = await response.promise
    console.log('[getUserPlaylist] 响应:', { statusCode, body })
    if (statusCode !== 200 || body.code !== 200) {
      throw new Error(body.message || '获取用户歌单失败')
    }
    return (body.playlist || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      coverImgUrl: item.coverImgUrl,
      trackCount: item.trackCount,
      creatorNickname: item.creator?.nickname || '',
    }))
  } catch (err: any) {
    console.error('Get user playlist error:', err)
    throw err
  }
}

// 获取用户uid
const getUid = async (cookie: string): Promise<number> => {
  try {
    console.log('[getUid] 请求参数:', {url: `${API_BASE_URL}/login/status?cookie=${cookie}`})
    const response: any = httpFetch(`${API_BASE_URL}/login/status?cookie=${encodeURIComponent(cookie)}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const {body, statusCode} = await response.promise
    console.log('[getUid] 响应:', {statusCode, body})
    if (statusCode === 200) {
      // data.code == 0 表示登录有效，!= 0 表示登录失效
      if (body.data?.account.status !== 0) {
        console.warn('[getUid] 登录已失效:', body.data?.code)
        return 0
      }
      return body.data.account?.id || body.data.profile?.userId || 0
    }
    return 0
  } catch (err: any) {
    console.error('Get uid error:', err)
    return 0
  }
}

// 喜欢/取消喜欢歌曲
const likeSong = async (
  songId: string | number,
  uid: string | number,
  like: boolean,
  cookie: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const t = Date.now()
    console.log('[likeSong] 请求参数:', {
      songId,
      uid,
      like,
      url: `${API_BASE_URL}/song/like?id=${songId}&uid=${uid}&like=${like}&cookie=${cookie}&t=${t}`
    })
    const response: any = httpFetch(
      `${API_BASE_URL}/song/like?id=${songId}&uid=${uid}&like=${like}&cookie=${encodeURIComponent(cookie)}&t=${t}`,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache',
        },
      }
    )
    const {body, statusCode} = await response.promise
    console.log('[likeSong] 响应:', {statusCode, body})
    if (statusCode === 200 && body.code === 200) {
      return {success: true, message: 'success'}
    }
    return {success: false, message: body.message || '操作失败'}
  } catch (err: any) {
    console.error('Like song error:', err)
    return {success: false, message: err.message || '网络错误'}
  }
}

// 检查歌曲是否已喜爱（不使用缓存）
const checkIsLiked = async (
  ids: (string | number)[],
  cookie: string
): Promise<{ success: boolean; likedIds: Set<string | number>; message: string }> => {
  try {
    const idsStr = JSON.stringify(ids)  // [123] -> "[123]"
    const t = Date.now()
    console.log('[checkIsLiked] 请求参数:', {
      ids,
      idsStr,
      url: `${API_BASE_URL}/song/like/check?ids=${idsStr}&cookie=${cookie}&t=${t}`
    })
    const response: any = httpFetch(`${API_BASE_URL}/song/like/check?ids=${idsStr}&cookie=${encodeURIComponent(cookie)}&t=${t}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cache-Control': 'no-cache',
      },
    })
    const {body, statusCode} = await response.promise
    console.log('[checkIsLiked] 响应:', {statusCode, body})
    if (statusCode === 200 && body.code === 200) {
      return {success: true, likedIds: new Set(body.ids || []), message: 'success'}
    }
    return {success: false, likedIds: new Set(), message: body.message || '查询失败'}
  } catch (err: any) {
    console.error('Check is liked error:', err)
    return {success: false, likedIds: new Set(), message: err.message || '网络错误'}
  }
}

// 每日签到
const dailySignin = async (cookie: string, type: number = 1): Promise<{ success: boolean; point?: number; message: string }> => {
  try {
    console.log('[dailySignin] 请求参数:', { type, url: `${API_BASE_URL}/daily_signin?type=${type}&cookie=${cookie}` })
    const response: any = httpFetch(`${API_BASE_URL}/daily_signin?type=${type}&cookie=${encodeURIComponent(cookie)}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const {body, statusCode} = await response.promise
    console.log('[dailySignin] 响应:', {statusCode, body})
    if (statusCode === 200) {
      if (body.code === 200) {
        return {success: true, point: body.point, message: '签到成功'}
      } else if (body.code === -2) {
        return {success: false, message: '重复签到'}
      }
    }
    return {success: false, message: body.message || '签到失败'}
  } catch (err: any) {
    console.error('Daily signin error:', err)
    return {success: false, message: err.message || '签到失败'}
  }
}

// 搜索歌手
interface SearchArtistResult {
  artistId: number
  artistName: string
  artistAvatarPicUrl: string
}

const searchArtist = async (keyword: string, limit = 5): Promise<SearchArtistResult[]> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/ugc/artist/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    const { body, statusCode } = await response.promise
    if (statusCode !== 200 || body.code !== 200) {
      console.error('Search artist error:', body)
      return []
    }
    return (body.data?.list || []).map((item: any) => ({
      artistId: item.artistId,
      artistName: item.artistName,
      artistAvatarPicUrl: item.artistAvatarPicUrl || '',
    }))
  } catch (err: any) {
    console.error('Search artist error:', err)
    return []
  }
}

// 获取专辑详情
interface AlbumInfo {
  id: number
  name: string
  picUrl: string
  artist: {
    id: number
    name: string
    picUrl: string
  }
  publishTime: number
  size: number
  description: string
  briefDesc: string
}

const getAlbumDetail = async (albumId: string | number): Promise<{ album: AlbumInfo; songs: any[] }> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/album?id=${albumId}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    const { body, statusCode } = await response.promise
    if (statusCode !== 200 || body.code !== 200) {
      console.error('Get album detail error:', body)
      throw new Error('获取专辑详情失败')
    }
    return {
      album: body.album,
      songs: body.songs || [],
    }
  } catch (err: any) {
    console.error('Get album detail error:', err)
    throw err
  }
}

export default {
  API_BASE_URL,
  getCsrfToken,
  sendCaptcha,
  loginByCaptcha,
  scrobble,
  getDailySongs,
  getSimiSongs,
  getSimiPlaylist,
  getUid,
  verifyCookie,
  getUserPlaylist,
  likeSong,
  checkIsLiked,
  dailySignin,
  getArtistInfo,
  getArtistSongs,
  searchArtist,
  getAlbumDetail,
}
