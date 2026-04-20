import { LastFM } from 'lastfm-ts-api'
import { appSetting } from '@renderer/store/setting'

let client: LastFM | null = null

const getClient = () => {
  const apiKey = appSetting['common.lastfm_api_key']
  const apiSecret = appSetting['common.lastfm_api_secret']
  const sessionKey = appSetting['common.lastfm_session_key']

  if (!apiKey || !apiSecret || !sessionKey) {
    console.log('[LastFM] Missing config: apiKey or apiSecret or sessionKey')
    return null
  }

  if (!client) {
    client = new LastFM({
      apiKey,
      apiSecret,
      sessionKey,
    })
    console.log('[LastFM] Client created successfully')
  }

  return client
}

/**
 * 获取授权 URL
 */
export const getAuthUrl = (): string => {
  const apiKey = appSetting['common.lastfm_api_key']
  if (!apiKey) {
    throw new Error('Last.fm API Key not configured')
  }
  return `https://www.last.fm/api/auth/?api_key=${apiKey}&cb=lxmusic://lastfm/auth`
}

/**
 * 获取 Session（通过 token 换取 session_key）
 */
export const getSession = async (token: string): Promise<{ session_key: string; name: string }> => {
  console.log('[LastFM] getSession called with token:', token)
  const apiKey = appSetting['common.lastfm_api_key']
  const apiSecret = appSetting['common.lastfm_api_secret']

  if (!apiKey || !apiSecret) {
    throw new Error('Last.fm API Key or Secret not configured')
  }

  const tempClient = new LastFM({ apiKey, apiSecret })
  const result = await tempClient.auth.getSession({ token })
  console.log('[LastFM] getSession result:', JSON.stringify(result))
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
    const lfm = getClient()
    if (!lfm) {
      console.log('[LastFM] updateNowPlaying: no client available')
      return
    }

    console.log('[LastFM] updateNowPlaying called:', { track: params.track, artist: params.artist, album: params.album, duration: params.duration })
    await lfm.track.updateNowPlaying({
      track: params.track,
      artist: params.artist,
      album: params.album,
      duration: params.duration ? Math.floor(params.duration / 1000) : undefined,
    })
    console.log('[LastFM] updateNowPlaying success')
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
    const lfm = getClient()
    if (!lfm) {
      console.log('[LastFM] scrobble: no client available')
      return
    }

    console.log('[LastFM] scrobble called:', { track: params.track, artist: params.artist, album: params.album, duration: params.duration, timestamp: params.timestamp })
    await lfm.track.scrobble({
      track: params.track,
      artist: params.artist,
      album: params.album,
      duration: params.duration ? Math.floor(params.duration / 1000) : undefined,
      timestamp: params.timestamp,
    })
    console.log('[LastFM] scrobble success')
  } catch (e) {
    console.error('[LastFM] scrobble failed:', e)
  }
}
