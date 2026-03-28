import { net } from 'electron'
import { mainHandle } from '@common/mainIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { QMC2, detectAudioType, ready: cryptoReady } = require('@unlock-music/crypto')

const audioTypeToMime: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
}

// ============ 请求注册表 ============
interface PendingRequest {
  url: string
  ekey: string
}
const pendingRequests = new Map<string, PendingRequest>()
let tokenCounter = 0

const generateToken = (): string => `t${++tokenCounter}_${Date.now()}`

export const registerDecryptRequest = (url: string, ekey: string): string => {
  const token = generateToken()
  pendingRequests.set(token, { url, ekey })
  return token
}

// ============ 解密缓存 ============
interface CacheEntry {
  buffer: Uint8Array
  contentType: string
  timestamp: number
}
const decryptCache = new Map<string, CacheEntry>()
const CACHE_MAX_SIZE = 3
const CACHE_TTL = 10 * 60 * 1000

const cacheKey = (url: string, ekey: string) => `${url}__${ekey}`

const cleanCache = () => {
  const now = Date.now()
  for (const [key, entry] of decryptCache) {
    if (now - entry.timestamp > CACHE_TTL) decryptCache.delete(key)
  }
  while (decryptCache.size > CACHE_MAX_SIZE) {
    decryptCache.delete(decryptCache.keys().next().value!)
  }
}

const parseRange = (rangeHeader: string, total: number): { start: number; end: number } | null => {
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
  if (!match) return null
  const start = match[1] ? parseInt(match[1], 10) : 0
  const end = match[2] ? parseInt(match[2], 10) : total - 1
  if (start >= total || end >= total || start > end) return null
  return { start, end }
}

const detectContentType = (buffer: Uint8Array): string => {
  try {
    const header = buffer.subarray(0, Math.min(1024, buffer.length))
    const typeResult = detectAudioType(header)
    const ext = typeResult.audioType
    typeResult.free()
    if (ext && ext !== 'bin') return audioTypeToMime[ext] ?? `audio/${ext}`
  } catch {}
  return 'audio/mpeg'
}

/**
 * 全量下载+解密（用于 Range 请求 / 缓存命中）
 */
const decryptFull = async (musicUrl: string, ekey: string): Promise<CacheEntry> => {
  const key = cacheKey(musicUrl, ekey)
  const cached = decryptCache.get(key)
  if (cached) {
    cached.timestamp = Date.now()
    return cached
  }

  await cryptoReady

  const resp = await net.fetch(musicUrl)
  if (!resp.ok) throw new Error(`Upstream fetch failed: ${resp.status}`)

  const buffer = new Uint8Array(await resp.arrayBuffer())

  const qmc2 = new QMC2(ekey)
  try {
    for (let offset = 0; offset < buffer.length; offset += 4 * 1024 * 1024) {
      const end = Math.min(offset + 4 * 1024 * 1024, buffer.length)
      qmc2.decrypt(buffer.subarray(offset, end), offset)
    }
  } finally {
    qmc2.free()
  }

  const contentType = detectContentType(buffer)
  const entry: CacheEntry = { buffer, contentType, timestamp: Date.now() }
  cleanCache()
  decryptCache.set(key, entry)
  return entry
}

/**
 * 流式下载+解密，边收边解密边推给 <audio>，同时积攒完整 buffer 到缓存
 * 返回 { stream, contentType, contentLength }
 */
const decryptStreaming = (musicUrl: string, ekey: string): {
  stream: ReadableStream<Uint8Array>
  contentLengthPromise: Promise<number>
  contentTypePromise: Promise<string>
} => {
  const key = cacheKey(musicUrl, ekey)
  const chunks: Uint8Array[] = []
  let totalLength = 0
  let resolveContentLength: (n: number) => void
  let resolveContentType: (s: string) => void
  const contentLengthPromise = new Promise<number>((r) => { resolveContentLength = r })
  const contentTypePromise = new Promise<string>((r) => { resolveContentType = r })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await cryptoReady
        const resp = await net.fetch(musicUrl)
        if (!resp.ok) {
          controller.error(new Error(`Upstream fetch failed: ${resp.status}`))
          return
        }

        // 从 upstream Content-Length 拿总大小，让 <audio> 知道时长
        const cl = resp.headers.get('Content-Length')
        if (cl) resolveContentLength(parseInt(cl, 10))

        const qmc2 = new QMC2(ekey)
        const reader = resp.body!.getReader()
        let offset = 0
        let isFirstChunk = true

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            // in-place 解密当前 chunk
            qmc2.decrypt(value, offset)

            // 第一个 chunk 到达时检测音频格式
            if (isFirstChunk) {
              isFirstChunk = false
              resolveContentType(detectContentType(value))
            }

            // 推给 <audio>
            controller.enqueue(value)

            // 同时存起来给缓存
            chunks.push(value.slice())
            offset += value.length
          }
        } finally {
          qmc2.free()
        }

        // 完成后拼接完整 buffer 写入缓存
        totalLength = offset
        resolveContentLength(totalLength)
        const fullBuffer = new Uint8Array(totalLength)
        let pos = 0
        for (const chunk of chunks) {
          fullBuffer.set(chunk, pos)
          pos += chunk.length
        }
        const contentType = detectContentType(fullBuffer)
        resolveContentType(contentType)
        cleanCache()
        decryptCache.set(key, { buffer: fullBuffer, contentType, timestamp: Date.now() })

        controller.close()
      } catch (err: any) {
        resolveContentLength(0)
        resolveContentType('audio/mpeg')
        controller.error(err)
      }
    },
  })

  return { stream, contentLengthPromise, contentTypePromise }
}

// ============ 协议注册 ============

export const registerAudioProtocol = (ses: Electron.Session) => {
  ses.protocol.handle('lxmusic-audio', async (request) => {
    try {
      const parsed = new URL(request.url)
      const token = parsed.pathname.replace(/^\//, '')

      const pending = pendingRequests.get(token)
      if (!pending) {
        return new Response('Invalid or expired token', { status: 404 })
      }

      const { url: musicUrl, ekey } = pending
      const rangeHeader = request.headers.get('Range')
      const key = cacheKey(musicUrl, ekey)
      const cached = decryptCache.get(key)

      // ---- Range 请求（seek）：需要完整 buffer ----
      if (rangeHeader) {
        const entry = cached ?? await decryptFull(musicUrl, ekey)
        if (cached) cached.timestamp = Date.now()
        const total = entry.buffer.length
        const range = parseRange(rangeHeader, total)
        if (!range) {
          return new Response('Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${total}` },
          })
        }
        const { start, end } = range
        const sliced = entry.buffer.slice(start, end + 1)
        return new Response(sliced.buffer, {
          status: 206,
          headers: {
            'Content-Type': entry.contentType,
            'Content-Length': String(sliced.length),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
          },
        })
      }

      // ---- 已缓存：直接返回 ----
      if (cached) {
        cached.timestamp = Date.now()
        return new Response(cached.buffer.buffer, {
          status: 200,
          headers: {
            'Content-Type': cached.contentType,
            'Content-Length': String(cached.buffer.length),
            'Accept-Ranges': 'bytes',
          },
        })
      }

      // ---- 首次请求：流式解密，边下边播 ----
      const { stream, contentLengthPromise, contentTypePromise } = decryptStreaming(musicUrl, ekey)

      // 等第一个 chunk 到达以获取 contentType，contentLength 从 upstream header 拿
      const [contentLength, contentType] = await Promise.all([contentLengthPromise, contentTypePromise])

      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      }
      if (contentLength > 0) headers['Content-Length'] = String(contentLength)

      return new Response(stream, { status: 200, headers })
    } catch (err: any) {
      console.error('lxmusic-audio protocol error:', err)
      return new Response(err.message ?? 'Internal error', { status: 500 })
    }
  })
}

/**
 * 注册 IPC handler，renderer 调用获取 token
 */
export const registerAudioProtocolIpc = () => {
  mainHandle<{ url: string; ekey: string }, string>(
    WIN_MAIN_RENDERER_EVENT_NAME.register_decrypt_request,
    async ({ params: { url, ekey } }) => {
      return registerDecryptRequest(url, ekey)
    }
  )

  mainHandle<{ filePath: string; ekey: string }>(
    WIN_MAIN_RENDERER_EVENT_NAME.decrypt_file,
    async ({ params: { filePath, ekey } }) => {
      await cryptoReady
      const fs = require('fs') as typeof import('fs')
      const buffer = new Uint8Array(fs.readFileSync(filePath))

      const qmc2 = new QMC2(ekey)
      try {
        for (let offset = 0; offset < buffer.length; offset += 4 * 1024 * 1024) {
          const end = Math.min(offset + 4 * 1024 * 1024, buffer.length)
          qmc2.decrypt(buffer.subarray(offset, end), offset)
        }
      } finally {
        qmc2.free()
      }

      fs.writeFileSync(filePath, buffer)
    }
  )
}
