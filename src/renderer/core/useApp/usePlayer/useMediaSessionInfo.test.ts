import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = new Map<string, (...args: any[]) => void>()
const audioInstances: FakeAudio[] = []

vi.mock('@common/utils/vueTools', () => ({ onBeforeUnmount: vi.fn() }))
vi.mock('@renderer/plugins/player', () => ({
  getDuration: () => 120,
  getPlaybackRate: () => 1,
  getCurrentTime: () => 12,
}))
vi.mock('@renderer/store/player/state', () => ({
  isPlay: { value: true },
  musicInfo: { id: 'episode-1', name: 'Episode', singer: 'Host', album: '', pic: null },
  playMusicInfo: { musicInfo: { id: 'episode-1' } },
}))
vi.mock('@renderer/store/player/playProgress', () => ({
  playProgress: { nowPlayTime: 12, maxPlayTime: 120 },
}))
vi.mock('@renderer/core/player', () => ({
  pause: vi.fn(),
  play: vi.fn(),
  playNext: vi.fn(),
  playPrev: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('@renderer/assets/medias/Silence02s.mp3', () => ({ default: 'silence.mp3' }))

class FakeAudio {
  autoplay = false
  src = ''
  controls = false
  preload = ''
  loop = false
  hidden = false
  onplaying: (() => void) | null = null
  play = vi.fn(async () => {
    this.onplaying?.()
  })
  pause = vi.fn()
  remove = vi.fn()

  constructor() {
    audioInstances.push(this)
  }
}

describe('media session registration', () => {
  beforeEach(() => {
    listeners.clear()
    audioInstances.length = 0
    vi.stubGlobal('Audio', FakeAudio)
    vi.spyOn(document.body, 'append').mockImplementation(() => undefined)
    Object.defineProperty(window, 'MediaMetadata', {
      configurable: true,
      value: class MediaMetadata {
        constructor(public readonly value: MediaMetadataInit) {}
      },
    })
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: {
        metadata: null,
        playbackState: 'none',
        setActionHandler: vi.fn(),
        setPositionState: vi.fn(),
      },
    })
    Object.defineProperty(window, 'app_event', {
      configurable: true,
      value: {
        on: (name: string, listener: (...args: any[]) => void) => listeners.set(name, listener),
        off: vi.fn(),
        setProgress: vi.fn(),
      },
    })
  })

  it('retries the registration audio synchronously when playback is activated', async () => {
    const { default: useMediaSessionInfo } = await import('./useMediaSessionInfo')

    useMediaSessionInfo()
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].loop).toBe(true)
    expect(audioInstances[0].hidden).toBe(true)
    expect(document.body.append).toHaveBeenCalledWith(audioInstances[0])
    expect(audioInstances[0].pause).not.toHaveBeenCalled()

    listeners.get('mediaSessionActivate')?.()
    await Promise.resolve()

    expect(audioInstances[0].play).toHaveBeenCalledTimes(2)

    listeners.get('play')?.()
    await Promise.resolve()
    expect(navigator.mediaSession.playbackState).toBe('playing')
    expect(audioInstances[0].pause).not.toHaveBeenCalled()

    listeners.get('pause')?.()
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(navigator.mediaSession.playbackState).toBe('paused')
  })
})
