import { describe, expect, it } from 'vitest'
import {
  applySpeakerIdentities,
  buildIdentificationInput,
  buildSpeakerCountEstimationInput,
  parseSpeakerCountEstimate,
  parseSpeakerIdentities,
} from './speakerIdentification'

const snapshot = (): LX.Podcast.TranscriptSnapshot => ({
  protocolVersion: 2,
  contentId: 'episode-1',
  revision: 3,
  state: 'ready',
  source: 'asr',
  language: 'zh',
  isPartial: false,
  lines: [
    { id: 'l1', startMs: 0, endMs: 1_000, displayText: '欢迎收听节目', speakerId: 'speaker-1', words: [] },
    { id: 'l2', startMs: 1_000, endMs: 2_000, displayText: '谢谢邀请', speakerId: 'speaker-2', words: [] },
  ],
  speakers: [
    { id: 'speaker-1', name: '说话人 1', origin: 'local' },
    { id: 'speaker-2', name: '用户姓名', origin: 'user' },
  ],
})

const source = (): LX.Podcast.Source => ({
  id: 'source-1',
  title: '大小马聊科技',
  author: '小丹尼+电动Emma',
  description: '主讲人：小丹尼+电动Emma+大卫',
  artworkUrl: '',
  feedUrl: '',
  categories: [],
  subscribed: true,
  autoDownload: false,
  groupId: 'default_group',
  subscriptionOrder: 0,
  updatedAt: 0,
})

describe('podcast speaker AI identification', () => {
  it('sends only metadata and representative text', () => {
    const input = buildIdentificationInput({
      id: 'episode-1', title: '一期节目', description: '节目简介',
    } as LX.Podcast.Episode, snapshot(), source())
    expect(input).toEqual(expect.objectContaining({
      episode: { title: '一期节目', description: '节目简介' },
      podcast: {
        title: '大小马聊科技',
        author: '小丹尼+电动Emma',
        description: '主讲人：小丹尼+电动Emma+大卫',
      },
      speakers: [
        expect.objectContaining({ speakerId: 'speaker-1', representativeText: '欢迎收听节目' }),
        expect.objectContaining({ speakerId: 'speaker-2', representativeText: '谢谢邀请' }),
      ],
    }))
    expect(JSON.stringify(input)).not.toContain('audioUrl')
  })

  it('samples each speaker across the episode instead of only taking the opening lines', () => {
    const base = snapshot()
    base.lines = Array.from({ length: 40 }, (_, index) => ({
      id: `line-${index}`,
      startMs: index * 1_000,
      endMs: (index + 1) * 1_000,
      displayText: index === 36 ? '我是小丹尼，欢迎回来' : `普通对话 ${index}`,
      speakerId: 'speaker-1',
      words: [],
    }))
    base.speakers = [{ id: 'speaker-1', name: '说话人 1', origin: 'local' }]

    const input = buildIdentificationInput({
      id: 'episode-1', title: '一期节目', description: '节目简介',
    } as LX.Podcast.Episode, base, source())

    expect(input.speakers[0].representativeText).toContain('我是小丹尼，欢迎回来')
  })

  it('keeps uncertain names and never overwrites user labels', () => {
    const result = applySpeakerIdentities(snapshot(), [
      { speakerId: 'speaker-1', name: '猜测姓名', role: '未知', confidence: 0.9 },
      { speakerId: 'speaker-2', name: 'AI 姓名', role: '主持人', confidence: 0.99 },
    ])
    expect(result.speakers.map((speaker) => speaker.name)).toEqual(['说话人 1', '用户姓名'])
  })

  it('uses an explicit name or a confident role fallback', () => {
    const base = snapshot()
    base.speakers[1].origin = 'local'
    const result = applySpeakerIdentities(base, [
      { speakerId: 'speaker-1', name: '小明', role: '主持人', confidence: 0.9 },
      { speakerId: 'speaker-2', role: '嘉宾', confidence: 0.8 },
    ])
    expect(result.speakers).toEqual([
      { id: 'speaker-1', name: '小明', origin: 'ai' },
      { id: 'speaker-2', name: '嘉宾', origin: 'ai' },
    ])
  })

  it('numbers repeated role-only fallbacks so prefixes remain distinguishable', () => {
    const base = snapshot()
    base.speakers[1].origin = 'local'
    base.speakers[1].name = '说话人 2'
    const result = applySpeakerIdentities(base, [
      { speakerId: 'speaker-1', role: '主持人', confidence: 0.9 },
      { speakerId: 'speaker-2', role: '主持人', confidence: 0.9 },
    ])

    expect(result.speakers.map((speaker) => speaker.name)).toEqual(['主持人 1', '主持人 2'])
  })

  it('rejects malformed model output', () => {
    expect(() => parseSpeakerIdentities({
      speakers: [{ speakerId: 'unknown', role: '主持人', confidence: 2 }],
    })).toThrow('无效')
  })

  it('builds a bounded text-only speaker count request', () => {
    const input = buildSpeakerCountEstimationInput({
      id: 'episode-1', title: '一期节目', description: '两位主持人访问一位嘉宾',
    } as LX.Podcast.Episode, snapshot(), source())

    expect(input).toMatchObject({
      task: 'estimate-podcast-speaker-count',
      allowedRange: { minimum: 1, maximum: 8 },
      episode: { title: '一期节目' },
      podcast: expect.objectContaining({ author: '小丹尼+电动Emma' }),
    })
    expect(input.transcriptSample).toContain('欢迎收听节目')
    expect(JSON.stringify(input)).not.toContain('audioUrl')
  })

  it('accepts only integer speaker count estimates from 1 to 8', () => {
    expect(parseSpeakerCountEstimate({ speakerCount: 3 })).toBe(3)
    expect(() => parseSpeakerCountEstimate({ speakerCount: 64 })).toThrow('1 到 8')
    expect(() => parseSpeakerCountEstimate({ speakerCount: 2.5 })).toThrow('1 到 8')
  })
})
