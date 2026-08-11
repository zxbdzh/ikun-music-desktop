import { describe, expect, it } from 'vitest'
import { applySpeakerLabels, reuseSpeakerLabels } from './speakerLabels'

const line = (id: string, startMs: number, endMs: number): LX.Podcast.TranscriptLine => ({
  id,
  startMs,
  endMs,
  displayText: id,
  words: [],
})

describe('podcast speaker labels', () => {
  it('assigns the speaker with the greatest overlap and numbers by first appearance', () => {
    const result = applySpeakerLabels(
      [line('first', 0, 2_000), line('second', 2_000, 4_000)],
      [
        { start: 0, end: 0.4, speaker: 8 },
        { start: 0.4, end: 2, speaker: 3 },
        { start: 2, end: 4, speaker: 8 },
      ]
    )

    expect(result.lines.map((item) => item.speakerId)).toEqual(['speaker-1', 'speaker-2'])
    expect(result.speakers).toEqual([
      { id: 'speaker-1', name: '说话人 1', origin: 'local' },
      { id: 'speaker-2', name: '说话人 2', origin: 'local' },
    ])
  })

  it('leaves a line unassigned when it does not overlap speech', () => {
    expect(applySpeakerLabels(
      [line('silence', 4_000, 5_000)],
      [{ start: 0, end: 2, speaker: 0 }]
    ).lines[0].speakerId).toBeUndefined()
  })

  it('reuses AI speaker names when ASR lines are regenerated for word timing', () => {
    const reference: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode-1',
      revision: 10,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [
        { ...line('old-a', 0, 2_000), speakerId: 'speaker-1' },
        { ...line('old-b', 2_000, 4_000), speakerId: 'speaker-2' },
      ],
      speakers: [
        { id: 'speaker-1', name: '主持人', origin: 'ai' },
        { id: 'speaker-2', name: '嘉宾', origin: 'ai' },
      ],
    }

    const result = reuseSpeakerLabels(
      [line('new-a', 200, 1_800), line('new-b', 2_100, 3_900)],
      reference
    )

    expect(result.lines.map((item) => item.speakerId)).toEqual(['speaker-1', 'speaker-2'])
    expect(result.speakers).toEqual(reference.speakers)
  })
})
