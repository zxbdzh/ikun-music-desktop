import { describe, expect, it } from 'vitest'
import { parsePublisherTranscript } from './captions'

describe('publisher transcript parser', () => {
  it('parses WebVTT into timed lines', () => {
    const result = parsePublisherTranscript(
      'ep',
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello 世界',
      'text/vtt',
      'zh-CN'
    )
    expect(result.lines[0].startMs).toBe(1_000)
    expect(result.lines[0].endMs).toBe(3_500)
    expect(result.language).toBe('zh-CN')
  })

  it('preserves WebVTT speakers for visible prefixes', () => {
    const snapshot = parsePublisherTranscript(
      'episode-speakers',
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v 主持人>Hello 世界</v>',
      'text/vtt',
      'zh-CN'
    )

    expect(snapshot.speakers).toEqual([
      { id: 'publisher:1', name: '主持人', origin: 'publisher' },
    ])
    expect(snapshot.lines[0].speakerId).toBe('publisher:1')
    expect(snapshot.lines[0].displayText).toBe('Hello 世界')
  })

  it('parses Podcasting JSON transcript segments', () => {
    const result = parsePublisherTranscript(
      'ep',
      JSON.stringify({ segments: [{ startTime: 1, endTime: 2, body: 'Hello' }] }),
      'application/json'
    )
    expect(result.lines[0].displayText).toBe('Hello')
  })

  it('parses whisper.cpp JSON offsets as milliseconds', () => {
    const result = parsePublisherTranscript(
      'ep',
      JSON.stringify({
        result: { language: 'en' },
        transcription: [
          {
            offsets: { from: 0, to: 10_600 },
            text: 'Hello from whisper',
          },
        ],
      }),
      'application/json',
      'auto'
    )

    expect(result.lines[0].startMs).toBe(0)
    expect(result.lines[0].endMs).toBe(10_600)
    expect(result.lines[0].displayText).toBe('Hello from whisper')
  })

  it('keeps whisper.cpp token timing for mixed-language text', () => {
    const result = parsePublisherTranscript(
      'ep',
      JSON.stringify({
        transcription: [
          {
            offsets: { from: 1_000, to: 4_000 },
            text: '今天 build',
            tokens: [
              { offsets: { from: 1_100, to: 1_500 }, text: '今' },
              { offsets: { from: 1_500, to: 1_900 }, text: '天' },
              { offsets: { from: 2_200, to: 3_600 }, text: ' build' },
            ],
          },
        ],
      }),
      'application/json'
    )

    expect(result.lines[0].words).toEqual([
      expect.objectContaining({ startIndex: 0, length: 1, startMs: 1_100, endMs: 1_500 }),
      expect.objectContaining({ startIndex: 1, length: 1, startMs: 1_500, endMs: 1_900 }),
      expect.objectContaining({ startIndex: 3, length: 5, startMs: 2_200, endMs: 3_600 }),
    ])
  })
})
