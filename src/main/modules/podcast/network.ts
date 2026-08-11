import {
  getGlobalDispatcher,
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from 'undici'

export type PodcastResponse = Awaited<ReturnType<typeof undiciFetch>>
type PodcastFetchOptions = Parameters<typeof undiciFetch>[1]
type PodcastFetchImpl = (
  url: string,
  options?: PodcastFetchOptions & { dispatcher?: Dispatcher }
) => Promise<PodcastResponse>

interface PodcastProxySetting {
  enabled: boolean
  host: string
  port: string
}

interface PodcastElectronSession {
  setProxy: (config: Electron.ProxyConfig) => Promise<void>
  closeAllConnections: () => Promise<void>
  fetch: (url: string, options?: PodcastFetchOptions) => Promise<PodcastResponse>
}

const PODCAST_SESSION_PARTITION = 'persist:podcast-network'

let cachedProxyUrl: string | null | undefined
let cachedDispatcher: Dispatcher | undefined
let cachedElectronSession: PodcastElectronSession | undefined

export const resolvePodcastProxyUrl = (
  setting: PodcastProxySetting,
  environment: Record<string, string | undefined>
) => {
  if (setting.enabled && setting.host.trim()) {
    return normalizeProxyUrl(setting.host, setting.port)
  }
  return environment.HTTPS_PROXY ??
    environment.https_proxy ??
    environment.ALL_PROXY ??
    environment.all_proxy ??
    environment.HTTP_PROXY ??
    environment.http_proxy ??
    null
}

export const createPodcastFetcher = (
  fetchImpl: PodcastFetchImpl,
  getDispatcher: () => Dispatcher
) => (url: string, options: PodcastFetchOptions = {}) =>
  fetchImpl(url, { ...options, dispatcher: getDispatcher() })

export const createElectronPodcastFetcher = (
  getSession: () => PodcastElectronSession | Promise<PodcastElectronSession>,
  getSetting: () => PodcastProxySetting
) => {
  let configuredSession: PodcastElectronSession | undefined
  let configuredProxy = ''
  let configuring: Promise<void> | undefined

  return async (url: string, options: PodcastFetchOptions = {}) => {
    const podcastSession = await getSession()
    const setting = getSetting()
    const proxy = setting.enabled && setting.host.trim()
      ? {
          mode: 'fixed_servers' as const,
          proxyRules: normalizeProxyUrl(setting.host, setting.port),
        }
      : { mode: 'system' as const }
    const proxyKey = JSON.stringify(proxy)

    if (configuredSession !== podcastSession || configuredProxy !== proxyKey) {
      configuring = (async () => {
        await podcastSession.setProxy(proxy)
        await podcastSession.closeAllConnections()
        configuredSession = podcastSession
        configuredProxy = proxyKey
      })()
    }
    await configuring
    return podcastSession.fetch(url, options)
  }
}

const undiciPodcastFetch = createPodcastFetcher(
  undiciFetch as PodcastFetchImpl,
  getPodcastDispatcher
)

const electronPodcastFetch = createElectronPodcastFetcher(
  getPodcastElectronSession,
  getPodcastProxySetting
)

export const podcastFetch = (url: string, options: PodcastFetchOptions = {}) =>
  process.versions.electron
    ? electronPodcastFetch(url, options)
    : undiciPodcastFetch(url, options)

export const formatPodcastNetworkError = (error: unknown) => {
  const value = error instanceof Error ? error : new Error(String(error))
  const cause = value.cause && typeof value.cause === 'object'
    ? value.cause as { code?: unknown; message?: unknown }
    : null
  const message = typeof cause?.message === 'string' ? cause.message : value.message
  const code = typeof cause?.code === 'string' ? cause.code : ''
  return code ? `${message} (${code})` : message
}

async function getPodcastElectronSession() {
  if (cachedElectronSession) return cachedElectronSession
  const { session } = await import('electron')
  cachedElectronSession = session.fromPartition(PODCAST_SESSION_PARTITION) as unknown as PodcastElectronSession
  return cachedElectronSession
}

function getPodcastProxySetting(): PodcastProxySetting {
  const setting = global.lx?.appSetting
  return {
    enabled: setting?.['network.proxy.enable'] ?? false,
    host: setting?.['network.proxy.host'] ?? '',
    port: setting?.['network.proxy.port'] ?? '',
  }
}

function getPodcastDispatcher() {
  const proxyUrl = resolvePodcastProxyUrl(getPodcastProxySetting(), process.env)
  if (cachedDispatcher && proxyUrl === cachedProxyUrl) return cachedDispatcher

  const previous = cachedDispatcher
  cachedProxyUrl = proxyUrl
  cachedDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : getGlobalDispatcher()
  if (previous && previous !== cachedDispatcher && previous !== getGlobalDispatcher()) {
    void previous.close()
  }
  return cachedDispatcher
}

const normalizeProxyUrl = (host: string, port: string) => {
  const value = /^[a-z][a-z\d+.-]*:\/\//i.test(host.trim())
    ? new URL(host.trim())
    : new URL(`http://${host.trim()}`)
  if (port.trim()) value.port = port.trim()
  return value.toString().replace(/\/$/, '')
}
