import { describe, expect, it } from 'vitest'
import {
  shouldPollTranscription,
  transcriptionAction,
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
  transcriptSource: 'asr',
  revision: 1,
  isPartial: true,
  model: 'medium',
  modelState: 'ready',
  stage: 'recognizing',
  progress: 1 / 3,
  updatedAt: 1_000,
  ...value,
})

describe('podcast transcription presentation', () => {
  it('distinguishes cancelling a queued task from stopping active transcription', () => {
    expect(transcriptionAction(status({ stage: 'queued', startedAt: undefined }))).toEqual({
      kind: 'cancel', label: '取消排队', disabled: false,
    })
    expect(transcriptionAction(status({ stage: 'recognizing', startedAt: 1_000 }))).toEqual({
      kind: 'cancel', label: '中止转写', disabled: false,
    })
    expect(transcriptionAction(status({ stage: 'cancelling' }))).toEqual({
      kind: 'cancel', label: '正在中止', disabled: true,
    })
    expect(transcriptionAction(status({ stage: 'cancelled' }))).toEqual({
      kind: 'generate', label: '继续生成', disabled: false,
    })
  })

  it('shows real segment progress and active segment details', () => {
    const value = status({
      completedSegments: 6,
      totalSegments: 18,
      currentSegment: 7,
      startedAt: 10_000,
      lastHeartbeatAt: 229_000,
    })

    expect(transcriptionTitle(value)).toBe('正在转写 · 6/18 · 33%')
    expect(transcriptionProgress(value)).toBe(33)
    expect(transcriptionDetail(value, 230_000)).toBe(
      '已运行 03:40 · 当前处理第 7 段 · 后台运行中'
    )
  })

  it('shows the ASR backend separately from speaker diarization', () => {
    const value = status({
      asrExecutor: 'cuda',
      completedSegments: 6,
      totalSegments: 18,
      currentSegment: 7,
      lastHeartbeatAt: 10_000,
    })

    expect(transcriptionTitle(value)).toBe('正在转写 · CUDA GPU · 6/18 · 33%')
    expect(transcriptionDetail(value, 10_000)).toContain('语音识别：CUDA GPU')
    expect(transcriptionDetail(status({
      asrExecutor: 'cpu',
      asrExecutorFallbackReason: 'CUDA GPU 未加载，已回退 CPU',
    }), 10_000)).toContain('语音识别：CPU · CUDA GPU 未加载，已回退 CPU')
  })

  it('warns about a slow slice while a fresh heartbeat still proves the backend is alive', () => {
    const value = status({
      startedAt: 10_000,
      lastHeartbeatAt: 49_000,
      currentSegmentStartedAt: 15_000,
    })
    expect(transcriptionWarning(value, 50_000)).toBe(
      '当前片段已处理超过 30 秒，转写可能较慢或卡住'
    )
  })

  it('prioritizes a missing heartbeat over the slow-slice warning', () => {
    const value = status({
      lastHeartbeatAt: 10_000,
      currentSegmentStartedAt: 10_000,
    })
    expect(transcriptionWarning(value, 40_000)).toBe(
      '后台长时间没有响应，可以中止后继续生成'
    )
  })

  it('polls only active lifecycle stages and clamps reported progress', () => {
    expect(shouldPollTranscription(status({ stage: 'queued' }))).toBe(true)
    expect(shouldPollTranscription(status({ stage: 'cancelled' }))).toBe(false)
    expect(transcriptionProgress(status({ progress: 1.5 }))).toBe(100)
    expect(transcriptionProgress(status({ progress: null }))).toBeNull()
  })

  it('makes speaker model, executor, fallback, and count visible', () => {
    expect(transcriptionTitle(status({
      stage: 'preparing-speaker-model',
      speakerModelState: 'downloading',
      progress: 0.25,
    }))).toBe('正在下载说话人模型 · 25%')
    expect(transcriptionTitle(status({
      stage: 'diarizing',
      executor: 'cpu',
      progress: 0.1,
    }))).toBe('正在区分说话人 · CPU · 10%')
    expect(transcriptionDetail(status({
      stage: 'diarizing',
      startedAt: 1_000,
      executor: 'cpu',
      executorFallbackReason: 'DirectML 不可用，已回退 CPU',
      lastHeartbeatAt: 2_000,
    }), 2_000)).toContain('说话人分离：CPU · DirectML 不可用，已回退 CPU')
    expect(transcriptionTitle(status({
      stage: 'completed',
      speakerCount: 2,
    }))).toBe('转写完成 · 2 位说话人')
    expect(transcriptionTitle(status({
      stage: 'completed',
      speakerCount: 3,
      aiSpeakerCount: 3,
    }))).toBe('转写完成 · 3 位说话人 · AI 已标注 3 位')
    expect(transcriptionDetail(status({
      stage: 'completed',
      startedAt: undefined,
      speakerIdentityMessage: 'AI 未找到足够可信的身份，已保留本地说话人标签',
      speakerLabels: ['说话人 1', '说话人 2'],
    }), 2_000)).toBe(
      'AI 未找到足够可信的身份，已保留本地说话人标签 · 说话人：说话人 1 / 说话人 2'
    )
    expect(shouldPollTranscription(status({ stage: 'diarizing' }))).toBe(true)
    expect(transcriptionAction(status({ stage: 'diarizing' }))).toMatchObject({
      kind: 'cancel', label: '中止转写', disabled: false,
    })
  })
})
