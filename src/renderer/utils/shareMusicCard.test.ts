import { describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/utils/musicSdk', () => ({ default: {} }))
vi.mock('@renderer/utils', () => ({ toOldMusicInfo: (musicInfo: unknown) => musicInfo }))

import { resolveMusicDetailWebUrl } from './shareMusicCard'

const podcast = (meta: Record<string, string>) => ({
  id: 'episode-1',
  name: 'Episode 1',
  singer: 'Podcast',
  source: 'local',
  meta: { podcast: true, ...meta },
})

describe('podcast share URL', () => {
  it('prefers the publisher episode page', () => {
    expect(resolveMusicDetailWebUrl(podcast({
      originalUrl: 'https://podcast.example.com/episodes/1',
      audioUrl: 'https://cdn.example.com/episodes/1.mp3',
    }))).toBe('https://podcast.example.com/episodes/1')
  })

  it('falls back to the audio URL when the episode page is unavailable', () => {
    expect(resolveMusicDetailWebUrl(podcast({
      originalUrl: '',
      audioUrl: 'https://cdn.example.com/episodes/1.mp3',
    }))).toBe('https://cdn.example.com/episodes/1.mp3')
  })

  it('never falls back to an unrelated music search page', () => {
    expect(resolveMusicDetailWebUrl(podcast({ originalUrl: '', audioUrl: '' }))).toBe('')
  })
})
