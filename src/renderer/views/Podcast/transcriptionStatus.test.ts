import { describe, expect, it } from 'vitest'
import {
  isTranscriptionWarning,
  shouldPollTranscription,
  transcriptionDetail,
  transcriptionProgress,
  transcriptionTitle,
  transcriptionWarning,
} from './transcriptionStatus'

const status = (
  value: Partial<LX.Podcast.TranscriptionStatus>
): LX.Podcast.TranscriptionStatus => ({
  protocolVersion: 2,
  contentId: 'episode-1',
  transcriptState: 'preparing',
  transcriptSource: 'voxrail',
  revision: 1,
  isPartial: true,
  stage: 'running',
  progress: null,
  updatedAt: 1_000,
  ...value,
})

describe('podcast cloud transcription presentation', () => {
  it('labels publisher, queued, running, completed, and failed states', () => {
    expect(transcriptionTitle(status({ transcriptSource: 'publisher', stage: 'completed' })))
      .toBe('发布者字幕 · 已就绪')
    expect(transcriptionTitle(status({ stage: 'queued' }))).toBe('Voxrail · 排队中')
    expect(transcriptionTitle(status({ stage: 'running' }))).toBe('Voxrail · 云端转写中')
    expect(transcriptionTitle(status({ stage: 'completed', transcriptState: 'ready' })))
      .toBe('Voxrail · 已就绪')
    expect(transcriptionTitle(status({ stage: 'failed', transcriptState: 'failed', error: '额度不足' })))
      .toBe('Voxrail · 转写失败 · 额度不足')
  })

  it('polls only queued and running cloud jobs', () => {
    expect(shouldPollTranscription(status({ stage: 'queued' }))).toBe(true)
    expect(shouldPollTranscription(status({ stage: 'running' }))).toBe(true)
    expect(shouldPollTranscription(status({ stage: 'completed' }))).toBe(false)
    expect(shouldPollTranscription(status({ stage: 'failed' }))).toBe(false)
  })

  it('shows cloud-only details and clamps progress', () => {
    const value = status({
      startedAt: 10_000,
      lastHeartbeatAt: 229_000,
      speakerCount: 2,
      progress: 1.4,
    })
    expect(transcriptionProgress(value)).toBe(100)
    expect(transcriptionDetail(value, 230_000)).toBe(
      '音频留在云端处理，IKUN 不上传音频 · 已运行 03:40 · 2 位说话人 · 后台运行中'
    )
  })

  it('shows the cloud stage, percentage, and processed audio time', () => {
    const value = status({
      progressStage: 'transcribing',
      progress: 0.423,
      processedSeconds: 2520,
      totalSeconds: 6000,
      startedAt: 10_000,
      lastHeartbeatAt: 229_000,
    })

    expect(transcriptionTitle(value)).toBe('Voxrail · 云端转写中 · 42%')
    expect(transcriptionDetail(value, 230_000)).toBe(
      '音频留在云端处理，IKUN 不上传音频 · 已处理 42:00 / 01:40:00 · 已运行 03:40 · 后台运行中'
    )
  })

  it('warns when the cloud heartbeat is stale', () => {
    const value = status({ lastHeartbeatAt: 10_000 })
    expect(transcriptionWarning(value, 40_000)).toBe('云端长时间没有返回新状态，请检查 Voxrail 连接')
    expect(isTranscriptionWarning(value, 40_000)).toBe(true)
    expect(transcriptionWarning(status({ stage: 'queued', lastHeartbeatAt: 1_000 }), 60_000)).toBe('')
  })
})
