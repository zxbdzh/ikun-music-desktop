import { getAudioContext, getGainNode, getAudio } from '../player'

interface SeamlessState {
  isActive: boolean
  currentMode: 'fade' | 'crossfade'
  fadingOutGain: GainNode | null
  fadingInGain: GainNode | null
  transitionStartTime: number
}

class SeamlessPlaybackManager {
  private static instance: SeamlessPlaybackManager

  private state: SeamlessState = {
    isActive: false,
    currentMode: 'fade',
    fadingOutGain: null,
    fadingInGain: null,
    transitionStartTime: 0,
  }

  private bufferCache: Map<string, AudioBuffer> = new Map()
  private maxCacheSize = 5

  private constructor() {}

  static getInstance(): SeamlessPlaybackManager {
    if (!SeamlessPlaybackManager.instance) {
      SeamlessPlaybackManager.instance = new SeamlessPlaybackManager()
    }
    return SeamlessPlaybackManager.instance
  }

  async prepareNextTrack(url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!
    }

    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Fetch failed')
      const arrayBuffer = await response.arrayBuffer()
      const audioContext = getAudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      // LRU cache eviction
      if (this.bufferCache.size >= this.maxCacheSize) {
        const firstKey = this.bufferCache.keys().next().value
        if (firstKey) this.bufferCache.delete(firstKey)
      }
      this.bufferCache.set(url, audioBuffer)

      return audioBuffer
    } catch (error) {
      console.error('Failed to prepare next track:', error)
      return null
    }
  }

  async fadeTransition(
    nextBuffer: AudioBuffer,
    duration: number
  ): Promise<void> {
    const audioContext = getAudioContext()
    const mainGainNode = getGainNode()
    const durationSec = duration / 1000

    // Create next track's gain node and source
    const nextGainNode = audioContext.createGain()
    const nextSourceNode = audioContext.createBufferSource()
    nextSourceNode.buffer = nextBuffer
    nextSourceNode.connect(nextGainNode)
    nextGainNode.connect(mainGainNode)

    this.state.fadingOutGain = mainGainNode
    this.state.fadingInGain = nextGainNode
    this.state.isActive = true
    this.state.transitionStartTime = Date.now()

    const now = audioContext.currentTime
    const currentGainValue = mainGainNode.gain.value

    // Current track fades out
    mainGainNode.gain.setValueAtTime(currentGainValue, now)
    mainGainNode.gain.linearRampToValueAtTime(0, now + durationSec)

    // Next track fades in
    nextGainNode.gain.setValueAtTime(0, now)
    nextGainNode.gain.linearRampToValueAtTime(1, now + durationSec)

    // Start next track
    nextSourceNode.start(0)

    // Wait for transition to complete
    await new Promise<void>((resolve) => setTimeout(resolve, duration))

    // Restore main gain and cleanup
    mainGainNode.gain.value = 1
    nextSourceNode.stop()

    this.state.isActive = false
    this.state.fadingOutGain = null
    this.state.fadingInGain = null
  }

  async crossfadeTransition(
    currentBuffer: AudioBuffer,
    nextBuffer: AudioBuffer,
    duration: number
  ): Promise<void> {
    const audioContext = getAudioContext()
    const mainGainNode = getGainNode()
    const durationSec = duration / 1000

    // Create transition nodes
    const fadingOutGain = audioContext.createGain()
    const fadingInGain = audioContext.createGain()

    const currentSource = audioContext.createBufferSource()
    const nextSource = audioContext.createBufferSource()

    currentSource.buffer = currentBuffer
    nextSource.buffer = nextBuffer

    currentSource.connect(fadingOutGain)
    nextSource.connect(fadingInGain)

    fadingOutGain.connect(mainGainNode)
    fadingInGain.connect(mainGainNode)

    this.state.fadingOutGain = fadingOutGain
    this.state.fadingInGain = fadingInGain
    this.state.isActive = true
    this.state.transitionStartTime = Date.now()

    const now = audioContext.currentTime

    // Exponential ramp for smoother crossfade
    fadingOutGain.gain.setValueAtTime(1, now)
    fadingOutGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec)

    fadingInGain.gain.setValueAtTime(0.001, now)
    fadingInGain.gain.exponentialRampToValueAtTime(1, now + durationSec)

    // Start both tracks
    currentSource.start(0)
    nextSource.start(0)

    await new Promise<void>((resolve) => setTimeout(resolve, duration))

    mainGainNode.gain.value = 1
    currentSource.stop()
    nextSource.stop()

    this.state.isActive = false
    this.state.fadingOutGain = null
    this.state.fadingInGain = null
  }

  cancelTransition(): void {
    if (!this.state.isActive) return

    if (this.state.fadingOutGain) {
      this.state.fadingOutGain.gain.cancelScheduledValues(0)
    }
    if (this.state.fadingInGain) {
      this.state.fadingInGain.gain.cancelScheduledValues(0)
    }

    this.state.isActive = false
    this.state.fadingOutGain = null
    this.state.fadingInGain = null
  }

  getTransitionProgress(): number {
    if (!this.state.isActive) return 0
    const elapsed = Date.now() - this.state.transitionStartTime
    const totalDuration = this.state.currentMode === 'fade' ? 3000 : 3000
    return Math.min(elapsed / totalDuration, 1)
  }

  isTransitioning(): boolean {
    return this.state.isActive
  }

  setMode(mode: 'fade' | 'crossfade'): void {
    this.state.currentMode = mode
  }

  setEnabled(enabled: boolean): void {
    if (!enabled && this.state.isActive) {
      this.cancelTransition()
    }
  }

  getBufferFromCache(url: string): AudioBuffer | undefined {
    return this.bufferCache.get(url)
  }

  clearCache(): void {
    this.bufferCache.clear()
  }
}

export default SeamlessPlaybackManager
