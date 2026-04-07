/**
 * 网易云音乐工具类
 * 统一管理 API 调用，包括登录、打卡等
 */

// @ts-ignore
import { httpFetch } from '../../request'

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

    const { body, statusCode } = await response.promise

    if (statusCode === 200 && body.code === 200) {
      return { success: true, message: '验证码已发送' }
    }

    return { success: false, message: body.message || '发送验证码失败' }
  } catch (err: any) {
    console.error('Send captcha error:', err)
    return { success: false, message: err.message || '网络错误' }
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

    const { body, statusCode } = await response.promise

    if (statusCode === 200) {
      if (body.code === 200) {
        const cookie = body.cookie || ''
        const uid = body.profile?.userId || body.account?.id || 0
        return { success: true, cookie, uid, message: '登录成功' }
      } else if (body.code === 400) {
        return { success: false, cookie: '', uid: 0, message: body.message || '验证码错误' }
      }
    }

    return { success: false, cookie: '', uid: 0, message: body.message || '登录失败' }
  } catch (err: any) {
    console.error('Login by captcha error:', err)
    return { success: false, cookie: '', uid: 0, message: err.message || '网络错误' }
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

    const response: any = httpFetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        cookie,
      },
    })

    const { body, statusCode } = await response.promise

    console.log('[Scrobble API] Response:', { statusCode, body })
    return statusCode === 200 && body.code === 200
  } catch (err: any) {
    console.error('Scrobble error:', err)
    return false
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

    const { body, statusCode } = await response.promise

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
      return { id: 0, name: '', picUrl: '' }
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

// 获取每日推荐歌曲
const getDailySongs = async (cookie: string): Promise<any[]> => {
  try {
    const response: any = httpFetch(`${API_BASE_URL}/recommend/songs`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        cookie,
      },
    })

    const { body, statusCode } = await response.promise

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
      return { id: 0, name: '', picUrl: '' }
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

export default {
  API_BASE_URL,
  getCsrfToken,
  sendCaptcha,
  loginByCaptcha,
  scrobble,
  getDailySongs,
  getSimiSongs,
}
