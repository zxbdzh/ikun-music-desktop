/**
 * 听歌识曲核心模块
 * 使用网易云音乐官方 WASM 指纹算法
 *
 * 静态文件: src/static/audio_match/
 *   - afp.js: 指纹算法入口 (WASM加载 + GenerateFP导出)
 *   - afp.wasm.js: 编译后的 WASM 二进制 (base64格式)
 */
export type AudioSource = 'microphone' | 'system'
export type MatchStatus = 'idle' | 'listening' | 'matching' | 'matched' | 'error'

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
  duration: number       // 当前录制时长(秒)
  error: string | null
  result: AudioMatchResult | null
}

type StateChangeCallback = (state: AudioMatchState) => void

let state: AudioMatchState = {
  status: 'idle',
  audioSource: 'microphone',
  duration: 0,
  error: null,
  result: null,
}

const listeners: Set<StateChangeCallback> = new Set()

const updateState = (partial: Partial<AudioMatchState>) => {
  state = { ...state, ...partial }
  listeners.forEach(cb => cb(state))
}

// ============ WASM 模块加载 ============

let generateFP: ((samples: Float32Array) => Promise<string>) | null = null

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`加载失败: ${src}`))
    document.head.appendChild(s)
  })

const loadWasmModule = async (): Promise<(samples: Float32Array) => Promise<string>> => {
  if (generateFP) return generateFP

  // 通过动态 script 标签加载，就像 demo 那样
  await Promise.all([
    loadScript('/static/audio_match/afp.wasm.js'),
    loadScript('/static/audio_match/afp.js'),
  ])

  const gf = (window as any).GenerateFP
  if (typeof gf !== 'function') {
    console.error('[AudioMatch] GenerateFP 不可用，window.Keys:', Object.keys(window).filter(k => k.toLowerCase().includes('fp')))
    throw new Error('GenerateFP 不可用')
  }

  console.log('[AudioMatch] GenerateFP 加载成功')

  generateFP = (samples: Float32Array): Promise<string> => {
    return (window as any).GenerateFP(samples)
  }

  return generateFP
}

// ============ 音频采集 ============

const SAMPLE_RATE = 8000
const RECORD_SECONDS = 3

let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let scriptNode: ScriptProcessorNode | null = null
let audioChunks: Float32Array[] = []
let autoStopTimer: ReturnType<typeof setTimeout> | null = null

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
  }
  return audioContext
}

const startMicrophoneCapture = async (): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({
    audio: {
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
  try {
    const { DESKTOP_CAPTURER_EVENT_NAME } = await import('@common/ipcNames')
    const { rendererInvoke } = await import('@common/rendererIpc')

    const sources = await rendererInvoke<
      { types: string[]; fetchDesktopAudio: boolean },
      { id: string; name: string }[]
    >(DESKTOP_CAPTURER_EVENT_NAME.get_sources, {
      types: ['screen'],
      fetchDesktopAudio: true,
    })

    const screenSource = sources[0]
    if (!screenSource) {
      throw new Error('未找到可用的系统音频源')
    }

    // @ts-ignore - Electron 特有的约束
    return (navigator.mediaDevices.getUserMedia as any)({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id,
        },
      },
    })
  } catch (e: any) {
    if (e.message?.includes('No handler registered')) {
      console.warn('[AudioMatch] 系统音频捕获不可用，切换到麦克风')
      return startMicrophoneCapture()
    }
    throw e
  }
}

const startCapture = async (source: AudioSource): Promise<MediaStream> => {
  if (source === 'system') {
    return startSystemCapture()
  }
  return startMicrophoneCapture()
}

const setupAudioProcessing = (stream: MediaStream) => {
  const ctx = getAudioContext()
  const sourceNode = ctx.createMediaStreamSource(stream)
  scriptNode = ctx.createScriptProcessor(4096, 1, 1)
  sourceNode.connect(scriptNode)
  scriptNode.connect(ctx.destination)

  audioChunks = []
  scriptNode.onaudioprocess = (e) => {
    if (state.status !== 'listening') return
    const channelData = e.inputBuffer.getChannelData(0)
    audioChunks.push(new Float32Array(channelData))

    // 计算当前采样数估算时长
    let totalSamples = 0
    for (const chunk of audioChunks) {
      totalSamples += chunk.length
    }
    const currentSec = Math.floor(totalSamples / SAMPLE_RATE)
    updateState({ duration: currentSec })
  }

  // 3 秒自动停止
  autoStopTimer = setTimeout(() => {
    if (state.status === 'listening') {
      stopListening()
    }
  }, RECORD_SECONDS * 1000)
}

const stopCapture = () => {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer)
    autoStopTimer = null
  }
  if (scriptNode) {
    scriptNode.disconnect()
    scriptNode = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop())
    mediaStream = null
  }
}

// ============ API 调用 ============

const concatFloat32Arrays = (arrays: Float32Array[]): Float32Array => {
  let total = 0
  arrays.forEach(a => total += a.length)
  const result = new Float32Array(total)
  let offset = 0
  arrays.forEach(a => {
    result.set(a, offset)
    offset += a.length
  })
  return result
}

const callMatchApi = async (samples: Float32Array, duration: number): Promise<AudioMatchResult | null> => {
  const apiBase = 'https://music.zxbdwy.online'

  // 加载 WASM 模块并生成指纹
  const fpFunc = await loadWasmModule()
  const audioFP = await fpFunc(samples)

  console.log('[AudioMatch] 生成指纹:', audioFP.substring(0, 50) + '...')

  const response = await fetch(`${apiBase}/audio/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: duration.toString(), audioFP }),
  })
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  const data = await response.json()
  console.log('[AudioMatch] API response:', data)

  if (!data.data?.result?.length) return null
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

export const startListening = async (source: AudioSource): Promise<void> => {
  try {
    stopCapture()
    updateState({ status: 'listening', audioSource: source, duration: 0, error: null, result: null })

    mediaStream = await startCapture(source)
    setupAudioProcessing(mediaStream)
  } catch (e: any) {
    console.error('[AudioMatch] startListening error:', e)
    updateState({
      status: 'error',
      error: e.message?.includes('denied') || e.message?.includes('Permission')
        ? '麦克风权限被拒绝，请在系统设置中允许访问'
        : e.message || '启动失败',
    })
  }
}

export const stopListening = async (): Promise<AudioMatchResult | null> => {
  if (state.status !== 'listening') return null

  const duration = state.duration
  stopCapture()
  updateState({ status: 'matching' })

  try {
    const samples = concatFloat32Arrays(audioChunks)
    if (samples.length === 0) {
      throw new Error('未采集到音频数据')
    }

    const result = await callMatchApi(samples, duration)
    if (result) {
      updateState({ status: 'matched', result })
      return result
    } else {
      updateState({ status: 'idle', error: '未识别到歌曲，请重试' })
      return null
    }
  } catch (e: any) {
    console.error('[AudioMatch] match error:', e)
    updateState({ status: 'error', error: e.message || '识别失败' })
    return null
  }
}

export const reset = () => {
  stopCapture()
  updateState({ status: 'idle', duration: 0, error: null, result: null })
}

export const getState = (): AudioMatchState => state

export const onStateChange = (cb: StateChangeCallback): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
