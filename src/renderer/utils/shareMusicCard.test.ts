import { describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/utils/musicSdk', () => ({ default: {} }))
vi.mock('@renderer/utils', () => ({ toOldMusicInfo: (musicInfo: unknown) => musicInfo }))

import { paginateLyricLines, resolveMusicDetailWebUrl } from './shareMusicCard'

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

const lyricLine = (text: string, translation = '') => ({
  key: text,
  text,
  time: text,
  translation,
})

describe('share lyric pagination', () => {
  it('returns no pages for an empty selection', () => {
    expect(paginateLyricLines([])).toEqual([])
  })

  it('splits at the line limit and preserves timeline order', () => {
    const lines = Array.from({ length: 5 }, (_, index) => lyricLine(`line-${index + 1}`))

    const pages = paginateLyricLines(lines, {
      maxLinesPerPage: 2,
      maxCharactersPerPage: 100,
    })

    expect(pages.map((page) => page.length)).toEqual([2, 2, 1])
    expect(pages.flat()).toEqual(lines)
  })

  it('keeps default share cards to six lines', () => {
    const lines = Array.from({ length: 7 }, (_, index) => lyricLine(`line-${index + 1}`))

    expect(paginateLyricLines(lines).map((page) => page.length)).toEqual([6, 1])
  })

  it('splits long transcripts by displayed character budget', () => {
    const lines = [lyricLine('123456', 'abcd'), lyricLine('12345'), lyricLine('last')]

    const pages = paginateLyricLines(lines, {
      maxLinesPerPage: 8,
      maxCharactersPerPage: 12,
    })

    expect(pages.map((page) => page.length)).toEqual([1, 2])
    expect(pages.flat()).toEqual(lines)
  })

  it('keeps an oversized transcript line intact', () => {
    const oversized = lyricLine('x'.repeat(50))

    const pages = paginateLyricLines([oversized, lyricLine('next')], {
      maxLinesPerPage: 8,
      maxCharactersPerPage: 10,
    })

    expect(pages).toHaveLength(2)
    expect(pages[0]).toEqual([oversized])
  })

  it('ignores hidden translations when calculating pages', () => {
    const lines = [lyricLine('123456', 'abcdef'), lyricLine('next')]

    expect(paginateLyricLines(lines, {
      maxLinesPerPage: 8,
      maxCharactersPerPage: 10,
      includeTranslation: false,
    })).toEqual([lines])
  })
})
