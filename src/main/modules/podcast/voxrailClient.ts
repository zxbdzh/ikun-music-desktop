import { createHash } from 'node:crypto'
import { podcastFetch, type PodcastResponse } from './network'

export const VOXRAIL_RETRY_WINDOW_MS = 5 * 60 * 1000

export type VoxrailRequestStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type VoxrailProgressStage =
  | 'downloading-media'
  | 'transcribing'
  | 'diarizing'
  | 'annotating-speakers'
  | 'publishing-final'

export interface VoxrailTranscriptionProgress {
  stage: VoxrailProgressStage
  percent: number | null
  processedSeconds: number | null
  totalSeconds: number | null
}

export interface VoxrailTranscriptPayload {
  revisionId: string
  kind: 'publisher' | 'partial' | 'final'
  language: string | null
  content: unknown
  plainText: string | null
  durationSeconds: number | null
  warnings: string[]
  createdAt: string
}

export interface VoxrailRequestResponse {
  requestId: string
  status: VoxrailRequestStatus
  cacheHit: boolean
  joined: boolean
  pollUrl: string
  createdAt: string
  completedAt: string | null
  warnings: string[]
  progress?: VoxrailTranscriptionProgress
  transcript?: VoxrailTranscriptPayload
}

export interface VoxrailQuota {
  usedMinutes: number
  reservedMinutes: number
  remainingMinutes: number
  concurrencyLimit: number
  activeJobs: number
  expiresAt: string
}

interface VoxrailClientOptions {
  getBaseUrl: () => string
  getAccessKey: () => string | null
  timeoutMs?: number
  fetcher?: typeof podcastFetch
}

export class VoxrailError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryAfter?: number
  ) {
    super(message)
  }
}

export class VoxrailClient {
  private readonly getBaseUrl: () => string
  private readonly getAccessKey: () => string | null
  private readonly timeoutMs: number
  private readonly fetcher: typeof podcastFetch

  constructor(options: VoxrailClientOptions) {
    this.getBaseUrl = options.getBaseUrl
    this.getAccessKey = options.getAccessKey
    this.timeoutMs = options.timeoutMs ?? 20_000
    this.fetcher = options.fetcher ?? podcastFetch
  }

  createRequest(
    episode: LX.Podcast.Episode,
    feedUrl: string,
    signal?: AbortSignal
  ): Promise<VoxrailRequestResponse> {
    const body = {
      episodeId: episode.id,
      feedUrl,
      guid: episode.guid || undefined,
      title: episode.title || undefined,
      publishedAt:
        episode.publishedAt > 0 ? new Date(episode.publishedAt).toISOString() : undefined,
      enclosureUrlHint: episode.audioUrl || undefined,
    }
    const requestWindow = Math.floor(Date.now() / VOXRAIL_RETRY_WINDOW_MS)
    const idempotencyKey = `ikun-v1:${createHash('sha256')
      .update(JSON.stringify([body, requestWindow]))
      .digest('hex')}`
    return this.request('/transcription-requests', {
      method: 'POST',
      body,
      headers: { 'idempotency-key': idempotencyKey },
      signal,
      decode: decodeRequestResponse,
    })
  }

  getRequest(requestId: string, signal?: AbortSignal): Promise<VoxrailRequestResponse> {
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      throw new VoxrailError('Voxrail 返回了无效的任务标识', 'invalid_request_id', 0)
    }
    return this.request(`/transcription-requests/${requestId}`, {
      signal,
      decode: decodeRequestResponse,
    })
  }

  quota(signal?: AbortSignal): Promise<VoxrailQuota> {
    return this.request('/quota', { signal, decode: decodeQuota })
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST'
      body?: Record<string, unknown>
      headers?: Record<string, string>
      signal?: AbortSignal
      decode: (value: unknown) => T
    }
  ): Promise<T> {
    const baseUrl = normalizeVoxrailBaseUrl(this.getBaseUrl())
    const accessKey = this.getAccessKey()?.trim()
    if (!accessKey) throw new VoxrailError('请先配置 Voxrail 访问 Key', 'access_key_missing', 0)
    const timeoutController = new AbortController()
    const abort = () => timeoutController.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => timeoutController.abort(), this.timeoutMs)
    try {
      let response: PodcastResponse
      try {
        response = await this.fetcher(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessKey}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          redirect: 'error',
          signal: timeoutController.signal,
        })
      } catch (error) {
        if (options.signal?.aborted) throw error
        throw new VoxrailError('无法连接 Voxrail 服务', 'network_error', 0)
      }
      let value: unknown
      try {
        value = await response.json()
      } catch {
        throw new VoxrailError('Voxrail 返回了无法识别的数据', 'invalid_response', response.status)
      }
      if (!response.ok) throw problemFrom(value, response.status)
      try {
        return options.decode(value)
      } catch (error) {
        if (error instanceof VoxrailError) throw error
        throw new VoxrailError('Voxrail 返回了无法识别的数据', 'invalid_response', response.status)
      }
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }
}

export const normalizeVoxrailBaseUrl = (value: string) => {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new VoxrailError('Voxrail 服务地址无效', 'base_url_invalid', 0)
  }
  const loopbackHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopbackHost)) ||
    url.username ||
    url.password
  ) {
    throw new VoxrailError(
      'Voxrail 服务地址必须使用 HTTPS；仅本机开发允许 HTTP',
      'base_url_invalid',
      0
    )
  }
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  if (!url.pathname || url.pathname === '/') url.pathname = '/api/v1'
  return url.toString().replace(/\/$/, '')
}

export const localizeVoxrailSnapshot = (
  value: unknown,
  episodeId: string,
  minimumRevision = 0
): LX.Podcast.TranscriptSnapshot => {
  const item = record(value)
  if (item.protocolVersion !== 2 || !Array.isArray(item.lines) || !Array.isArray(item.speakers)) {
    throw new VoxrailError('Voxrail 字幕协议无效', 'invalid_transcript', 0)
  }
  const state = item.state
  if (!['missing', 'preparing', 'ready', 'failed', 'unavailable'].includes(String(state))) {
    throw new VoxrailError('Voxrail 字幕状态无效', 'invalid_transcript', 0)
  }
  const lines = item.lines.map((raw, lineIndex): LX.Podcast.TranscriptLine => {
    const line = record(raw)
    const startMs = integer(line.startMs)
    const endMs = integer(line.endMs)
    const displayText = text(line.displayText)
    if (startMs < 0 || endMs <= startMs || !displayText) {
      throw new VoxrailError('Voxrail 字幕行无效', 'invalid_transcript', 0)
    }
    const words = Array.isArray(line.words)
      ? line.words.map((rawWord, wordIndex): LX.Podcast.Word => {
          const word = record(rawWord)
          const startIndex = integer(word.startIndex)
          const length = integer(word.length)
          const wordStartMs = integer(word.startMs)
          const wordEndMs = integer(word.endMs)
          if (
            startIndex < 0 ||
            length <= 0 ||
            startIndex + length > displayText.length ||
            wordStartMs < startMs ||
            wordEndMs > endMs ||
            wordEndMs <= wordStartMs
          )
            throw new VoxrailError('Voxrail 字幕词级时间无效', 'invalid_transcript', 0)
          return {
            id: text(word.id) || `${episodeId}:line:${lineIndex}:word:${wordIndex}`,
            startIndex,
            length,
            startMs: wordStartMs,
            endMs: wordEndMs,
          }
        })
      : []
    const speakerId = text(line.speakerId)
    return {
      id: text(line.id) || `${episodeId}:line:${lineIndex}`,
      startMs,
      endMs,
      displayText,
      ...(speakerId ? { speakerId } : {}),
      words,
    }
  })
  const speakers = item.speakers.map((raw): LX.Podcast.Speaker => {
    const speaker = record(raw)
    const id = text(speaker.id)
    const name = text(speaker.name)
    const origin = speaker.origin
    if (!id || !name || !['publisher', 'local', 'ai', 'user'].includes(String(origin))) {
      throw new VoxrailError('Voxrail 说话人数据无效', 'invalid_transcript', 0)
    }
    return { id, name, origin: origin as LX.Podcast.Speaker['origin'] }
  })
  const remoteRevision = integer(item.revision)
  return {
    protocolVersion: 2,
    contentId: episodeId,
    revision: Math.max(minimumRevision + 1, remoteRevision > 0 ? remoteRevision : 1),
    state: state as LX.Podcast.TranscriptState,
    source: 'voxrail',
    language: text(item.language) || 'auto',
    isPartial: Boolean(item.isPartial),
    lines,
    speakers,
    ...(text(item.error) ? { error: text(item.error) } : {}),
  }
}

const decodeRequestResponse = (value: unknown): VoxrailRequestResponse => {
  const item = record(value)
  const status = text(item.status)
  if (
    !text(item.requestId) ||
    !['queued', 'running', 'completed', 'failed', 'cancelled'].includes(status)
  )
    throw new Error('invalid request response')
  const transcript = item.transcript == null ? undefined : decodeTranscriptPayload(item.transcript)
  const progress = item.progress == null ? undefined : decodeProgress(item.progress)
  return {
    requestId: text(item.requestId),
    status: status as VoxrailRequestStatus,
    cacheHit: Boolean(item.cacheHit),
    joined: Boolean(item.joined),
    pollUrl: text(item.pollUrl),
    createdAt: text(item.createdAt),
    completedAt: item.completedAt == null ? null : text(item.completedAt),
    warnings: stringArray(item.warnings),
    ...(progress ? { progress } : {}),
    ...(transcript ? { transcript } : {}),
  }
}

const decodeProgress = (value: unknown): VoxrailTranscriptionProgress => {
  const item = record(value)
  const stage = text(item.stage)
  if (![
    'downloading-media',
    'transcribing',
    'diarizing',
    'annotating-speakers',
    'publishing-final',
  ].includes(stage)) throw new Error('invalid transcription progress')
  return {
    stage: stage as VoxrailProgressStage,
    percent: nullableNumber(item.percent, 0, 100),
    processedSeconds: nullableNumber(item.processedSeconds, 0),
    totalSeconds: nullableNumber(item.totalSeconds, Number.MIN_VALUE),
  }
}

const decodeTranscriptPayload = (value: unknown): VoxrailTranscriptPayload => {
  const item = record(value)
  const kind = text(item.kind)
  if (!text(item.revisionId) || !['publisher', 'partial', 'final'].includes(kind)) {
    throw new Error('invalid transcript payload')
  }
  return {
    revisionId: text(item.revisionId),
    kind: kind as VoxrailTranscriptPayload['kind'],
    language: item.language == null ? null : text(item.language),
    content: item.content,
    plainText: item.plainText == null ? null : text(item.plainText),
    durationSeconds: item.durationSeconds == null ? null : integer(item.durationSeconds),
    warnings: stringArray(item.warnings),
    createdAt: text(item.createdAt),
  }
}

const decodeQuota = (value: unknown): VoxrailQuota => {
  const item = record(value)
  return {
    usedMinutes: integer(item.usedMinutes),
    reservedMinutes: integer(item.reservedMinutes),
    remainingMinutes: integer(item.remainingMinutes),
    concurrencyLimit: integer(item.concurrencyLimit),
    activeJobs: integer(item.activeJobs),
    expiresAt: text(item.expiresAt),
  }
}

const problemFrom = (value: unknown, status: number) => {
  const item = record(value)
  return new VoxrailError(
    text(item.detail) || `Voxrail 请求失败 (${status})`,
    text(item.code) || 'http_error',
    status,
    Number.isInteger(item.retryAfter) ? Number(item.retryAfter) : undefined
  )
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const integer = (value: unknown) => (Number.isSafeInteger(value) ? Number(value) : -1)
const nullableNumber = (value: unknown, minimum: number, maximum = Number.POSITIVE_INFINITY) => {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error('invalid number')
  }
  return value
}
const stringArray = (value: unknown) =>
  Array.isArray(value) ? value.map(text).filter(Boolean) : []
