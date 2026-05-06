interface HTMLAudioElementChrome extends HTMLAudioElement {
  setSinkId: (id: string) => Promise<void>
}
let audio: HTMLAudioElementChrome | null = null
let audio2: HTMLAudioElementChrome | null = null
let audioContext: AudioContext
let mediaSource: MediaElementAudioSourceNode
let analyser: AnalyserNode
// https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext
// https://benzleung.gitbooks.io/web-audio-api-mini-guide/content/chapter5-1.html
export const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
type Freqs = (typeof freqs)[number]
let biquads: Map<`hz${Freqs}`, BiquadFilterNode>
export const freqsPreset = [
  {
    name: 'pop',
    hz31: 6,
    hz62: 5,
    hz125: -3,
    hz250: -2,
    hz500: 5,
    hz1000: 4,
    hz2000: -4,
    hz4000: -3,
    hz8000: 6,
    hz16000: 4,
  },
  {
    name: 'dance',
    hz31: 4,
    hz62: 3,
    hz125: -4,
    hz250: -6,
    hz500: 0,
    hz1000: 0,
    hz2000: 3,
    hz4000: 4,
    hz8000: 4,
    hz16000: 5,
  },
  {
    name: 'rock',
    hz31: 7,
    hz62: 6,
    hz125: 2,
    hz250: 1,
    hz500: -3,
    hz1000: -4,
    hz2000: 2,
    hz4000: 1,
    hz8000: 4,
    hz16000: 5,
  },
  {
    name: 'classical',
    hz31: 6,
    hz62: 7,
    hz125: 1,
    hz250: 2,
    hz500: -1,
    hz1000: 1,
    hz2000: -4,
    hz4000: -6,
    hz8000: -7,
    hz16000: -8,
  },
  {
    name: 'vocal',
    hz31: -5,
    hz62: -6,
    hz125: -4,
    hz250: -3,
    hz500: 3,
    hz1000: 4,
    hz2000: 5,
    hz4000: 4,
    hz8000: -3,
    hz16000: -3,
  },
  {
    name: 'slow',
    hz31: 5,
    hz62: 4,
    hz125: 2,
    hz250: 0,
    hz500: -2,
    hz1000: 0,
    hz2000: 3,
    hz4000: 6,
    hz8000: 7,
    hz16000: 8,
  },
  {
    name: 'electronic',
    hz31: 6,
    hz62: 5,
    hz125: 0,
    hz250: -5,
    hz500: -4,
    hz1000: 0,
    hz2000: 6,
    hz4000: 8,
    hz8000: 8,
    hz16000: 7,
  },
  {
    name: 'subwoofer',
    hz31: 8,
    hz62: 7,
    hz125: 5,
    hz250: 4,
    hz500: 0,
    hz1000: 0,
    hz2000: 0,
    hz4000: 0,
    hz8000: 0,
    hz16000: 0,
  },
  {
    name: 'soft',
    hz31: -5,
    hz62: -5,
    hz125: -4,
    hz250: -4,
    hz500: 3,
    hz1000: 2,
    hz2000: 4,
    hz4000: 4,
    hz8000: 0,
    hz16000: 0,
  },
] as const
export const convolutions = [
  { name: 'telephone', mainGain: 0.0, sendGain: 3.0, source: 'filter-telephone.wav' }, // 电话
  { name: 's2_r4_bd', mainGain: 1.8, sendGain: 0.9, source: 's2_r4_bd.wav' }, // 教堂
  { name: 'bright_hall', mainGain: 0.8, sendGain: 2.4, source: 'bright-hall.wav' },
  { name: 'cinema_diningroom', mainGain: 0.6, sendGain: 2.3, source: 'cinema-diningroom.wav' },
  {
    name: 'dining_living_true_stereo',
    mainGain: 0.6,
    sendGain: 1.8,
    source: 'dining-living-true-stereo.wav',
  },
  {
    name: 'living_bedroom_leveled',
    mainGain: 0.6,
    sendGain: 2.1,
    source: 'living-bedroom-leveled.wav',
  },
  { name: 'spreader50_65ms', mainGain: 1, sendGain: 2.5, source: 'spreader50-65ms.wav' },
  // { name: 'spreader25_125ms', mainGain: 1, sendGain: 2.5, source: 'spreader25-125ms.wav' },
  // { name: 'backslap', mainGain: 1.8, sendGain: 0.8, source: 'backslap1.wav' },
  { name: 's3_r1_bd', mainGain: 1.8, sendGain: 0.8, source: 's3_r1_bd.wav' },
  { name: 'matrix_1', mainGain: 1.5, sendGain: 0.9, source: 'matrix-reverb1.wav' },
  { name: 'matrix_2', mainGain: 1.3, sendGain: 1, source: 'matrix-reverb2.wav' },
  {
    name: 'cardiod_35_10_spread',
    mainGain: 1.8,
    sendGain: 0.6,
    source: 'cardiod-35-10-spread.wav',
  },
  {
    name: 'tim_omni_35_10_magnetic',
    mainGain: 1,
    sendGain: 0.2,
    source: 'tim-omni-35-10-magnetic.wav',
  },
  // { name: 'spatialized', mainGain: 1.8, sendGain: 0.8, source: 'spatialized8.wav' },
  // { name: 'zing_long_stereo', mainGain: 0.8, sendGain: 1.8, source: 'zing-long-stereo.wav' },
  { name: 'feedback_spring', mainGain: 1.8, sendGain: 0.8, source: 'feedback-spring.wav' },
  // { name: 'tim_omni_rear_blend', mainGain: 1.8, sendGain: 0.8, source: 'tim-omni-rear-blend.wav' },
] as const
// 半音
// export const semitones = [-1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] as const

let convolver: ConvolverNode
let convolverSourceGainNode: GainNode
let convolverOutputGainNode: GainNode
let convolverDynamicsCompressor: DynamicsCompressorNode
let gainNode: GainNode
let panner: PannerNode
let pitchShifterNode: AudioWorkletNode
let pitchShifterNodePitchFactor: AudioParam | null
let pitchShifterNodeLoadStatus: 'none' | 'loading' | 'unconnect' | 'connected' = 'none'
let pitchShifterNodeTempValue = 1
let defaultChannelCount = 2
export const soundR = 0.5

// Crossfade support
let mediaSource2: MediaElementAudioSourceNode
let cfGainNode1: GainNode
let cfGainNode2: GainNode
let activeIndex: 1 | 2 = 1

export const getActiveAudio = (): HTMLAudioElementChrome | null => activeIndex === 1 ? audio : audio2
const getInactiveAudio = (): HTMLAudioElementChrome | null => activeIndex === 1 ? audio2 : audio

export const createAudio = () => {
  if (audio) return
  audio = new window.Audio() as HTMLAudioElementChrome
  audio.controls = false
  audio.autoplay = true
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'

  // Create second audio element for crossfade (actual creation, Web Audio nodes in initAdvancedAudioFeatures)
  audio2 = new window.Audio() as HTMLAudioElementChrome
  audio2.controls = false
  audio2.autoplay = true
  audio2.preload = 'auto'
  audio2.crossOrigin = 'anonymous'
}

const initAnalyser = () => {
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 256
}

const initBiquadFilter = () => {
  biquads = new Map()
  let i

  for (const item of freqs) {
    const filter = audioContext.createBiquadFilter()
    biquads.set(`hz${item}`, filter)
    filter.type = 'peaking'
    filter.frequency.value = item
    filter.Q.value = 1.4
    filter.gain.value = 0
  }

  for (i = 1; i < freqs.length; i++) {
    biquads.get(`hz${freqs[i - 1]}`)!.connect(biquads.get(`hz${freqs[i]}`)!)
  }
}

const initConvolver = () => {
  convolverSourceGainNode = audioContext.createGain()
  convolverOutputGainNode = audioContext.createGain()
  convolverDynamicsCompressor = audioContext.createDynamicsCompressor()
  convolver = audioContext.createConvolver()
  convolver.connect(convolverOutputGainNode)
  convolverSourceGainNode.connect(convolverDynamicsCompressor)
  convolverOutputGainNode.connect(convolverDynamicsCompressor)
}

const initPanner = () => {
  panner = audioContext.createPanner()
}

const initGain = () => {
  gainNode = audioContext.createGain()
}

export const initAdvancedAudioFeatures = () => {
  if (audioContext) return
  if (!audio) throw new Error('audio not defined')
  if (!audio2) throw new Error('audio2 not defined')
  audioContext = new window.AudioContext({ latencyHint: 'playback' })
  if (audioContext.state === 'suspended') void audioContext.resume()
  defaultChannelCount = audioContext.destination.channelCount

  initAnalyser()
  initBiquadFilter()
  initConvolver()
  initPanner()
  initGain()

  // Crossfade gain nodes
  cfGainNode1 = audioContext.createGain()
  cfGainNode2 = audioContext.createGain()
  cfGainNode1.gain.value = 1
  cfGainNode2.gain.value = 1

  // source1 -> cfGainNode1 -> analyser -> biquadFilter -> ... -> panner -> gain -> destination
  // source2 -> cfGainNode2 ─┘
  mediaSource = audioContext.createMediaElementSource(audio)
  mediaSource2 = audioContext.createMediaElementSource(audio2)
  mediaSource.connect(cfGainNode1)
  mediaSource2.connect(cfGainNode2)
  cfGainNode1.connect(analyser)
  cfGainNode2.connect(analyser)
  analyser.connect(biquads.get(`hz${freqs[0]}`)!)
  const lastBiquadFilter = biquads.get(`hz${freqs.at(-1)!}`)!
  lastBiquadFilter.connect(convolverSourceGainNode)
  lastBiquadFilter.connect(convolver)
  convolverDynamicsCompressor.connect(panner)
  panner.connect(gainNode)
  gainNode.connect(audioContext.destination)

  // 音频输出设备改变时刷新 audio node 连接
  window.app_event.on('playerDeviceChanged', handleMediaListChange)

  // audio.addEventListener('playing', connectAudioNode)
  // audio.addEventListener('pause', disconnectAudioNode)
  // audio.addEventListener('waiting', disconnectAudioNode)
  // audio.addEventListener('emptied', disconnectAudioNode)
  // if (!audio.paused) connectAudioNode()
}

const handleMediaListChange = () => {
  mediaSource.disconnect()
  mediaSource.connect(cfGainNode1)
  mediaSource2.disconnect()
  mediaSource2.connect(cfGainNode2)
}

// let isConnected = true
// const connectAudioNode = () => {
//   if (isConnected) return
//   console.log('connect Node')
//   mediaSource.connect(analyser)
//   isConnected = true
//   if (pitchShifterNodeTempValue == 1 && pitchShifterNodeLoadStatus == 'connected') {
//     disconnectPitchShifterNode()
//   }
// }

// const disconnectAudioNode = () => {
//   if (!isConnected) return
//   console.log('disconnect Node')
//   mediaSource.disconnect()
//   isConnected = false
//   if (pitchShifterNodeTempValue == 1 && pitchShifterNodeLoadStatus == 'connected') {
//     disconnectPitchShifterNode()
//   }
// }

export const getAudioContext = () => {
  initAdvancedAudioFeatures()
  return audioContext
}

// Export audioContext directly for crossfade gain animation
export const getAudioContextInstance = () => audioContext

let unsubMediaListChangeEvent: (() => void) | null = null
export const setMaxOutputChannelCount = (enable: boolean) => {
  if (enable) {
    initAdvancedAudioFeatures()
    audioContext.destination.channelCountMode = 'max'
    audioContext.destination.channelCount = audioContext.destination.maxChannelCount
    // navigator.mediaDevices.addEventListener('devicechange', handleMediaListChange)
    if (!unsubMediaListChangeEvent) {
      let handleMediaListChange = () => {
        setMaxOutputChannelCount(true)
      }
      window.app_event.on('playerDeviceChanged', handleMediaListChange)
      unsubMediaListChangeEvent = () => {
        window.app_event.off('playerDeviceChanged', handleMediaListChange)
        unsubMediaListChangeEvent = null
      }
    }
  } else {
    unsubMediaListChangeEvent?.()
    if (audioContext && audioContext.destination.channelCountMode != 'explicit') {
      audioContext.destination.channelCount = defaultChannelCount
      // audioContext.destination.channelInterpretation
      audioContext.destination.channelCountMode = 'explicit'
    }
  }
}

export const getAnalyser = (): AnalyserNode | null => {
  initAdvancedAudioFeatures()
  return analyser
}

export const getBiquadFilter = () => {
  initAdvancedAudioFeatures()
  return biquads
}

// let isConvolverConnected = false
export const setConvolver = (buffer: AudioBuffer | null, mainGain: number, sendGain: number) => {
  initAdvancedAudioFeatures()
  convolver.buffer = buffer
  // console.log(mainGain, sendGain)
  if (buffer) {
    convolverSourceGainNode.gain.value = mainGain
    convolverOutputGainNode.gain.value = sendGain
  } else {
    convolverSourceGainNode.gain.value = 1
    convolverOutputGainNode.gain.value = 0
  }
}

export const setConvolverMainGain = (gain: number) => {
  if (convolverSourceGainNode.gain.value == gain) return
  // console.log(gain)
  convolverSourceGainNode.gain.value = gain
}

export const setConvolverSendGain = (gain: number) => {
  if (convolverOutputGainNode.gain.value == gain) return
  // console.log(gain)
  convolverOutputGainNode.gain.value = gain
}

let pannerInfo = {
  x: 0,
  y: 0,
  z: 0,
  soundR: 0.5,
  rad: 0,
  speed: 1,
  intv: null as NodeJS.Timeout | null,
}
const setPannerXYZ = (nx: number, ny: number, nz: number) => {
  pannerInfo.x = nx
  pannerInfo.y = ny
  pannerInfo.z = nz
  // console.log(pannerInfo)
  panner.positionX.value = nx * pannerInfo.soundR
  panner.positionY.value = ny * pannerInfo.soundR
  panner.positionZ.value = nz * pannerInfo.soundR
}
export const setPannerSoundR = (r: number) => {
  pannerInfo.soundR = r
}

export const setPannerSpeed = (speed: number) => {
  pannerInfo.speed = speed
  if (pannerInfo.intv) startPanner()
}
export const stopPanner = () => {
  if (pannerInfo.intv) {
    clearInterval(pannerInfo.intv)
    pannerInfo.intv = null
    pannerInfo.rad = 0
  }
  panner.positionX.value = 0
  panner.positionY.value = 0
  panner.positionZ.value = 0
}

export const startPanner = () => {
  initAdvancedAudioFeatures()
  if (pannerInfo.intv) {
    clearInterval(pannerInfo.intv)
    pannerInfo.intv = null
    pannerInfo.rad = 0
  }
  pannerInfo.intv = setInterval(() => {
    pannerInfo.rad += 1
    if (pannerInfo.rad > 360) pannerInfo.rad -= 360
    setPannerXYZ(
      Math.sin((pannerInfo.rad * Math.PI) / 180),
      Math.cos((pannerInfo.rad * Math.PI) / 180),
      Math.cos((pannerInfo.rad * Math.PI) / 180)
    )
  }, pannerInfo.speed * 10)
}

let isConnected = true
const connectNode = () => {
  if (isConnected) return
  console.log('connect Node')
  analyser?.connect(biquads.get(`hz${freqs[0]}`)!)
  isConnected = true
  if (pitchShifterNodeTempValue == 1 && pitchShifterNodeLoadStatus == 'connected') {
    disconnectPitchShifterNode()
  }
}
const disconnectNode = () => {
  if (!isConnected) return
  console.log('disconnect Node')
  analyser?.disconnect()
  isConnected = false
  if (pitchShifterNodeTempValue == 1 && pitchShifterNodeLoadStatus == 'connected') {
    disconnectPitchShifterNode()
  }
}
const connectPitchShifterNode = () => {
  console.log('connect Pitch Shifter Node')
  audio!.addEventListener('playing', connectNode)
  audio!.addEventListener('pause', disconnectNode)
  audio!.addEventListener('waiting', disconnectNode)
  audio!.addEventListener('emptied', disconnectNode)
  if (audio!.paused) disconnectNode()

  const lastBiquadFilter = biquads.get(`hz${freqs.at(-1)!}`)!
  lastBiquadFilter.disconnect()
  lastBiquadFilter.connect(pitchShifterNode)

  pitchShifterNode.connect(convolver)
  pitchShifterNode.connect(convolverSourceGainNode)
  // convolverDynamicsCompressor.disconnect(panner)
  // convolverDynamicsCompressor.connect(pitchShifterNode)
  // pitchShifterNode.connect(panner)
  pitchShifterNodeLoadStatus = 'connected'
  pitchShifterNodePitchFactor!.value = pitchShifterNodeTempValue
}
const disconnectPitchShifterNode = () => {
  console.log('disconnect Pitch Shifter Node')
  const lastBiquadFilter = biquads.get(`hz${freqs.at(-1)!}`)!
  lastBiquadFilter.disconnect()
  lastBiquadFilter.connect(convolver)
  lastBiquadFilter.connect(convolverSourceGainNode)
  pitchShifterNodeLoadStatus = 'unconnect'
  pitchShifterNodePitchFactor = null

  audio!.removeEventListener('playing', connectNode)
  audio!.removeEventListener('pause', disconnectNode)
  audio!.removeEventListener('waiting', disconnectNode)
  audio!.removeEventListener('emptied', disconnectNode)
  connectNode()
}
const loadPitchShifterNode = () => {
  pitchShifterNodeLoadStatus = 'loading'
  initAdvancedAudioFeatures()
  // source -> analyser -> biquadFilter -> audioWorklet(pitch shifter) -> [(convolver & convolverSource)->convolverDynamicsCompressor] -> panner -> gain
  void audioContext.audioWorklet
    .addModule(
      new URL(
        /* webpackChunkName: 'pitch_shifter.audioWorklet' */
        './pitch-shifter/phase-vocoder.js',
        import.meta.url
      )
    )
    .then(() => {
      console.log('pitch shifter audio worklet loaded')
      // https://github.com/olvb/phaze/issues/26#issuecomment-1574629971
      pitchShifterNode = new AudioWorkletNode(audioContext, 'phase-vocoder-processor', {
        outputChannelCount: [2],
      })
      let pitchFactorParam = pitchShifterNode.parameters.get('pitchFactor')
      if (!pitchFactorParam) return
      pitchShifterNodePitchFactor = pitchFactorParam
      pitchShifterNodeLoadStatus = 'unconnect'
      if (pitchShifterNodeTempValue == 1) return

      connectPitchShifterNode()
    })
}

export const setPitchShifter = (val: number) => {
  // console.log('setPitchShifter', val)
  pitchShifterNodeTempValue = val
  switch (pitchShifterNodeLoadStatus) {
    case 'loading':
      break
    case 'none':
      loadPitchShifterNode()
      break
    case 'connected':
      // a: 1 = 半音
      // value = 2 ** (a / 12)
      pitchShifterNodePitchFactor!.value = val
      break
    case 'unconnect':
      connectPitchShifterNode()
      break
  }
}

export const hasInitedAdvancedAudioFeatures = (): boolean => audioContext != null

export const setResource = (src: string) => {
  const a = getActiveAudio()
  if (a) a.src = src
}

export const setPlay = () => {
  void getActiveAudio()?.play()
}

export const setPause = () => {
  getActiveAudio()?.pause()
}

export const setStop = () => {
  const a = getActiveAudio()
  if (a) {
    a.src = ''
    a.removeAttribute('src')
  }
}

export const isEmpty = (): boolean => !getActiveAudio()?.src

export const setLoopPlay = (isLoop: boolean) => {
  const a = getActiveAudio()
  if (a) a.loop = isLoop
}

export const getPlaybackRate = (): number => {
  return getActiveAudio()?.defaultPlaybackRate ?? 1
}

export const setPlaybackRate = (rate: number) => {
  const a = getActiveAudio()
  if (!a) return
  a.defaultPlaybackRate = rate
  a.playbackRate = rate
}

export const setPreservesPitch = (preservesPitch: boolean) => {
  const a = getActiveAudio()
  if (!a) return
  a.preservesPitch = preservesPitch
}

export const getMute = (): boolean => {
  return getActiveAudio()?.muted ?? false
}

export const setMute = (isMute: boolean) => {
  const a = getActiveAudio()
  if (a) a.muted = isMute
}

export const getCurrentTime = () => {
  return getActiveAudio()?.currentTime || 0
}

export const setCurrentTime = (time: number) => {
  const a = getActiveAudio()
  if (a) a.currentTime = time
}

export const setMediaDeviceId = async (mediaDeviceId: string): Promise<void> => {
  const a = getActiveAudio()
  if (!a) return
  return a.setSinkId(mediaDeviceId)
}

export const setVolume = (volume: number) => {
  if (audio) audio.volume = volume
  if (audio2) audio2.volume = volume
}

export const getDuration = () => {
  return getActiveAudio()?.duration || 0
}

// export const getPlaybackRate = () => {
//   return audio?.playbackRate ?? 1
// }

type Noop = () => void

const registerDualListener = (eventName: string, callback: Noop): (() => void) => {
  if (!audio) throw new Error('audio not defined')
  if (!audio2) {
    audio.addEventListener(eventName, callback)
    return () => { audio?.removeEventListener(eventName, callback) }
  }
  const h1 = () => { if (activeIndex === 1) callback() }
  const h2 = () => { if (activeIndex === 2) callback() }
  audio.addEventListener(eventName, h1)
  audio2.addEventListener(eventName, h2)
  return () => {
    audio?.removeEventListener(eventName, h1)
    audio2?.removeEventListener(eventName, h2)
  }
}

export const onPlaying = (callback: Noop) => registerDualListener('playing', callback)

export const onPause = (callback: Noop) => registerDualListener('pause', callback)

export const onEnded = (callback: Noop) => registerDualListener('ended', callback)

export const onError = (callback: Noop) => registerDualListener('error', callback)

export const onLoadeddata = (callback: Noop) => registerDualListener('loadeddata', callback)

export const onLoadstart = (callback: Noop) => registerDualListener('loadstart', callback)

export const onCanplay = (callback: Noop) => registerDualListener('canplay', callback)

export const onEmptied = (callback: Noop) => registerDualListener('emptied', callback)

export const onTimeupdate = (callback: Noop) => registerDualListener('timeupdate', callback)

// 缓冲中
export const onWaiting = (callback: Noop) => registerDualListener('waiting', callback)

// 可见性改变
export const onVisibilityChange = (callback: Noop) => {
  document.addEventListener('visibilitychange', callback)
  return () => {
    document.removeEventListener('visibilitychange', callback)
  }
}

export const getErrorCode = () => {
  return getActiveAudio()?.error?.code
}

// ===== Crossfade / Secondary Audio Element API =====

export const setResourceSecondary = (src: string) => {
  const a = getInactiveAudio()
  if (a) a.src = src
}

export const playSecondary = () => {
  void getInactiveAudio()?.play()
}

export const pauseSecondary = () => {
  getInactiveAudio()?.pause()
}

export const stopSecondary = () => {
  const a = getInactiveAudio()
  if (a) {
    a.pause()
    a.src = ''
    a.removeAttribute('src')
  }
}

export const setVolumeSecondary = (vol: number) => {
  const a = getInactiveAudio()
  if (a) a.volume = vol
}

export const setCrossfadeGain1 = (val: number) => {
  if (cfGainNode1) cfGainNode1.gain.setValueAtTime(val, audioContext.currentTime)
}

export const setCrossfadeGain2 = (val: number) => {
  if (cfGainNode2) cfGainNode2.gain.setValueAtTime(val, audioContext.currentTime)
}

export const rampCrossfadeGain1 = (val: number, endTime: number) => {
  if (cfGainNode1) cfGainNode1.gain.linearRampToValueAtTime(val, endTime)
}

export const rampCrossfadeGain2 = (val: number, endTime: number) => {
  if (cfGainNode2) cfGainNode2.gain.linearRampToValueAtTime(val, endTime)
}

export const swapActiveAudio = () => {
  const oldActive = getActiveAudio()
  const newActive = getInactiveAudio()
  activeIndex = activeIndex === 1 ? 2 : 1
  // Prevent momentary volume spike: set old to 0 before pause
  if (oldActive === audio && cfGainNode1) cfGainNode1.gain.setValueAtTime(0, audioContext.currentTime)
  if (oldActive === audio2 && cfGainNode2) cfGainNode2.gain.setValueAtTime(0, audioContext.currentTime)
  oldActive?.pause()
  // Reset both to 1 for new active (new song should be at full volume)
  if (cfGainNode1) cfGainNode1.gain.setValueAtTime(1, audioContext.currentTime)
  if (cfGainNode2) cfGainNode2.gain.setValueAtTime(1, audioContext.currentTime)

  // Manually trigger playing event for the new active audio
  // This is needed because the new audio was already playing (we called playSecondary)
  // but the swap operation caused oldActive.pause() which triggered onPause
  // The new audio won't fire 'playing' again since it's already playing
  if (newActive && !newActive.paused) {
    newActive.dispatchEvent(new Event('playing'))
  }
}

export const resetCrossfadeGains = () => {
  if (cfGainNode1) cfGainNode1.gain.setValueAtTime(1, audioContext.currentTime)
  if (cfGainNode2) cfGainNode2.gain.setValueAtTime(1, audioContext.currentTime)
}

// Get gain node for the currently active audio (based on activeIndex)
const getCurrentGainNode = (): GainNode | null => {
  return activeIndex === 1 ? cfGainNode1 : cfGainNode2
}

// Get gain node for the inactive/secondary audio (based on activeIndex)
const getSecondaryGainNode = (): GainNode | null => {
  return activeIndex === 1 ? cfGainNode2 : cfGainNode1
}

// Set gain for current active audio immediately
export const setCrossfadeGainCurrent = (value: number) => {
  const node = getCurrentGainNode()
  if (node) node.gain.setValueAtTime(value, audioContext.currentTime)
}

// Set gain for secondary audio immediately
export const setCrossfadeGainSecondary = (value: number) => {
  const node = getSecondaryGainNode()
  if (node) node.gain.setValueAtTime(value, audioContext.currentTime)
}

// Linear ramp for current active audio
export const rampCrossfadeGainCurrent = (targetValue: number, endTime: number) => {
  const node = getCurrentGainNode()
  if (node) node.gain.linearRampToValueAtTime(targetValue, endTime)
}

// Linear ramp for secondary audio
export const rampCrossfadeGainSecondary = (targetValue: number, endTime: number) => {
  const node = getSecondaryGainNode()
  if (node) node.gain.linearRampToValueAtTime(targetValue, endTime)
}

export const getActiveIndex = () => activeIndex

export const getSecondaryCurrentTime = () => getInactiveAudio()?.currentTime || 0

export const getSecondaryDuration = () => getInactiveAudio()?.duration || 0

export const onCanplaySecondary = (callback: Noop) => {
  const a = getInactiveAudio()
  if (!a) throw new Error('secondary audio not defined')
  a.addEventListener('canplay', callback)
  return () => { a.removeEventListener('canplay', callback) }
}

export const onErrorSecondary = (callback: Noop) => {
  const a = getInactiveAudio()
  if (!a) throw new Error('secondary audio not defined')
  a.addEventListener('error', callback)
  return () => { a.removeEventListener('error', callback) }
}

export const onTimeupdateSecondary = (callback: Noop) => {
  const a = getInactiveAudio()
  if (!a) throw new Error('secondary audio not defined')
  a.addEventListener('timeupdate', callback)
  return () => { a.removeEventListener('timeupdate', callback) }
}

export const onLoadedmetadataSecondary = (callback: Noop) => {
  const a = getInactiveAudio()
  if (!a) throw new Error('secondary audio not defined')
  a.addEventListener('loadedmetadata', callback)
  return () => { a.removeEventListener('loadedmetadata', callback) }
}
