const ACTIVE_STAGES = new Set<LX.Podcast.TranscriptionStage>([
  'queued',
  'downloading-audio',
  'preparing-model',
  'converting-audio',
  'recognizing',
  'estimating-speakers',
  'preparing-speaker-model',
  'diarizing',
  'identifying-speakers',
  'saving',
  'cancelling',
])

const RUNNING_STAGES = new Set<LX.Podcast.TranscriptionStage>([
  'downloading-audio',
  'preparing-model',
  'converting-audio',
  'recognizing',
  'estimating-speakers',
  'preparing-speaker-model',
  'diarizing',
  'identifying-speakers',
  'saving',
])

type ComputeExecutor = NonNullable<
  LX.Podcast.AsrExecutor | LX.Podcast.TranscriptionExecutor
>

const EXECUTOR_LABELS: Record<ComputeExecutor, string> = {
  cpu: 'CPU',
  cuda: 'CUDA GPU',
  directml: 'DirectML GPU',
  vulkan: 'Vulkan GPU',
}

export const transcriptionExecutorLabel = (executor: ComputeExecutor) =>
  EXECUTOR_LABELS[executor]

export interface TranscriptionAction {
  kind: 'generate' | 'cancel'
  label: string
  disabled: boolean
}

export const shouldPollTranscription = (status?: LX.Podcast.TranscriptionStatus | null) =>
  !!status && ACTIVE_STAGES.has(status.stage)

export const transcriptionAction = (
  status?: LX.Podcast.TranscriptionStatus | null
): TranscriptionAction => {
  if (status?.transcriptSource === 'publisher') {
    return { kind: 'generate', label: '发布者字幕', disabled: true }
  }
  switch (status?.stage) {
    case 'queued':
      return { kind: 'cancel', label: '取消排队', disabled: false }
    case 'downloading-audio':
    case 'preparing-model':
    case 'converting-audio':
    case 'recognizing':
    case 'estimating-speakers':
    case 'preparing-speaker-model':
    case 'diarizing':
    case 'identifying-speakers':
    case 'saving':
      return { kind: 'cancel', label: '中止转写', disabled: false }
    case 'cancelling':
      return { kind: 'cancel', label: '正在中止', disabled: true }
    case 'cancelled':
      return { kind: 'generate', label: '继续生成', disabled: false }
    case 'completed':
      return { kind: 'generate', label: '重新生成', disabled: false }
    case 'failed':
      return { kind: 'generate', label: '继续生成', disabled: false }
    default:
      if (status?.transcriptState === 'unavailable') {
        return { kind: 'generate', label: '不可用', disabled: true }
      }
      return { kind: 'generate', label: '生成字幕', disabled: false }
  }
}

export const transcriptionProgress = (status?: LX.Podcast.TranscriptionStatus | null) => {
  if (status?.progress == null) return null
  return Math.round(Math.max(0, Math.min(1, status.progress)) * 100)
}

export const transcriptionTitle = (
  status?: LX.Podcast.TranscriptionStatus | null
) => {
  if (!status) return ''
  if (status.transcriptSource === 'publisher') return '发布者字幕 · 已就绪'
  const segments = segmentSummary(status)
  const percent = transcriptionProgress(status)
  const percentText = percent == null ? '' : ` · ${percent}%`
  switch (status.stage) {
    case 'idle': return '待生成'
    case 'queued': return '排队中 · 等待全局转写队列'
    case 'downloading-audio': return '正在准备播客音频'
    case 'preparing-model':
      if (status.modelState === 'downloading') {
        return `正在下载 ${status.model ?? 'ASR'} 模型${percentText}`
      }
      if (status.modelState === 'ready') return `${status.model ?? 'ASR'} 模型已就绪`
      if (status.modelState === 'error') return `${status.model ?? 'ASR'} 模型异常`
      return `正在检查 ${status.model ?? 'ASR'} 模型`
    case 'converting-audio': return `正在处理音频${segments}${percentText}`
    case 'recognizing': return `正在转写${asrExecutorSummary(status)}${segments}${percentText}`
    case 'estimating-speakers': return '正在由 AI 估算说话人数'
    case 'preparing-speaker-model':
      if (status.speakerModelState === 'downloading') {
        return `正在下载说话人模型${percentText}`
      }
      if (status.speakerModelState === 'error') return '说话人模型异常'
      return '正在检查说话人模型'
    case 'diarizing': return `正在区分说话人${executorSummary(status)}${percentText}`
    case 'identifying-speakers': return `正在用 AI 标注主持人和嘉宾${percentText}`
    case 'saving': return `正在保存字幕${segments}${percentText}`
    case 'cancelling': return `正在中止${segments}${percentText}`
    case 'cancelled': return `已中止${segments}${percentText}`
    case 'completed':
      return `转写完成${segments}${status.speakerCount ? ` · ${status.speakerCount} 位说话人` : ''}${
        status.aiSpeakerCount ? ` · AI 已标注 ${status.aiSpeakerCount} 位` : ''
      }`
    case 'failed': return `转写失败${segments}${status.error ? ` · ${status.error}` : ''}`
  }
}

export const transcriptionDetail = (
  status: LX.Podcast.TranscriptionStatus | null | undefined,
  now: number
) => {
  if (!status) return ''
  const parts: string[] = []
  if (status.startedAt) parts.push(`已运行 ${formatElapsed(now - status.startedAt)}`)
  if (status.currentSegment) parts.push(`当前处理第 ${status.currentSegment} 段`)
  if (status.asrExecutor) parts.push(`语音识别：${transcriptionExecutorLabel(status.asrExecutor)}`)
  if (status.asrExecutorFallbackReason) parts.push(status.asrExecutorFallbackReason)
  if (status.executor) {
    parts.push(`说话人分离：${transcriptionExecutorLabel(status.executor)}`)
  }
  if (status.executorFallbackReason) parts.push(status.executorFallbackReason)
  if (status.speakerError) parts.push(`说话人分离失败：${status.speakerError}`)
  if (status.speakerIdentityError) parts.push(`AI 标注：${status.speakerIdentityError}`)
  if (status.speakerIdentityMessage) parts.push(status.speakerIdentityMessage)
  if (status.speakerLabels?.length) parts.push(`说话人：${status.speakerLabels.join(' / ')}`)
  if (RUNNING_STAGES.has(status.stage)) {
    const heartbeatAge = status.lastHeartbeatAt == null ? null : now - status.lastHeartbeatAt
    parts.push(heartbeatAge != null && heartbeatAge <= 15_000 ? '后台运行中' : '等待后台更新')
  }
  return parts.join(' · ')
}

export const transcriptionWarning = (
  status: LX.Podcast.TranscriptionStatus | null | undefined,
  now: number
) => {
  if (!status || !RUNNING_STAGES.has(status.stage)) return ''
  if (status.lastHeartbeatAt != null && now - status.lastHeartbeatAt >= 30_000) {
    return '后台长时间没有响应，可以中止后继续生成'
  }
  if (
    status.currentSegmentStartedAt != null &&
    now - status.currentSegmentStartedAt >= 30_000
  ) {
    return '当前片段已处理超过 30 秒，转写可能较慢或卡住'
  }
  return ''
}

export const isTranscriptionWarning = (
  status: LX.Podcast.TranscriptionStatus | null | undefined,
  now: number
) => !!transcriptionWarning(status, now)

const segmentSummary = (status: LX.Podcast.TranscriptionStatus) =>
  status.totalSegments
    ? ` · ${status.completedSegments ?? 0}/${status.totalSegments}`
    : ''

const asrExecutorSummary = (status: LX.Podcast.TranscriptionStatus) => status.asrExecutor
  ? ` · ${transcriptionExecutorLabel(status.asrExecutor)}`
  : ''

const executorSummary = (status: LX.Podcast.TranscriptionStatus) => status.executor
  ? ` · ${transcriptionExecutorLabel(status.executor)}`
  : ''

const formatElapsed = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
