import { describe, expect, it, vi } from 'vitest'
import {
  createElectronPodcastFetcher,
  createPodcastFetcher,
  resolvePodcastProxyUrl,
} from './network'

describe('podcast network proxy', () => {
  it('injects the podcast dispatcher into undici fetch', async () => {
    const response = { ok: true }
    const fetchImpl = vi.fn(async () => response)
    const dispatcher = {} as any
    const fetchPodcast = createPodcastFetcher(fetchImpl as any, () => dispatcher)

    await expect(fetchPodcast('https://huggingface.co/model.bin', {
      method: 'HEAD',
    })).resolves.toBe(response)
    expect(fetchImpl).toHaveBeenCalledWith('https://huggingface.co/model.bin', {
      method: 'HEAD',
      dispatcher,
    })
  })

  it('prefers the IKUN proxy and otherwise falls back to environment proxy variables', () => {
    expect(resolvePodcastProxyUrl(
      { enabled: true, host: '127.0.0.1', port: '7891' },
      { HTTPS_PROXY: 'http://127.0.0.1:7890' }
    )).toBe('http://127.0.0.1:7891')
    expect(resolvePodcastProxyUrl(
      { enabled: false, host: '', port: '' },
      { HTTPS_PROXY: 'http://127.0.0.1:7890' }
    )).toBe('http://127.0.0.1:7890')
  })

  it('uses the Windows system proxy in an isolated Electron session', async () => {
    const response = { ok: true }
    const podcastSession = {
      setProxy: vi.fn(async () => undefined),
      closeAllConnections: vi.fn(async () => undefined),
      fetch: vi.fn(async () => response),
    }
    const fetchPodcast = createElectronPodcastFetcher(
      () => podcastSession as any,
      () => ({ enabled: false, host: '', port: '' })
    )

    await expect(fetchPodcast('https://huggingface.co/model.bin', {
      method: 'HEAD',
    })).resolves.toBe(response)
    expect(podcastSession.setProxy).toHaveBeenCalledWith({ mode: 'system' })
    expect(podcastSession.closeAllConnections).toHaveBeenCalledOnce()
    expect(podcastSession.fetch).toHaveBeenCalledWith('https://huggingface.co/model.bin', {
      method: 'HEAD',
    })
  })

  it('prefers the IKUN proxy and only reconfigures Electron when it changes', async () => {
    const setting = { enabled: true, host: '127.0.0.1', port: '7891' }
    const podcastSession = {
      setProxy: vi.fn(async () => undefined),
      closeAllConnections: vi.fn(async () => undefined),
      fetch: vi.fn(async () => ({ ok: true })),
    }
    const fetchPodcast = createElectronPodcastFetcher(
      () => podcastSession as any,
      () => setting
    )

    await fetchPodcast('https://example.com/first')
    await fetchPodcast('https://example.com/second')
    expect(podcastSession.setProxy).toHaveBeenCalledTimes(1)
    expect(podcastSession.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:7891',
    })

    setting.port = '7892'
    await fetchPodcast('https://example.com/third')
    expect(podcastSession.setProxy).toHaveBeenLastCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:7892',
    })
    expect(podcastSession.closeAllConnections).toHaveBeenCalledTimes(2)
  })
})
