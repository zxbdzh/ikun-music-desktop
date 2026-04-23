/**
 * 听歌识曲核心模块
 * 使用网易云音乐官方 WASM 指纹算法
 *
 * 静态文件: src/static/audio_match/
 *   - afp.js: 指纹算法入口 (WASM加载 + GenerateFP导出)
 *   - afp.wasm.js: 编译后的 WASM 二进制 (base64格式)
 */
export type AudioSource = 'microphone' | 'system'
export type MatchStatus = 'idle' | 'listening' | 'recorded' | 'matching' | 'matched' | 'error' | 'no_match'

export interface AudioMatchResult {
  name: string
  artist: string
  album?: string
  duration?: number
  musicId?: string | number
  source?: string
}

export interface AudioMatchState {
  status: MatchStatus
  audioSource: AudioSource
  deviceId: string
  duration: number       // 当前录制时长(秒)
  error: string | null
  result: AudioMatchResult | null
}

export interface AudioDevice {
  deviceId: string
  label: string
}

type StateChangeCallback = (state: AudioMatchState) => void

let state: AudioMatchState = {
  status: 'idle',
  audioSource: 'microphone',
  deviceId: 'default',
  duration: 0,
  error: null,
  result: null,
}

const listeners: Set<StateChangeCallback> = new Set()

const updateState = (partial: Partial<AudioMatchState>) => {
  state = { ...state, ...partial }
  listeners.forEach(cb => cb(state))
}

// ============ 设备枚举 ============

export const getAudioDevices = async (): Promise<AudioDevice[]> => {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter(d => d.kind === 'audioinput')
    .map(d => ({
      deviceId: d.deviceId,
      label: d.label || `麦克风 ${d.deviceId.substring(0, 8)}`,
    }))
}

// ============ WASM 模块加载 ============

let generateFP: ((samples: Float32Array) => Promise<string>) | null = null
let isWasmLoading = false

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    // 检查脚本是否已存在，如果存在则先移除（解决刷新后脚本缓存问题）
    const existingScript = document.querySelector(`script[src="${src}"]`)
    if (existingScript) {
      existingScript.remove()
    }

    const s = document.createElement('script')
    // 添加时间戳 cache busting，确保每次加载最新脚本
    s.src = src + '?t=' + Date.now()
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`加载失败: ${src}`))
    document.head.appendChild(s)
  })

const loadWasmModule = async (): Promise<(samples: Float32Array) => Promise<string>> => {
  // 如果已经有 generateFP，直接返回复用
  if (generateFP) return generateFP

  // 如果 window.GenerateFP 已存在且可用，直接使用
  const existingGF = (window as any)?.GenerateFP
  if (typeof existingGF === 'function') {
    console.log('[AudioMatch] 复用已存在的 GenerateFP')
    generateFP = (samples: Float32Array): Promise<string> => {
      console.log('[AudioMatch] 调用 GenerateFP，输入采样数:', samples.length, '前10个样本:', Array.from(samples.slice(0, 10)).join(','))
      return (window as any).GenerateFP(samples)
    }
    return generateFP
  }

  // 防止并发加载
  if (isWasmLoading) {
    while (isWasmLoading) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (generateFP) return generateFP
  }

  isWasmLoading = true
  try {
    // 清理可能存在的旧脚本
    document.querySelectorAll('script[src*="afp"]').forEach(s => s.remove())
    // 清除 generateFP 缓存
    generateFP = null

    // 通过动态 script 标签加载
    await Promise.all([
      loadScript('/static/audio_match/afp.wasm.js'),
      loadScript('/static/audio_match/afp.js'),
    ])

    const gf = (window as any).GenerateFP
    if (typeof gf !== 'function') {
      console.error('[AudioMatch] GenerateFP 不可用')
      throw new Error('GenerateFP 不可用')
    }

    console.log('[AudioMatch] GenerateFP 加载成功')

    generateFP = (samples: Float32Array): Promise<string> => {
      console.log('[AudioMatch] 调用 GenerateFP，输入采样数:', samples.length, '前10个样本:', Array.from(samples.slice(0, 10)).join(','))
      return (window as any).GenerateFP(samples)
    }

    return generateFP
  } finally {
    isWasmLoading = false
  }
}

// ============ 音频采集 ============
// 使用 MediaRecorder 方案解决 Electron chromeMediaSource IPC error 263 问题
// MediaRecorder 通过 Blob 异步获取数据，绕过 ScriptProcessorNode 的 IPC 同步访问限制

const SAMPLE_RATE = 8000
const RECORD_SECONDS = 3

let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let recordedBlob: Blob | null = null
let audioChunks: Float32Array[] = []
let autoStopTimer: ReturnType<typeof setTimeout> | null = null
let durationInterval: ReturnType<typeof setInterval> | null = null

const getAudioContext = (): AudioContext => {
  // 每次都创建新的 AudioContext，避免状态残留
  if (audioContext) {
    audioContext.close().catch(() => {})
  }
  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
  return audioContext
}

const startMicrophoneCapture = async (deviceId: string = 'default'): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}),
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // @ts-ignore
      latency: 0,
    },
  })
}

const startSystemCapture = async (): Promise<MediaStream> => {
  console.log('[AudioMatch] 使用 getDisplayMedia 获取系统音频')

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true, // Electron 会通过 setDisplayMediaRequestHandler 处理
    } as DisplayMediaStreamOptions)

    const audioTracks = stream.getAudioTracks()
    if (!audioTracks.length) {
      console.warn('[AudioMatch] 未获得音频轨道')
    } else {
      console.log('[AudioMatch] 系统音频轨道:', audioTracks[0].label)
    }

    // 检查音频轨道设置
    const settings = audioTracks[0]?.getSettings()
    console.log('[AudioMatch] 音频轨道设置:', settings)

    // 停止视频轨道
    stream.getVideoTracks().forEach(t => {
      console.log('[AudioMatch] 停止视频轨道:', t.label)
      t.stop()
    })

    return stream
  } catch (e: any) {
    console.error('[AudioMatch] getDisplayMedia error:', e.name, e.message)
    throw e
  }
}

const startCapture = async (source: AudioSource, deviceId: string): Promise<MediaStream> => {
  if (source === 'system') {
    return startSystemCapture()
  }
  return startMicrophoneCapture(deviceId)
}

// 用于在 onstop 完成时 resolve 的变量
let stopResolve: (() => void) | null = null

// 当前录音 session ID，用于追踪有效录音
let currentRecordingId: number = 0

const setupAudioProcessing = (stream: MediaStream): Promise<void> => {
  // 使用 MediaRecorder 方案，绕过 ScriptProcessorNode 的 IPC 问题
  const audioTrack = stream.getAudioTracks()[0]
  if (!audioTrack) {
    console.error('[AudioMatch] 未获取到音频轨道')
    updateState({ status: 'error', error: '未获取到音频轨道，请确保系统音频权限已开启' })
    return Promise.reject(new Error('未获取到音频轨道'))
  }

  const trackSettings = audioTrack.getSettings()
  console.log('[AudioMatch] MediaRecorder 方案 - 采样率:', trackSettings.sampleRate)

  // 录音数据块
  const chunks: Blob[] = []

  // 确定可用的 MIME 类型
  const mimeType = MediaRecorder.isTypeSupported('audio/webm')
    ? 'audio/webm'
    : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/webm'

  mediaRecorder = new MediaRecorder(stream, { mimeType })

  // 当前录音 session ID，只有匹配的 onstop 才能设置 recordedBlob
  const recordingId = ++currentRecordingId

  // 创建一个 Promise，当 onstop 被调用时 resolve
  const stopPromise = new Promise<void>((resolve) => {
    stopResolve = resolve
  })

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data)
    }
  }

  mediaRecorder.onstop = () => {
    // 检查是否是当前有效的 recording
    if (recordingId !== currentRecordingId) {
      console.log('[AudioMatch] 跳过过期的 onstop 回调, id:', recordingId, '当前:', currentRecordingId)
      return
    }
    recordedBlob = new Blob(chunks, { type: mimeType })
    console.log('[AudioMatch] 录音完成，Blob 大小:', recordedBlob.size, '数据块数量:', chunks.length, 'recordingId:', recordingId)
    // 清理 chunks
    chunks.length = 0
    // resolve Promise 表示停止完成
    if (stopResolve) {
      stopResolve()
      stopResolve = null
    }
  }

  // 开始录音
  mediaRecorder.start(100) // 每 100ms 触发一次 ondataavailable
  console.log('[AudioMatch] MediaRecorder 开始录音')

  // 更新录音时长
  let recordedDuration = 0
  durationInterval = setInterval(() => {
    if (state.status === 'listening') {
      recordedDuration += 0.1
      updateState({ duration: Math.floor(recordedDuration) })
    }
  }, 100)

  // 3 秒自动停止
  autoStopTimer = setTimeout(() => {
    if (state.status === 'listening') {
      stopListening()
    }
  }, RECORD_SECONDS * 1000)

  // 返回 Promise，允许调用者等待 onstop 完成
  return stopPromise
}

const stopCapture = (): Promise<void> => {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer)
    autoStopTimer = null
  }
  if (durationInterval) {
    clearInterval(durationInterval)
    durationInterval = null
  }

  // 如果有正在进行的录音，先请求剩余数据
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      // 强制触发 ondataavailable 来收集剩余数据
      mediaRecorder.requestData()
    } catch (e) {
      // requestData 在某些情况下可能失败，忽略
    }
    mediaRecorder.stop()
  }

  const recorder = mediaRecorder
  mediaRecorder = null

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop())
    mediaStream = null
  }

  // 如果有 stopResolve（来自当前 MediaRecorder），等待它被调用
  if (stopResolve && recorder) {
    // stopResolve 会在 onstop 被调用时触发
    // 这里返回一个已经 resolve 的 Promise，因为 onstop 会在 stop() 后被调用
    return new Promise((resolve) => {
      // 如果 stopResolve 还存在，设置它为 resolve
      const originalResolve = stopResolve!
      stopResolve = () => {
        originalResolve()
        resolve()
      }
      // 如果 MediaRecorder 已经处于 inactive 状态，stopResolve 可能已经被调用
      // 这种情况下，直接 resolve
      if (recorder.state === 'inactive') {
        resolve()
      }
    })
  }

  return Promise.resolve()
}

// ============ API 调用 ============

// Blob 转 Float32Array（用于 MediaRecorder 方案）
const decodeBlobToFloat32Array = async (blob: Blob): Promise<Float32Array> => {
  const ctx = getAudioContext()
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

  // 获取音频数据并重采样到 8000Hz（如需要）
  const rawData = audioBuffer.getChannelData(0)
  const originalSampleRate = audioBuffer.sampleRate

  console.log('[AudioMatch] 解码音频，原始采样率:', originalSampleRate, '目标采样率:', SAMPLE_RATE)

  // 如果采样率不匹配，需要重采样
  let resampledData: Float32Array
  if (originalSampleRate === SAMPLE_RATE) {
    resampledData = new Float32Array(rawData)
  } else {
    // 简单重采样：每 N 个样本取 1 个（N = 原始采样率 / 目标采样率）
    const ratio = originalSampleRate / SAMPLE_RATE
    const newLength = Math.floor(rawData.length / ratio)
    resampledData = new Float32Array(newLength)
    for (let i = 0; i < newLength; i++) {
      resampledData[i] = rawData[Math.floor(i * ratio)]
    }
  }

  return resampledData
}

const callMatchApi = async (samples: Float32Array, duration: number): Promise<AudioMatchResult | null> => {
  const apiBase = 'https://music.zxbdwy.online'

  // 加载 WASM 模块并生成指纹
  const fpFunc = await loadWasmModule()
  const audioFP = await fpFunc(samples)

  console.log('[AudioMatch] 生成指纹:', audioFP.substring(0, 50) + '...')

  // 使用 GET 请求避免后端 POST 缓存问题
  const response = await fetch(`${apiBase}/audio/match?duration=${duration}&audioFP=${encodeURIComponent(audioFP)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  const data = await response.json()
  console.log('[AudioMatch] API response:', data)

  // 未识别到歌曲
  if (!data.data?.result?.length) {
    const reason = data.data?.noMatchReason
    console.log('[AudioMatch] 未识别到歌曲, noMatchReason:', reason)
    return null
  }
  const top = data.data.result[0]
  return {
    name: top.song?.name || '',
    artist: top.song?.artists?.map((a: any) => a.name).join(', ') || '',
    album: top.song?.album?.name,
    duration: top.startTime ? top.startTime / 1000 : undefined,
    musicId: top.song?.id,
    source: '163',
  }
}

// ============ 公开 API ============

export const startListening = async (source: AudioSource, deviceId: string = 'default'): Promise<void> => {
  try {
    // 先停止旧录音并等待其完全结束
    await stopCapture()
    // 重置回放状态
    audioBuffer = null
    recordedBlob = null
    audioChunks = []
    // 递增 recordingId 使旧的 onstop 回调失效
    currentRecordingId++
    updateState({ status: 'listening', audioSource: source, deviceId, duration: 0, error: null, result: null })

    mediaStream = await startCapture(source, deviceId)
    setupAudioProcessing(mediaStream)
  } catch (e: any) {
    console.error('[AudioMatch] startListening error:', e)
    let errorMsg = '启动失败'
    if (e.name === 'NotSupportedError') {
      errorMsg = '系统音频捕获不支持，请使用麦克风输入'
    } else if (e.message?.includes('denied') || e.message?.includes('Permission')) {
      errorMsg = '权限被拒绝，请在系统设置中允许访问'
    }
    updateState({ status: 'error', error: errorMsg })
  }
}

export const stopListening = async (): Promise<AudioMatchResult | null> => {
  if (state.status !== 'listening') return null

  const duration = state.duration
  // 等待 stopCapture 完成（包括等待 onstop 被调用）
  await stopCapture()

  // recordedBlob 已在 stopCapture 时被 mediaRecorder.onstop 设置
  if (recordedBlob && recordedBlob.size > 0) {
    try {
      // 解码 Blob 用于回放
      const ctx = getAudioContext()
      const arrayBuffer = await recordedBlob.arrayBuffer()
      audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      console.log('[AudioMatch] 已保存录音用于回放，时长:', audioBuffer.duration, '秒')
    } catch (err) {
      console.error('[AudioMatch] 保存录音失败:', err)
      audioBuffer = null
    }
  } else {
    audioBuffer = null
  }

  updateState({ status: 'recorded' })

  return null
}

export const submitMatch = async (): Promise<AudioMatchResult | null> => {
  if (state.status !== 'recorded') return null

  const duration = state.duration
  updateState({ status: 'matching' })

  try {
    if (!recordedBlob || recordedBlob.size === 0) {
      throw new Error('未采集到音频数据')
    }

    // 解码 Blob 为 Float32Array
    const samples = await decodeBlobToFloat32Array(recordedBlob)
    console.log('[AudioMatch] 解码后采样数:', samples.length)

    const result = await callMatchApi(samples, duration)
    if (result) {
      updateState({ status: 'matched', result })
      return result
    } else {
      updateState({ status: 'no_match', error: '未识别到歌曲，请确保播放的音乐足够清晰' })
      return null
    }
  } catch (e: any) {
    console.error('[AudioMatch] match error:', e)
    updateState({ status: 'error', error: e.message || '识别失败' })
    return null
  }
}

// ============ 录音回放 ============

let audioBuffer: AudioBuffer | null = null

export const getRecordedAudioBuffer = (): AudioBuffer | null => audioBuffer

export const playRecordedAudio = async (): Promise<void> => {
  if (!audioBuffer || !audioContext) {
    throw new Error('无录音数据')
  }

  // 确保 AudioContext 处于运行状态
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  const source = audioContext.createBufferSource()
  source.buffer = audioBuffer
  source.connect(audioContext.destination)
  source.start(0)
}

export const stopRecordedAudio = (): void => {
  if (!audioContext) return
  audioContext.suspend()
}

export const reset = () => {
  stopCapture()
  audioBuffer = null
  recordedBlob = null
  audioChunks = []
  updateState({ status: 'idle', duration: 0, error: null, result: null })
}

// 重置 WASM 模块（解决多次识别间状态污染问题）
export const resetWasmModule = () => {
  generateFP = null
  // 清除可能残留的脚本
  document.querySelectorAll('script[src*="afp"]').forEach(s => s.remove())
  // 设置为 undefined 而不是 delete（window 属性在某些环境不可删除）
  ;(window as any).GenerateFP = undefined
  console.log('[AudioMatch] WASM 模块已重置')
}

export const getState = (): AudioMatchState => state

export const onStateChange = (cb: StateChangeCallback): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// ============ 播放识别结果 ============

// 动态导入 music SDK 避免循环依赖
const getMusicSdk = async () => {
  const wy = await import('@renderer/utils/musicSdk/wy/index').then(m => m.default)
  return wy
}

/**
 * 播放识别结果
 * 通过歌曲ID从网易云获取完整信息后播放
 */
export const playMatchResult = async (result: AudioMatchResult): Promise<void> => {
  if (!result.musicId || result.source !== '163') {
    console.warn('[AudioMatch] 播放失败：需要网易云音乐ID')
    throw new Error('播放失败：需要网易云音乐ID')
  }

  try {
    const wy = await getMusicSdk()

    // 通过歌曲ID获取详细信息
    const requestObj = wy.getMusicInfo(result.musicId)
    const songDetail: any = await requestObj.promise
    console.log('[AudioMatch] 获取歌曲详情:', songDetail.name)

    // 转换歌曲数据格式（使用与 WyCloud 相同的方式）
    const { toRaw } = await import('@common/utils/vueTools')
    const { markRaw, toRawDeep } = await import('@common/utils/vueTools')
    const { toNewMusicInfo } = await import('@common/utils/tools')
    const { setTempList } = await import('@renderer/store/list/action')
    const { playList } = await import('@renderer/core/player')
    const { LIST_IDS } = await import('@common/constants')

    // 构建原始歌曲数据（参考 WyCloud handlePlay）
    const rawSong = {
      id: songDetail.id,
      songmid: String(songDetail.id),
      name: songDetail.name || result.name,
      singer: (songDetail.ar || []).map((a: any) => a.name).join('、') || result.artist || '',
      source: 'wy',
      interval: songDetail.dt ? Math.floor(songDetail.dt / 1000).toString() : result.duration?.toString() || '',
      albumName: songDetail.al?.name || result.album || '',
      albumId: songDetail.al?.id || '',
      img: songDetail.al?.picUrl || '',
      types: [] as any[],
      _types: {} as Record<string, any>,
    }

    // 使用 toNewMusicInfo 转换为播放器格式
    const formattedSong = toNewMusicInfo(toRaw(rawSong)) as LX.Music.MusicInfoOnline

    // 使用 setTempList + playList 播放（与 WyCloud 相同方式）
    await setTempList('audio_match_result', [formattedSong])
    await playList(LIST_IDS.TEMP, 0)

    console.log('[AudioMatch] 已播放:', formattedSong.name)
  } catch (e: any) {
    console.error('[AudioMatch] 播放失败:', e)
    throw new Error('播放失败: ' + (e.message || '未知错误'))
  }
}
