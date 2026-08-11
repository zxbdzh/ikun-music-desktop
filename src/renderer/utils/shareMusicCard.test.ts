import { describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/utils/musicSdk', () => ({ default: {} }))
vi.mock('@renderer/utils', () => ({
  decodeName: (value: unknown) => new DOMParser()
    .parseFromString(String(value ?? ''), 'text/html')
    .body.textContent,
  toOldMusicInfo: (musicInfo: unknown) => musicInfo,
}))

import {
  buildShareCardBatchId,
  buildShareCardPageFileName,
  paginateLyricLines,
  resolveMusicDetailWebUrl,
} from './shareMusicCard'

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

  it('decodes HTML entities in the publisher episode URL', () => {
    expect(resolveMusicDetailWebUrl(podcast({
      originalUrl: 'https://podcast.example.com/episodes/1?channel=rss&amp;album_id=42',
      audioUrl: 'https://cdn.example.com/episodes/1.mp3',
    }))).toBe('https://podcast.example.com/episodes/1?channel=rss&album_id=42')
  })

  it('decodes HTML entities in the fallback audio URL', () => {
    expect(resolveMusicDetailWebUrl(podcast({
      originalUrl: '',
      audioUrl: 'https://cdn.example.com/episodes/1.mp3?channel=rss&amp;album_id=42',
    }))).toBe('https://cdn.example.com/episodes/1.mp3?channel=rss&album_id=42')
  })

  it('never falls back to an unrelated music search page', () => {
    expect(resolveMusicDetailWebUrl(podcast({ originalUrl: '', audioUrl: '' }))).toBe('')
  })

  it('falls back when the publisher URL only looks like HTTP', () => {
    expect(resolveMusicDetailWebUrl(podcast({
      originalUrl: 'https://',
      audioUrl: 'https://cdn.example.com/episodes/1.mp3',
    }))).toBe('https://cdn.example.com/episodes/1.mp3')
  })

  it('rejects URLs containing embedded credentials', () => {
    expect(resolveMusicDetailWebUrl(podcast({
      originalUrl: 'https://user:password@podcast.example.com/episodes/1',
      audioUrl: 'https://cdn.example.com/episodes/1.mp3',
    }))).toBe('https://cdn.example.com/episodes/1.mp3')
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

  it('splits an oversized transcript line at the hard character limit', () => {
    const oversized = lyricLine('x'.repeat(50))

    const pages = paginateLyricLines([oversized, lyricLine('next')], {
      maxLinesPerPage: 8,
      maxCharactersPerPage: 10,
    })

    expect(pages.map((page) => page.map((line) => line.text))).toEqual([
      ['x'.repeat(10)],
      ['x'.repeat(10)],
      ['x'.repeat(10)],
      ['x'.repeat(10)],
      ['x'.repeat(10)],
      ['next'],
    ])
    expect(pages.flat().every((line) => line.text.length <= 10)).toBe(true)
  })

  it('ignores hidden translations when calculating pages', () => {
    const lines = [lyricLine('123456', 'abcdef'), lyricLine('next')]

    expect(paginateLyricLines(lines, {
      maxLinesPerPage: 8,
      maxCharactersPerPage: 10,
      includeTranslation: false,
    })).toEqual([lines])
  })

  it('counts emoji and combining characters as displayed graphemes', () => {
    const family = '👨‍👩‍👧‍👦'
    const combined = 'e\u0301'
    const pages = paginateLyricLines([
      lyricLine(`${family}${family}${combined}${combined}${family}`),
    ], {
      maxLinesPerPage: 8,
      maxCharactersPerPage: 2,
    })

    expect(pages.map((page) => page[0].text)).toEqual([
      `${family}${family}`,
      `${combined}${combined}`,
      family,
    ])
  })

  it('keeps paired text and translations within the page budget', () => {
    const pages = paginateLyricLines([
      lyricLine('主'.repeat(2_000), 'translation'.repeat(300)),
    ], {
      maxLinesPerPage: 8,
      maxCharactersPerPage: 240,
    })

    const fragments = pages.flat()
    expect(fragments.every((line) =>
      [...line.text].length + [...line.translation].length <= 240
    )).toBe(true)
    expect(fragments.map((line) => line.text).join('')).toBe('主'.repeat(2_000))
    expect(fragments.map((line) => line.translation).join('')).toBe('translation'.repeat(300))
  })
})

describe('share card page file names', () => {
  it('adds stable page ordering for multi-page exports', () => {
    expect(buildShareCardPageFileName('Episode 1', 2, 254))
      .toBe('Episode 1_p002-of-254.png')
    const names = [1, 2, 9, 10, 99, 100, 254]
      .map((page) => buildShareCardPageFileName('Episode 1', page, 254))
    expect([...names].sort()).toEqual(names)
  })

  it('removes characters that are invalid in file names', () => {
    expect(buildShareCardPageFileName('A/B: C?*.', 1, 1)).toBe('A_B_ C__.png')
    expect(buildShareCardPageFileName('CON', 1, 1)).toBe('_CON.png')
  })

  it('adds a readable unique batch id without changing page order', () => {
    const batchId = buildShareCardBatchId(new Date(2026, 7, 11, 21, 5, 9, 42))
    expect(batchId).toBe('20260811-210509-042')
    expect(buildShareCardPageFileName('Episode 1', 2, 12, batchId))
      .toBe('Episode 1_20260811-210509-042_p02-of-12.png')
  })

  it('keeps Unicode-heavy names within the Windows component limit', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'
    const fileName = buildShareCardPageFileName(
      family.repeat(120),
      2,
      254,
      'batch'.repeat(30)
    )

    expect(fileName.length).toBeLessThanOrEqual(255)
    expect(fileName).toMatch(/_p002-of-254\.png$/)
    expect(Buffer.from(fileName, 'utf8').toString('utf8')).toBe(fileName)
  })
})
