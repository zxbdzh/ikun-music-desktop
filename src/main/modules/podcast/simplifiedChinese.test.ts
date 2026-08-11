import { describe, expect, it } from 'vitest'
import { simplifyAsrLine, simplifyAsrSnapshot, simplifyAsrText } from './simplifiedChinese'

describe('ASR simplified Chinese normalization', () => {
  it('converts traditional Chinese and preserves English in mixed text', () => {
    expect(simplifyAsrText('對，今天聊軟體和 AI podcast。')).toBe(
      '对，今天聊软体和 AI podcast。'
    )
    expect(simplifyAsrText('覺得一個對吧')).toBe('觉得一个对吧')
  })

  it('rebuilds timed word indexes against the converted display text', () => {
    const line: LX.Podcast.TranscriptLine = {
      id: 'line-1',
      startMs: 1_000,
      endMs: 4_000,
      displayText: '對 software 很有興趣',
      words: [
        { id: 'word-1', startIndex: 0, length: 1, startMs: 1_000, endMs: 1_300 },
        { id: 'word-2', startIndex: 2, length: 8, startMs: 1_300, endMs: 2_200 },
        { id: 'word-3', startIndex: 11, length: 4, startMs: 2_200, endMs: 4_000 },
      ],
    }

    const result = simplifyAsrLine(line)

    expect(result.displayText).toBe('对 software 很有兴趣')
    expect(result.words.map((word) => result.displayText.slice(
      word.startIndex,
      word.startIndex + word.length
    ))).toEqual(['对', 'software', '很有兴趣'])
    expect(result.words.map(({ startMs, endMs }) => ({ startMs, endMs }))).toEqual([
      { startMs: 1_000, endMs: 1_300 },
      { startMs: 1_300, endMs: 2_200 },
      { startMs: 2_200, endMs: 4_000 },
    ])
  })

  it('does not mutate the original ASR line', () => {
    const line: LX.Podcast.TranscriptLine = {
      id: 'line-1',
      startMs: 0,
      endMs: 1_000,
      displayText: '對話',
      words: [],
    }

    expect(simplifyAsrLine(line)).not.toBe(line)
    expect(line.displayText).toBe('對話')
  })

  it('normalizes only local ASR snapshots', () => {
    const asr: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode-1',
      revision: 153,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [{
        id: 'line-1',
        startMs: 0,
        endMs: 1_000,
        displayText: '大家都覺得這是一個事情',
        words: [],
      }],
      speakers: [],
    }
    const normalized = simplifyAsrSnapshot(asr)

    expect(normalized).not.toBe(asr)
    expect(normalized.lines[0].displayText).toBe('大家都觉得这是一个事情')
    expect(normalized.revision).toBe(153)
    expect(simplifyAsrSnapshot({ ...asr, source: 'publisher' })).toMatchObject({
      lines: [{ displayText: '大家都覺得這是一個事情' }],
    })
  })
})
