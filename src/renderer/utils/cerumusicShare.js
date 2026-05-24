/**
 * CeruMusic 分享接入
 *
 * 通过 CeruMusic 后端创建分享记录,使 ikun 卡片二维码跳转到 CeruMusic 官方落地页。
 * 登录走标准 OIDC + PKCE(复用 CeruMusic 的 Logto 应用),授权页在系统浏览器打开,
 * 回调经 ikun 已注册的 lxmusic:// 协议返回。
 */
import {
  CERUMUSIC_API_BASE,
  LOGTO_ENDPOINT,
  LOGTO_APP_ID,
  LOGTO_REDIRECT_URI,
  LOGTO_API_RESOURCE,
  LOGTO_SCOPES,
  SHARE_DEFAULT_TTL_DAYS,
} from '@common/cerumusic'
import { onDeeplink, getUserApiFingerprint } from '@renderer/utils/ipc'
import { toOldMusicInfo } from '@renderer/utils'
import { appSetting } from '@renderer/store/setting'

const TOKEN_STORE_KEY = 'cerumusic_oidc_tokens'
const CALLBACK_TIMEOUT = 5 * 60 * 1000

// ------------------------- PKCE / 编码工具 -------------------------

const base64Url = (bytes) => {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return window.btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const randomString = () => base64Url(window.crypto.getRandomValues(new Uint8Array(48)))

const createCodeChallenge = async (verifier) => {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

// ------------------------- OIDC 端点发现 -------------------------

let oidcConfigPromise = null
const getOidcConfig = () => {
  if (oidcConfigPromise) return oidcConfigPromise
  const fallback = {
    authorization_endpoint: `${LOGTO_ENDPOINT}oidc/auth`,
    token_endpoint: `${LOGTO_ENDPOINT}oidc/token`,
  }
  oidcConfigPromise = fetch(`${LOGTO_ENDPOINT}oidc/.well-known/openid-configuration`)
    .then((res) => (res.ok ? res.json() : fallback))
    .then((cfg) => ({
      authorization_endpoint: cfg.authorization_endpoint || fallback.authorization_endpoint,
      token_endpoint: cfg.token_endpoint || fallback.token_endpoint,
    }))
    .catch(() => fallback)
  return oidcConfigPromise
}

// ------------------------- 令牌存储 -------------------------

const loadTokens = () => {
  try {
    const raw = window.localStorage.getItem(TOKEN_STORE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
const saveTokens = (tokens) => {
  window.localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(tokens))
}
const clearTokens = () => {
  window.localStorage.removeItem(TOKEN_STORE_KEY)
}
const toStoredTokens = (resp) => ({
  accessToken: resp.access_token,
  refreshToken: resp.refresh_token || null,
  expiresAt: Date.now() + (resp.expires_in || 3600) * 1000,
})

export const isLoggedIn = () => {
  const tokens = loadTokens()
  return !!(tokens && (tokens.refreshToken || tokens.expiresAt > Date.now()))
}

export const signOut = () => {
  clearTokens()
}

// ------------------------- OAuth 回调监听 -------------------------

// state -> { resolve, reject, timer }
const pendingCallbacks = new Map()

const handleDeeplink = (link) => {
  if (typeof link !== 'string' || !link.startsWith('lxmusic://oauth/callback')) return
  const query = link.split('?')[1] || ''
  const params = {}
  for (const pair of query.split('&')) {
    if (!pair) continue
    const [k, v] = pair.split('=')
    params[k] = decodeURIComponent(v || '')
  }
  const pending = params.state && pendingCallbacks.get(params.state)
  if (!pending) return
  pendingCallbacks.delete(params.state)
  clearTimeout(pending.timer)
  if (params.error) {
    pending.reject(new Error(params.error_description || params.error))
  } else if (params.code) {
    pending.resolve(params.code)
  } else {
    pending.reject(new Error('授权回调缺少 code'))
  }
}

onDeeplink(({ params: link }) => {
  handleDeeplink(link)
})

const waitForCallback = (state) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCallbacks.delete(state)
      reject(new Error('登录超时,请重试'))
    }, CALLBACK_TIMEOUT)
    pendingCallbacks.set(state, { resolve, reject, timer })
  })

// ------------------------- 登录 / 令牌交换 -------------------------

const exchangeToken = async (form) => {
  const { token_endpoint } = await getOidcConfig()
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || '令牌获取失败')
  }
  return toStoredTokens(json)
}

const signIn = async () => {
  const verifier = randomString()
  const challenge = await createCodeChallenge(verifier)
  const state = randomString()
  const { authorization_endpoint } = await getOidcConfig()

  const query = new URLSearchParams({
    client_id: LOGTO_APP_ID,
    redirect_uri: LOGTO_REDIRECT_URI,
    response_type: 'code',
    scope: LOGTO_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: LOGTO_API_RESOURCE,
    prompt: 'consent',
  })

  const callbackPromise = waitForCallback(state)
  // 经主进程 setWindowOpenHandler 转交系统浏览器打开
  window.open(`${authorization_endpoint}?${query.toString()}`, '_blank')

  const code = await callbackPromise
  const tokens = await exchangeToken({
    grant_type: 'authorization_code',
    client_id: LOGTO_APP_ID,
    code,
    redirect_uri: LOGTO_REDIRECT_URI,
    code_verifier: verifier,
    resource: LOGTO_API_RESOURCE,
  })
  saveTokens(tokens)
  return tokens
}

const refreshTokens = async (refreshToken) => {
  const tokens = await exchangeToken({
    grant_type: 'refresh_token',
    client_id: LOGTO_APP_ID,
    refresh_token: refreshToken,
    resource: LOGTO_API_RESOURCE,
  })
  saveTokens(tokens)
  return tokens
}

const getAccessToken = async () => {
  let tokens = loadTokens()
  if (tokens && tokens.expiresAt - 60000 > Date.now()) return tokens.accessToken
  if (tokens && tokens.refreshToken) {
    try {
      tokens = await refreshTokens(tokens.refreshToken)
      return tokens.accessToken
    } catch {
      clearTokens()
    }
  }
  tokens = await signIn()
  return tokens.accessToken
}

// ------------------------- CeruMusic 后端 API -------------------------

const unwrap = (json) => {
  if (json && typeof json === 'object' && 'code' in json && 'data' in json) return json.data
  return json
}

const apiPost = async (path, body) => {
  const token = await getAccessToken()
  const res = await fetch(`${CERUMUSIC_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 401) {
    clearTokens()
    throw new Error('登录已失效,请重新登录')
  }
  if (!res.ok) {
    throw new Error(unwrap(json)?.message || json?.message || `请求失败 (${res.status})`)
  }
  return unwrap(json)
}

// ------------------------- 对外:为歌曲生成分享链接 -------------------------

/**
 * 调用 CeruMusic 后端为指定歌曲创建分享记录。
 * @param {LX.Music.MusicInfo} musicInfo
 * @param {{ lrc?: string, trans?: string }} lyric
 * @returns {Promise<string>} 分享落地页 URL
 */
export const createShareForMusic = async (musicInfo, lyric = {}) => {
  if (!musicInfo) throw new Error('缺少歌曲信息')

  const apiSourceId = appSetting['common.apiSource']
  if (!apiSourceId || !/^user_api/.test(apiSourceId)) {
    throw new Error('当前为内置音源,暂不支持生成澜音分享,请切换到用户 API 音源')
  }

  // 触发登录(若需要)并保证后续 apiPost 拿到有效令牌
  await getAccessToken()

  const fingerprint = await getUserApiFingerprint(apiSourceId)
  if (!fingerprint?.code || !fingerprint?.md5) {
    throw new Error('未能读取当前音源插件')
  }

  const exists = await apiPost('/share/precheck', { pluginMd5: fingerprint.md5 })
  if (!exists?.hasPlugin) {
    const uploaded = await apiPost('/share/upload-plugin', {
      pluginCode: fingerprint.code,
      md5: fingerprint.md5,
      type: 'lx',
    })
    if (uploaded && uploaded.ok === false) {
      throw new Error(uploaded.message || '音源插件上传失败')
    }
  }

  const old = toOldMusicInfo(musicInfo)
  const result = await apiPost('/share/create', {
    pluginMd5: fingerprint.md5,
    source: musicInfo.source,
    ttlDays: SHARE_DEFAULT_TTL_DAYS,
    song: {
      songmid: old.songmid,
      hash: old.hash,
      name: old.name,
      singer: old.singer,
      albumName: old.albumName,
      albumId: old.albumId,
      source: old.source,
      interval: old.interval,
      img: old.img,
      types: old.types,
      _types: old._types,
    },
    lyric: {
      lrc: lyric.lrc || undefined,
      trans: lyric.trans || undefined,
      format: 'lrc',
    },
    hotComments: [],
  })

  if (!result?.url) throw new Error('分享链接生成失败')
  return result.url
}
