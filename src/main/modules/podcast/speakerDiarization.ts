import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import { formatPodcastNetworkError, podcastFetch, type PodcastResponse } from './network'
import type { PreparedPodcastAudio } from './asr'
import { hasSherpaDirectMlProvider } from './computeBackends'

const MODEL_VERSION = 'sherpa-onnx-1.13.4'
const SEGMENTATION_ARCHIVE = {
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2',
  sha256: '24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488',
}
const SEGMENTATION_MODEL_SHA256 = '220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079'
const EMBEDDING_MODEL = {
  file: '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
  sha256: '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b',
}

export interface SpeakerDiarizationProgress {
  stage?: LX.Podcast.TranscriptionStage
  modelState?: LX.Podcast.TranscriptionModelState
  progress?: number | null
  executor?: LX.Podcast.TranscriptionExecutor
  executorFallbackReason?: string
  speakerCount?: number
}

export interface SpeakerDiarizationSegment {
  start: number
  end: number
  speaker: number
}

export interface SpeakerDiarizationResult {
  segments: SpeakerDiarizationSegment[]
  executor: LX.Podcast.TranscriptionExecutor
  executorFallbackReason?: string
}

export class PodcastSpeakerDiarization {
  async diarize(
    prepared: PreparedPodcastAudio,
    onProgress?: (progress: SpeakerDiarizationProgress) => void,
    signal?: AbortSignal,
    expectedSpeakerCount?: number
  ): Promise<SpeakerDiarizationResult> {
    throwIfCancelled(signal)
    onProgress?.({ stage: 'preparing-speaker-model', modelState: 'checking', progress: null })
    const models = await this.ensureModels(onProgress, signal)
    throwIfCancelled(signal)

    const wavPath = path.join(prepared.jobDir, 'speaker-diarization.wav')
    await runExternalProcess(prepared.ffmpegPath, [
      '-y',
      '-i', prepared.audioPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      wavPath,
    ], signal)

    const directMlAvailable = hasSherpaDirectMlProvider()
    const requestedExecutor = directMlAvailable ? 'directml' : 'cpu'
    let actualExecutor: 'directml' | 'cpu' = requestedExecutor
    let fallbackReason = directMlAvailable
      ? undefined
      : process.platform === 'win32'
        ? '当前 sherpa-onnx 预编译版本未启用 DirectML，已使用 CPU 进行说话人分离'
        : '当前平台不支持 DirectML'

    try {
      const run = (provider: 'directml' | 'cpu') => runDiarizationWorker({
          wavPath,
          segmentationModelPath: models.segmentationModelPath,
          embeddingModelPath: models.embeddingModelPath,
          provider,
          expectedSpeakerCount,
          signal,
          onProgress: (progress) => onProgress?.({
            stage: 'diarizing',
            progress,
            executor: provider,
            executorFallbackReason: fallbackReason,
          }),
        })
      let segments: SpeakerDiarizationSegment[]
      try {
        segments = await run(requestedExecutor)
      } catch (error) {
        if (signal?.aborted || requestedExecutor === 'cpu') throw error
        actualExecutor = 'cpu'
        fallbackReason = `DirectML 初始化失败，已回退 CPU：${
          error instanceof Error ? error.message : String(error)
        }`
        segments = await run('cpu')
      }
      const speakerCount = new Set(segments.map((segment) => segment.speaker)).size
      onProgress?.({
        stage: 'diarizing',
        progress: 1,
        executor: actualExecutor,
        executorFallbackReason: fallbackReason,
        speakerCount,
      })
      return {
        segments,
        executor: actualExecutor,
        executorFallbackReason: fallbackReason,
      }
    } finally {
      await rm(wavPath, { force: true }).catch(() => undefined)
    }
  }

  private async ensureModels(
    onProgress?: (progress: SpeakerDiarizationProgress) => void,
    signal?: AbortSignal
  ) {
    const root = path.join(
      global.lx.appSetting['podcast.cachePath'],
      'models',
      'speaker-diarization',
      MODEL_VERSION
    )
    const segmentationDir = path.join(root, 'segmentation')
    const segmentationModelPath = path.join(segmentationDir, 'model.onnx')
    const embeddingModelPath = path.join(root, EMBEDDING_MODEL.file)
    await mkdir(root, { recursive: true })

    if (!(await isVerified(segmentationModelPath, SEGMENTATION_MODEL_SHA256))) {
      onProgress?.({ stage: 'preparing-speaker-model', modelState: 'downloading', progress: 0 })
      const archivePath = path.join(root, 'segmentation.tar.bz2')
      await downloadVerified(
        SEGMENTATION_ARCHIVE.url,
        SEGMENTATION_ARCHIVE.sha256,
        archivePath,
        (progress) => onProgress?.({
          stage: 'preparing-speaker-model',
          modelState: 'downloading',
          progress,
        }),
        signal
      )
      const extractionDir = path.join(root, `.extract-${Date.now()}`)
      try {
        await mkdir(extractionDir, { recursive: true })
        await runExternalProcess(process.platform === 'win32' ? 'tar.exe' : 'tar', [
          '-xf', archivePath,
          '-C', extractionDir,
        ], signal)
        const extracted = path.join(
          extractionDir,
          'sherpa-onnx-pyannote-segmentation-3-0',
          'model.onnx'
        )
        if (!(await isVerified(extracted, SEGMENTATION_MODEL_SHA256))) {
          throw new Error('说话人分割模型校验失败')
        }
        await mkdir(segmentationDir, { recursive: true })
        await cp(extracted, segmentationModelPath, { force: true })
      } finally {
        await rm(extractionDir, { recursive: true, force: true }).catch(() => undefined)
      }
    }

    if (!(await isVerified(embeddingModelPath, EMBEDDING_MODEL.sha256))) {
      onProgress?.({ stage: 'preparing-speaker-model', modelState: 'downloading', progress: 0 })
      await downloadVerified(
        EMBEDDING_MODEL.url,
        EMBEDDING_MODEL.sha256,
        embeddingModelPath,
        (progress) => onProgress?.({
          stage: 'preparing-speaker-model',
          modelState: 'downloading',
          progress,
        }),
        signal
      )
    }
    onProgress?.({ stage: 'preparing-speaker-model', modelState: 'ready', progress: 1 })
    return { segmentationModelPath, embeddingModelPath }
  }
}

const runDiarizationWorker = ({
  wavPath,
  segmentationModelPath,
  embeddingModelPath,
  provider,
  expectedSpeakerCount,
  signal,
  onProgress,
}: {
  wavPath: string
  segmentationModelPath: string
  embeddingModelPath: string
  provider: 'directml' | 'cpu'
  expectedSpeakerCount?: number
  signal?: AbortSignal
  onProgress?: (progress: number | null) => void
}) => new Promise<SpeakerDiarizationSegment[]>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new Error('播客转写已由用户中止'))
    return
  }
  let worker: UtilityProcess
  try {
    worker = utilityProcess.fork(
      path.join(__dirname, 'podcastSpeakerWorker.js'),
      [],
      { serviceName: 'podcast-speaker-diarization' }
    )
  } catch (error) {
    reject(error)
    return
  }
  let settled = false
  const finish = (callback: () => void, kill = true) => {
    if (settled) return
    settled = true
    signal?.removeEventListener('abort', abort)
    if (kill) {
      try {
        worker.kill()
      } catch {}
    }
    callback()
  }
  const abort = () => finish(() => reject(new Error('播客转写已由用户中止')))
  signal?.addEventListener('abort', abort, { once: true })
  worker.on('message', (message: {
    type: 'progress' | 'result' | 'error'
    progress?: number | null
    segments?: SpeakerDiarizationSegment[]
    error?: string
  }) => {
    if (message.type === 'progress') onProgress?.(message.progress ?? null)
    else if (message.type === 'result') finish(() => resolve(message.segments ?? []))
    else finish(() => reject(new Error(message.error || '说话人分离失败')))
  })
  worker.once('error', (type, location) => finish(() => reject(
    new Error(`说话人分离子进程异常 (${type})${location ? `：${location}` : ''}`)
  )))
  worker.once('exit', (code) => finish(() => reject(
    new Error(`说话人分离子进程提前退出 (${code})`)
  ), false))
  try {
    worker.postMessage({
      wavPath,
      segmentationModelPath,
      embeddingModelPath,
      provider,
      expectedSpeakerCount,
    })
  } catch (error) {
    finish(() => reject(error))
  }
})

const downloadVerified = async (
  url: string,
  expectedSha256: string,
  targetPath: string,
  onProgress?: (progress: number | null) => void,
  signal?: AbortSignal
) => {
  throwIfCancelled(signal)
  if (await isVerified(targetPath, expectedSha256)) return
  let response: PodcastResponse
  try {
    response = await podcastFetch(url, { redirect: 'follow', signal })
  } catch (error) {
    if (signal?.aborted) throw new Error('播客转写已由用户中止')
    throw new Error(`模型下载连接失败：${formatPodcastNetworkError(error)}`)
  }
  if (!response.ok) throw new Error(`模型下载失败 (${response.status})`)
  const data = response.body
    ? await readResponseBody(response, onProgress, signal)
    : Buffer.from(await response.arrayBuffer())
  throwIfCancelled(signal)
  const actualSha256 = createHash('sha256').update(data).digest('hex')
  if (actualSha256 !== expectedSha256) throw new Error('模型下载校验失败')
  await mkdir(path.dirname(targetPath), { recursive: true })
  const partialPath = `${targetPath}.part`
  await writeFile(partialPath, data)
  await rename(partialPath, targetPath)
}

const readResponseBody = async (
  response: PodcastResponse,
  onProgress?: (progress: number | null) => void,
  signal?: AbortSignal
) => {
  if (!response.body) return Buffer.from(await response.arrayBuffer())
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  const total = Number(response.headers.get('content-length'))
  let received = 0
  while (true) {
    throwIfCancelled(signal)
    const { done, value } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    chunks.push(chunk)
    received += chunk.length
    onProgress?.(Number.isFinite(total) && total > 0 ? Math.min(1, received / total) : null)
  }
  return Buffer.concat(chunks)
}

const isVerified = async (filePath: string, expectedSha256: string) => {
  try {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
    return hash.digest('hex') === expectedSha256
  } catch {
    return false
  }
}

const runExternalProcess = (command: string, args: string[], signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('播客转写已由用户中止'))
      return
    }
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let errorText = ''
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { errorText = `${errorText}${chunk}`.slice(-4000) })
    child.once('error', (error) => finish(() => reject(error)))
    child.once('exit', (code) => finish(() => {
      if (signal?.aborted) reject(new Error('播客转写已由用户中止'))
      else if (code === 0) resolve()
      else reject(new Error(`${path.basename(command)} 退出码 ${code}: ${errorText}`))
    }))
  })

const throwIfCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('播客转写已由用户中止')
}
