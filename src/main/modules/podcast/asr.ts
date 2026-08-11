import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readdirSync } from 'node:fs'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFile } from 'music-metadata'
import { parsePublisherTranscript } from './captions'
import {
  formatPodcastNetworkError,
  podcastFetch,
  type PodcastResponse,
} from './network'
import { PodcastStorage } from './storage'
import { simplifyAsrLine } from './simplifiedChinese'

interface ModelManifestEntry {
  preset: 'base' | 'small' | 'medium'
  file: string
  url: string
  sha256: string
}

export interface PodcastAsrProgress {
  modelState?: LX.Podcast.TranscriptionModelState
  stage?: LX.Podcast.TranscriptionStage
  progress?: number | null
  asrExecutor?: LX.Podcast.AsrExecutor
  asrExecutorFallbackReason?: string
  error?: string
}

export class PodcastAsrCancelledError extends Error {
  constructor() {
    super('播客转写已由用户中止')
    this.name = 'PodcastAsrCancelledError'
  }
}

export const isPodcastAsrCancelledError = (error: unknown) =>
  error instanceof PodcastAsrCancelledError

interface QueuedTask<T> {
  id: string
  order: number
  priority: () => number
  task: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

export class PriorityTaskQueue {
  private readonly tasks: QueuedTask<unknown>[] = []
  private running = false
  private order = 0

  enqueue<T>(id: string, priority: () => number, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.tasks.push({
        id,
        order: this.order++,
        priority,
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      void this.runNext()
    })
  }

  get pendingIds() {
    return this.tasks.map((task) => task.id)
  }

  cancelPending(prefix: string) {
    const cancelled = this.tasks.filter((task) => task.id.startsWith(prefix))
    if (!cancelled.length) return 0
    const error = new PodcastAsrCancelledError()
    for (const task of cancelled) {
      this.tasks.splice(this.tasks.indexOf(task), 1)
      task.reject(error)
    }
    return cancelled.length
  }

  private async runNext() {
    if (this.running) return
    const next = this.tasks
      .map((task) => ({ task, priority: task.priority() }))
      .sort((a, b) => a.priority - b.priority || a.task.order - b.task.order)[0]?.task
    if (!next) return
    this.tasks.splice(this.tasks.indexOf(next), 1)
    this.running = true
    try {
      next.resolve(await next.task())
    } catch (error) {
      next.reject(error)
    } finally {
      this.running = false
      void this.runNext()
    }
  }
}

export class SerialTaskQueue {
  private readonly queue = new PriorityTaskQueue()

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(`serial:${Date.now()}:${Math.random()}`, () => 0, task)
  }
}

export interface PodcastAsrSegment {
  index: number
  startMs: number
  endMs: number
  recognitionStartMs: number
  recognitionEndMs: number
}

export interface PreparedPodcastAudio {
  episode: LX.Podcast.Episode
  audioPath: string
  ffmpegPath: string
  jobDir: string
}

export interface PreparedPodcastAsr extends PreparedPodcastAudio {
  modelPath: string
  whisperPath: string
  language: string
  segments: PodcastAsrSegment[]
}

export const createWhisperArguments = (
  modelPath: string,
  wavPath: string,
  outputBase: string,
  language: string
) => [
  '-m', modelPath,
  '-f', wavPath,
  '-ojf',
  '-of', outputBase,
  '-l', language,
]

export const createAsrSegments = (
  durationMs: number,
  targetMs = 30_000,
  overlapMs = 2_000
): PodcastAsrSegment[] => {
  const safeDuration = Math.max(1, Math.round(durationMs))
  const count = Math.max(1, Math.ceil(safeDuration / targetMs))
  return Array.from({ length: count }, (_, index) => {
    const startMs = index * targetMs
    const endMs = Math.min(safeDuration, (index + 1) * targetMs)
    return {
      index,
      startMs,
      endMs,
      recognitionStartMs: Math.max(0, startMs - overlapMs),
      recognitionEndMs: Math.min(safeDuration, endMs + overlapMs),
    }
  })
}

export class PodcastAsr {
  constructor(private readonly storage: PodcastStorage) {}

  async prepare(
    episode: LX.Podcast.Episode,
    onProgress?: (progress: PodcastAsrProgress) => void,
    signal?: AbortSignal
  ): Promise<PreparedPodcastAsr> {
    const update = (progress: PodcastAsrProgress) => onProgress?.(progress)
    const preparedAudio = await this.prepareAudio(episode, onProgress, signal)
    update({ stage: 'preparing-model', modelState: 'checking', progress: null })
    let modelPath: string
    try {
      modelPath = await this.ensureModel(global.lx.appSetting['podcast.asrModel'], update, signal)
    } catch (error) {
      if (isPodcastAsrCancelledError(error) || signal?.aborted) {
        throw new PodcastAsrCancelledError()
      }
      update({ modelState: 'error' })
      throw error
    }
    throwIfCancelled(signal)
    const binaryDir = resolvePodcastAsrBinaryDir(
      global.staticPath,
      process.resourcesPath,
      process.env.NODE_ENV === 'production'
    )
    const whisperPath = path.join(binaryDir, 'whisper-cli.exe')
    await requireFile(whisperPath, 'whisper.cpp sidecar')
    const metadata = await parseFile(preparedAudio.audioPath, { duration: true }).catch(() => null)
    const durationSeconds = metadata?.format.duration || episode.durationSeconds
    if (!durationSeconds || !Number.isFinite(durationSeconds)) {
      throw new Error('无法确定播客音频时长')
    }
    return {
      ...preparedAudio,
      modelPath,
      whisperPath,
      language: global.lx.appSetting['podcast.asrLanguage'],
      segments: createAsrSegments(durationSeconds * 1_000),
    }
  }

  async prepareAudio(
    episode: LX.Podcast.Episode,
    onProgress?: (progress: PodcastAsrProgress) => void,
    signal?: AbortSignal
  ): Promise<PreparedPodcastAudio> {
    throwIfCancelled(signal)
    onProgress?.({ stage: 'downloading-audio', progress: null })
    let audioPath: string
    try {
      audioPath = await this.storage.downloadEpisode(episode, 'cache', signal)
    } catch (error) {
      if (signal?.aborted) throw new PodcastAsrCancelledError()
      throw error
    }
    throwIfCancelled(signal)
    const binaryDir = resolvePodcastAsrBinaryDir(
      global.staticPath,
      process.resourcesPath,
      process.env.NODE_ENV === 'production'
    )
    const ffmpegPath = path.join(binaryDir, 'ffmpeg.exe')
    await requireFile(ffmpegPath, 'FFmpeg sidecar')
    const jobDir = path.join(global.lx.appSetting['podcast.cachePath'], 'jobs', episode.id)
    await mkdir(jobDir, { recursive: true })
    return { episode, audioPath, ffmpegPath, jobDir }
  }

  async transcribeSegment(
    prepared: PreparedPodcastAsr,
    segment: PodcastAsrSegment,
    onProgress?: (progress: PodcastAsrProgress) => void,
    signal?: AbortSignal
  ): Promise<LX.Podcast.TranscriptLine[]> {
    throwIfCancelled(signal)
    const baseName = `segment-${String(segment.index).padStart(5, '0')}`
    const wavPath = path.join(prepared.jobDir, `${baseName}.wav`)
    const outputBase = path.join(prepared.jobDir, baseName)
    const durationMs = segment.recognitionEndMs - segment.recognitionStartMs
    onProgress?.({ stage: 'converting-audio', progress: null })
    await runProcess(prepared.ffmpegPath, [
      '-y',
      '-ss',
      (segment.recognitionStartMs / 1_000).toFixed(3),
      '-i',
      prepared.audioPath,
      '-t',
      (durationMs / 1_000).toFixed(3),
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      wavPath,
    ], signal)
    const args = createWhisperArguments(
      prepared.modelPath,
      wavPath,
      outputBase,
      prepared.language
    )
    const gpuRequested = global.lx.appSetting['podcast.asrVulkan']
    let backendLog = ''
    let reportedBackend: LX.Podcast.AsrExecutor | undefined
    const reportBackend = (chunk: string) => {
      backendLog = `${backendLog}${chunk}`.slice(-32_000)
      const executor = detectWhisperBackend(backendLog)
      if (!executor || executor === reportedBackend) return
      reportedBackend = executor
      onProgress?.({
        stage: 'recognizing',
        modelState: 'ready',
        progress: null,
        asrExecutor: executor,
        asrExecutorFallbackReason: gpuRequested && executor === 'cpu'
          ? cudaFallbackReason()
          : undefined,
      })
    }
    try {
      onProgress?.({ stage: 'recognizing', modelState: 'ready', progress: null })
      const result = await runProcess(
        prepared.whisperPath,
        gpuRequested ? args : [...args, '-ng'],
        signal,
        {
          env: createWhisperProcessEnv(),
          onStderr: reportBackend,
        }
      )
      const executor = detectWhisperBackend(result.stderr) ?? reportedBackend ?? 'cpu'
      onProgress?.({
        stage: 'recognizing',
        modelState: 'ready',
        progress: null,
        asrExecutor: executor,
        asrExecutorFallbackReason: gpuRequested && executor === 'cpu'
          ? cudaFallbackReason()
          : undefined,
      })
    } catch (error) {
      if (isPodcastAsrCancelledError(error) || signal?.aborted) {
        throw new PodcastAsrCancelledError()
      }
      if (!gpuRequested) throw error
      onProgress?.({
        stage: 'recognizing',
        modelState: 'ready',
        progress: null,
        asrExecutor: 'cpu',
        asrExecutorFallbackReason: `CUDA GPU 启动失败，已回退 CPU：${processErrorSummary(error)}`,
      })
      await runProcess(prepared.whisperPath, [...args, '-ng'], signal, {
        env: createWhisperProcessEnv(),
      })
    } finally {
      await unlink(wavPath).catch(() => undefined)
    }
    const parsed = parsePublisherTranscript(
      prepared.episode.id,
      await readFile(`${outputBase}.json`, 'utf8'),
      'application/json',
      prepared.language
    )
    await unlink(`${outputBase}.json`).catch(() => undefined)
    return parsed.lines
      .map((line) => offsetLine(line, segment.recognitionStartMs))
      .filter((line) => {
        const midpoint = line.startMs + (line.endMs - line.startMs) / 2
        return midpoint >= segment.startMs && midpoint < segment.endMs
      })
      .map((line, lineIndex) => ({
        ...line,
        id: `${prepared.episode.id}:segment-${segment.index}:line-${lineIndex}`,
        words: line.words.map((word, wordIndex) => ({
          ...word,
          id: `${prepared.episode.id}:segment-${segment.index}:line-${lineIndex}:word-${wordIndex}`,
        })),
      }))
      .map(simplifyAsrLine)
  }

  async transcribe(
    episode: LX.Podcast.Episode,
    onProgress?: (progress: PodcastAsrProgress) => void,
    signal?: AbortSignal
  ): Promise<LX.Podcast.TranscriptSnapshot> {
    const update = (progress: PodcastAsrProgress) => onProgress?.(progress)

    try {
      const prepared = await this.prepare(episode, update, signal)
      const lines: LX.Podcast.TranscriptLine[] = []
      for (const segment of prepared.segments) {
        lines.push(...await this.transcribeSegment(prepared, segment, update, signal))
      }
      update({ stage: 'saving', progress: null })
      return {
        protocolVersion: 2,
        contentId: episode.id,
        revision: prepared.segments.length + 1,
        state: 'ready',
        source: 'asr',
        language: prepared.language,
        isPartial: false,
        lines,
        speakers: [],
      }
    } catch (error) {
      if (isPodcastAsrCancelledError(error) || signal?.aborted) {
        throw new PodcastAsrCancelledError()
      }
      update({
        stage: 'failed',
        progress: null,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private async ensureModel(
    preset: ModelManifestEntry['preset'],
    onProgress?: (progress: PodcastAsrProgress) => void,
    signal?: AbortSignal
  ) {
    throwIfCancelled(signal)
    const manifestPath = path.join(global.staticPath, 'podcast', 'model-manifest.json')
    await requireFile(manifestPath, 'whisper.cpp model manifest')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ModelManifestEntry[]
    const entry = manifest.find((item) => item.preset === preset)
    if (!entry || !/^[a-f0-9]{64}$/i.test(entry.sha256)) throw new Error(`模型清单缺少 ${preset} 校验值`)
    const modelDir = path.join(global.lx.appSetting['podcast.cachePath'], 'models')
    const modelPath = path.join(modelDir, path.basename(entry.file))
    await mkdir(modelDir, { recursive: true })
    if ((await exists(modelPath)) && (await digest(modelPath)) === entry.sha256.toLowerCase()) {
      onProgress?.({ modelState: 'ready', stage: 'preparing-model', progress: 1 })
      return modelPath
    }

    onProgress?.({ modelState: 'downloading', stage: 'preparing-model', progress: 0 })
    let response
    try {
      response = await podcastFetch(entry.url, { redirect: 'follow', signal })
    } catch (error) {
      if (signal?.aborted) throw new PodcastAsrCancelledError()
      throw new Error(`模型下载连接失败：${formatPodcastNetworkError(error)}`)
    }
    if (!response.ok) throw new Error(`模型下载失败 (${response.status})`)
    const data = response.body
      ? await readResponseBody(response, (progress) => onProgress?.({ progress }), signal)
      : Buffer.from(await response.arrayBuffer())
    throwIfCancelled(signal)
    if (createHash('sha256').update(data).digest('hex') !== entry.sha256.toLowerCase()) {
      throw new Error('模型校验失败')
    }
    const partial = `${modelPath}.part`
    await writeFile(partial, data)
    await rename(partial, modelPath)
    onProgress?.({ modelState: 'ready', stage: 'preparing-model', progress: 1 })
    return modelPath
  }
}

const offsetLine = (
  line: LX.Podcast.TranscriptLine,
  offsetMs: number
): LX.Podcast.TranscriptLine => ({
  ...line,
  startMs: line.startMs + offsetMs,
  endMs: line.endMs + offsetMs,
  words: line.words.map((word) => ({
    ...word,
    startMs: word.startMs + offsetMs,
    endMs: word.endMs + offsetMs,
  })),
})

export const resolvePodcastAsrBinaryDir = (
  staticPath: string,
  resourcesPath: string,
  isProduction: boolean
) =>
  isProduction
    ? path.join(resourcesPath, 'podcast', 'whisper')
    : path.join(staticPath, 'podcast', 'whisper')

export interface ProcessResult {
  stderr: string
}

export interface RunProcessOptions {
  env?: NodeJS.ProcessEnv
  onStderr?: (chunk: string) => void
}

export const detectWhisperBackend = (output: string): LX.Podcast.AsrExecutor | undefined => {
  if (/using CUDA\d+ backend|CUDA\d+ total size/i.test(output)) return 'cuda'
  if (/using Vulkan\d* backend|Vulkan\d* total size/i.test(output)) return 'vulkan'
  if (/use gpu\s*=\s*0/i.test(output)) return 'cpu'
  return undefined
}

export const createWhisperProcessEnv = (
  env: NodeJS.ProcessEnv = process.env,
  cudaBinPaths: string[] = discoverCudaRuntimeBins(env)
): NodeJS.ProcessEnv => {
  if (!cudaBinPaths.length) return { ...env }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  return {
    ...env,
    [pathKey]: [...cudaBinPaths, env[pathKey] ?? ''].filter(Boolean).join(path.delimiter),
  }
}

export const runProcess = (
  command: string,
  args: string[],
  signal?: AbortSignal,
  options: RunProcessOptions = {}
) =>
  new Promise<ProcessResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PodcastAsrCancelledError())
      return
    }
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: options.env,
    })
    let errorText = ''
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => {
      child.kill()
    }
    signal?.addEventListener('abort', abort, { once: true })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      errorText = `${errorText}${text}`.slice(-64_000)
      options.onStderr?.(text)
    })
    child.once('error', (error) => finish(() =>
      reject(signal?.aborted ? new PodcastAsrCancelledError() : error)
    ))
    child.once('exit', (code) => finish(() => {
      if (signal?.aborted) {
        reject(new PodcastAsrCancelledError())
        return
      }
      code === 0
        ? resolve({ stderr: errorText })
        : reject(new Error(`${path.basename(command)} 退出码 ${code}: ${errorText.slice(-4_000)}`))
    }))
  })

export const discoverCudaRuntimeBins = (env: NodeJS.ProcessEnv) => {
  const roots = Object.entries(env)
    .filter(([key, value]) => /^CUDA_PATH(?:_V\d+_\d+)?$/i.test(key) && value)
    .sort(([left], [right]) => {
      if (/^CUDA_PATH$/i.test(left)) return -1
      if (/^CUDA_PATH$/i.test(right)) return 1
      return right.localeCompare(left, undefined, { numeric: true })
    })
    .map(([, value]) => value!)
  const toolkitRoot = path.join(
    env.ProgramFiles ?? 'C:\\Program Files',
    'NVIDIA GPU Computing Toolkit',
    'CUDA'
  )
  if (existsSync(toolkitRoot)) {
    try {
      roots.push(...readdirSync(toolkitRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(toolkitRoot, entry.name))
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true })))
    } catch {
      // An inaccessible toolkit directory is equivalent to CUDA not being installed.
    }
  }
  return [...new Set(roots.map((root) => path.join(root, 'bin')))]
    .filter((binPath) => existsSync(binPath))
}

const cudaFallbackReason = () =>
  'CUDA GPU 未加载，已回退 CPU（请在“计算后端”中查看运行库或兼容性）'

const processErrorSummary = (error: unknown) => {
  const value = error instanceof Error ? error.message : String(error)
  return value.replace(/\s+/g, ' ').slice(-240)
}

const exists = async (value: string) => access(value).then(() => true).catch(() => false)
const requireFile = async (value: string, name: string) => {
  if (!(await exists(value))) throw new Error(`${name} 未打包，无法启动本地识别`)
}
const digest = async (filePath: string) => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

const readResponseBody = async (
  response: PodcastResponse,
  onProgress: (progress: number | null) => void,
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
    onProgress(Number.isFinite(total) && total > 0 ? Math.min(1, received / total) : null)
  }
  return Buffer.concat(chunks)
}

const throwIfCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new PodcastAsrCancelledError()
}
