import {
  decodeAurioClubAuthSession,
  decodeAurioClubItunesSearch,
  decodeAurioClubPodcasts,
  decodeAurioClubPopularSources,
  decodeAurioClubSyncPull,
  decodeAurioClubUserData,
  type AurioClubAuthSessionData,
  type AurioClubItunesSearchResponse,
  type AurioClubPodcast,
  type AurioClubPopularSource,
  type AurioClubSyncPullData,
  type AurioClubUserData,
} from './aurioClubContract'

const CORE_BASE_URL = 'https://api.aurioclub.com/api/v1'
const EDGE_BASE_URL = 'https://app.aurioclub.com'
const ITUNES_BASE_URL = 'https://itunes.apple.com'

interface Envelope<T> {
  success: boolean
  code: string
  message: string
  trace_id: string
  data: T
}

export class AurioClubError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly traceId: string,
    readonly status: number
  ) {
    super(message)
  }
}

export interface AurioClubClientOptions {
  coreBaseUrl?: string
  edgeBaseUrl?: string
  getToken?: () => Promise<string | null>
  timeoutMs?: number
  fetcher?: typeof fetch
}

export class AurioClubClient {
  private readonly coreBaseUrl: string
  private readonly edgeBaseUrl: string
  private readonly getToken: () => Promise<string | null>
  private readonly timeoutMs: number
  private readonly fetcher: typeof fetch

  constructor(options: AurioClubClientOptions = {}) {
    this.coreBaseUrl = options.coreBaseUrl ?? CORE_BASE_URL
    this.edgeBaseUrl = options.edgeBaseUrl ?? EDGE_BASE_URL
    this.getToken = options.getToken ?? (async () => null)
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.fetcher = options.fetcher ?? fetch
  }

  async catalog(): Promise<AurioClubPodcast[]> {
    return this.request('/podcasts', { decode: decodeAurioClubPodcasts })
  }

  async popularSources(
    days: LX.Podcast.PopularPeriod,
    sort: LX.Podcast.PopularSort
  ): Promise<AurioClubPopularSource[]> {
    return this.request(`/stats/popular-sources?days=${days}&sort=${sort}`, {
      decode: decodeAurioClubPopularSources,
    })
  }

  async searchItunes(query: string): Promise<AurioClubItunesSearchResponse> {
    const term = encodeURIComponent(query)
    try {
      return await this.request(`/api/itunes-search?term=${term}`, {
        edge: true,
        envelope: false,
        decode: decodeAurioClubItunesSearch,
      })
    } catch {
      return this.request(`/search?term=${term}&media=podcast`, {
        baseUrl: ITUNES_BASE_URL,
        envelope: false,
        decode: decodeAurioClubItunesSearch,
      })
    }
  }

  async proxyText(url: string): Promise<string> {
    assertPublicHttpUrl(url)
    return this.request(`/proxy?url=${encodeURIComponent(url)}`, {
      envelope: false,
      response: 'text',
    })
  }

  async sendCode(email: string): Promise<void> {
    await this.request('/auth/send-code', { method: 'POST', body: { email } })
  }

  async loginPassword(email: string, password: string): Promise<AurioClubAuthSessionData> {
    return this.request('/auth/login-password', {
      method: 'POST',
      body: { email, password },
      decode: decodeAurioClubAuthSession,
    })
  }

  async loginEmail(email: string, code: string): Promise<AurioClubAuthSessionData> {
    return this.request('/auth/login-email', {
      method: 'POST',
      body: { email, code },
      decode: decodeAurioClubAuthSession,
    })
  }

  async registerPassword(
    email: string,
    code: string,
    password: string
  ): Promise<AurioClubAuthSessionData> {
    return this.request('/auth/register-password', {
      method: 'POST',
      body: { email, code, password },
      decode: decodeAurioClubAuthSession,
    })
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.request('/auth/reset-password', {
      method: 'POST',
      body: { email, code, new_password: newPassword },
    })
  }

  async me(): Promise<AurioClubUserData> {
    return this.request('/auth/me', {
      authenticated: true,
      decode: decodeAurioClubUserData,
    })
  }

  async updateProfile(username: string): Promise<AurioClubUserData> {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: { username },
      authenticated: true,
      decode: decodeAurioClubUserData,
    })
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.request('/auth/change-password', {
      method: 'POST',
      body: { old_password: oldPassword, new_password: newPassword },
      authenticated: true,
    })
  }

  async linkDevice(deviceId: string, migrateGuestData: boolean): Promise<void> {
    await this.request('/auth/link-device', {
      method: 'POST',
      body: { device_id: deviceId, migrate_guest_data: migrateGuestData },
      authenticated: true,
    })
  }

  async track(batch: LX.Podcast.AnalyticsEvent[]): Promise<void> {
    await this.request('/track', {
      method: 'POST',
      body: { batch },
      response: 'none',
    })
  }

  async pull(since: number): Promise<AurioClubSyncPullData> {
    return this.request(`/sync/pull?since=${Math.max(0, Math.floor(since))}`, {
      authenticated: true,
      decode: decodeAurioClubSyncPull,
    })
  }

  async pushProgress(body: Record<string, unknown>): Promise<void> {
    await this.request('/sync/progress', { method: 'POST', body, authenticated: true })
  }

  async pushProgressBatch(body: Record<string, unknown>): Promise<void> {
    await this.request('/sync/progress/batch', { method: 'POST', body, authenticated: true })
  }

  async pushPreferences(body: Record<string, unknown>): Promise<void> {
    await this.request('/sync/preferences', { method: 'POST', body, authenticated: true })
  }

  private async request<T = unknown>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT'
      body?: Record<string, unknown>
      authenticated?: boolean
      edge?: boolean
      baseUrl?: string
      envelope?: boolean
      response?: 'json' | 'text' | 'none'
      decode?: (value: unknown) => T
    } = {}
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const headers = new Headers({ Accept: 'application/json' })
    if (options.body) headers.set('Content-Type', 'application/json')
    if (options.authenticated) {
      const token = await this.getToken()
      if (!token) throw new AurioClubError('需要重新登录 AurioClub', 'AUTH_REQUIRED', '', 401)
      headers.set('Authorization', `Bearer ${token}`)
    }

    try {
      const response = await this.fetcher(
        `${options.baseUrl ?? (options.edge ? this.edgeBaseUrl : this.coreBaseUrl)}${path}`,
        {
          method: options.method ?? 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
          redirect: 'follow',
        }
      )
      if (options.response === 'text') {
        if (!response.ok) throw await toHttpError(response)
        return (await response.text()) as T
      }
      if (options.response === 'none') {
        if (!response.ok) throw await toHttpError(response)
        return undefined as T
      }

      const value = (await response.json()) as unknown
      if (options.envelope === false) {
        if (!response.ok) throw await toHttpError(response, value)
        return decodeData(value, options.decode, '', response.status)
      }
      if (!isEnvelope(value)) {
        throw new AurioClubError('AurioClub 返回了无法识别的数据', 'INVALID_RESPONSE', '', response.status)
      }
      if (!response.ok || !value.success) {
        throw new AurioClubError(value.message, value.code, value.trace_id, response.status)
      }
      return decodeData(value.data, options.decode, value.trace_id, response.status)
    } finally {
      clearTimeout(timeout)
    }
  }
}

const decodeData = <T>(
  value: unknown,
  decode: ((value: unknown) => T) | undefined,
  traceId: string,
  status: number
): T => {
  if (!decode) return value as T
  try {
    return decode(value)
  } catch (error) {
    const detail = error instanceof Error ? `：${error.message}` : ''
    throw new AurioClubError(
      `AurioClub 返回了无法识别的数据${detail}`,
      'INVALID_RESPONSE',
      traceId,
      status
    )
  }
}

const isEnvelope = (value: unknown): value is Envelope<unknown> => {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.success === 'boolean' &&
    typeof item.code === 'string' &&
    typeof item.message === 'string' &&
    typeof item.trace_id === 'string' &&
    'data' in item
  )
}

const toHttpError = async (response: Response, value?: unknown) => {
  let body = value
  if (body == null) {
    try {
      body = await response.json()
    } catch {}
  }
  if (isEnvelope(body)) {
    return new AurioClubError(body.message, body.code, body.trace_id, response.status)
  }
  return new AurioClubError(`AurioClub 请求失败 (${response.status})`, 'HTTP_ERROR', '', response.status)
}

export const assertPublicHttpUrl = (value: string) => {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅支持 HTTP(S) 地址')
  if (url.username || url.password) throw new Error('地址不能包含凭据')
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('不允许访问本机或私有网络地址')
  }
}
