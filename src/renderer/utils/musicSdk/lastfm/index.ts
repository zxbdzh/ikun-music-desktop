import { httpFetch } from '../../request'
import { createMD5 } from './crypto'
import { appSetting } from '@renderer/store/setting'

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/'

const getApiKey = () => appSetting['common.lastfm_api_key']
const getApiSecret = () => appSetting['common.lastfm_api_secret']

/**
 * 生成 Last.fm API 签名
 */
const generateSignature = (params: Record<string, string>): string => {
  const sortedKeys = Object.keys(params).sort()
  let sigString = ''
  for (const key of sortedKeys) {
    sigString += key + params[key]
  }
  sigString += getApiSecret()
  console.log('[LastFM] generateSignature input:', sigString, '-> MD5:', createMD5(sigString))
  return createMD5(sigString)
}

/**
 * 通用 API 请求
 */
const callApi = async (
  method: string,
  params: Record<string, string>,
  isPost = false
): Promise<any> => {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('Last.fm API Key not configured')
  }

  const allParams: Record<string, string> = {
    ...params,
    api_key: apiKey,
    method,
    format: 'json',
  }

  // 如果是 signed 请求，需要添加签名
  // 签名不包括 api_key、api_sig、format（只有这三个）
  const isSigned = !params.sk
  if (isSigned) {
    const sigParams = {
      ...params,
      method,
    }
    allParams.api_sig = generateSignature(sigParams)
  }

  try {
    let url = LASTFM_API_BASE
    let body = ''

    if (isPost) {
      const formData = new URLSearchParams()
      for (const [key, value] of Object.entries(allParams)) {
        formData.append(key, value)
      }
      body = formData.toString()
    } else {
      const queryString = Object.entries(allParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')
      url += `?${queryString}`
    }

    const response: any = httpFetch(url, {
      method: isPost ? 'POST' : 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      ...(isPost ? { body } : {}),
    })

    const { body: responseBody, statusCode } = await response.promise
    console.log('[LastFM] API response status:', statusCode, 'body:', JSON.stringify(responseBody))
    if (statusCode !== 200) {
      throw new Error(`HTTP error: ${statusCode}`)
    }
    return responseBody
  } catch (e) {
    console.error('[LastFM] API call failed:', e)
    throw e
  }
}

/**
 * 获取 Session（通过 token 换取 session_key）
 */
export const getSession = async (token: string): Promise<{ session_key: string; name: string }> => {
  console.log('[LastFM] getSession called with token:', token)
  const result = await callApi('auth.getSession', { token }, true)
  console.log('[LastFM] getSession result:', JSON.stringify(result))
  if (result.error) {
    throw new Error(result.message || 'Failed to get session')
  }
  return {
    session_key: result.session.key,
    name: result.session.name,
  }
}

/**
 * 上报正在播放
 */
export const updateNowPlaying = async (params: {
  track: string
  artist: string
  album?: string
  duration?: number
  sessionKey: string
}): Promise<void> => {
  try {
    const apiParams: Record<string, string> = {
      sk: params.sessionKey,
      track: params.track,
      artist: params.artist,
    }
    if (params.album) apiParams.album = params.album
    if (params.duration) apiParams.duration = String(Math.floor(params.duration / 1000))

    await callApi('track.updateNowPlaying', apiParams, true)
  } catch (e) {
    console.error('[LastFM] updateNowPlaying failed:', e)
  }
}

/**
 * 上报听歌记录
 */
export const scrobble = async (params: {
  track: string
  artist: string
  album?: string
  duration?: number
  timestamp: number
  sessionKey: string
}): Promise<void> => {
  try {
    const apiParams: Record<string, string> = {
      sk: params.sessionKey,
      track: params.track,
      artist: params.artist,
      timestamp: String(params.timestamp),
    }
    if (params.album) apiParams.album = params.album
    if (params.duration) apiParams.duration = String(Math.floor(params.duration / 1000))

    await callApi('track.scrobble', apiParams, true)
  } catch (e) {
    console.error('[LastFM] scrobble failed:', e)
  }
}

/**
 * 查询歌曲信息
 */
export const getTrackInfo = async (params: {
  track: string
  artist: string
}): Promise<any | null> => {
  try {
    const result = await callApi('track.getInfo', {
      track: params.track,
      artist: params.artist,
      autocorrect: '1',
    })
    return result.track || null
  } catch (e) {
    console.error('[LastFM] getTrackInfo failed:', e)
    return null
  }
}

/**
 * 查询艺人信息
 */
export const getArtistInfo = async (artist: string): Promise<any | null> => {
  try {
    const result = await callApi('artist.getInfo', {
      artist,
      autocorrect: '1',
    })
    return result.artist || null
  } catch (e) {
    console.error('[LastFM] getArtistInfo failed:', e)
    return null
  }
}

/**
 * 获取授权 URL
 */
export const getAuthUrl = (): string => {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('Last.fm API Key not configured')
  }
  return `https://www.last.fm/api/auth/?api_key=${apiKey}&cb=lxmusic://lastfm/auth`
}
