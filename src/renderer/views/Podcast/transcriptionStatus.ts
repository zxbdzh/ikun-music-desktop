const ACTIVE_STAGES = new Set<LX.Podcast.TranscriptionStage>([
  'queued',
  'running',
])

const RUNNING_STAGES = new Set<LX.Podcast.TranscriptionStage>([
  'running',
])

const VOXRAIL_STAGE_LABELS: Record<LX.Podcast.TranscriptionProgressStage, string> = {
  'downloading-media': '下载云端音频中',
  transcribing: '云端转写中',
  diarizing: '区分说话人中',
  'annotating-speakers': '标注说话人中',
  'publishing-final': '发布字幕中',
}

export const shouldPollTranscription = (status?: LX.Podcast.TranscriptionStatus | null) =>
  !!status && ACTIVE_STAGES.has(status.stage)

export const transcriptionProgress = (status?: LX.Podcast.TranscriptionStatus | null) => {
  if (status?.progress == null) return null
  return Math.round(Math.max(0, Math.min(1, status.progress)) * 100)
}

export const transcriptionTitle = (
  status?: LX.Podcast.TranscriptionStatus | null
) => {
  if (!status) return ''
  if (status.transcriptSource === 'publisher') return '发布者字幕 · 已就绪'
  if (status.transcriptSource === 'voxrail') {
    switch (status.stage) {
      case 'queued': return 'Voxrail · 排队中'
      case 'running': {
        const label = status.progressStage
          ? VOXRAIL_STAGE_LABELS[status.progressStage]
          : '云端转写中'
        const percent = transcriptionProgress(status)
        return `Voxrail · ${label}${percent == null ? '' : ` · ${percent}%`}`
      }
      case 'completed': return 'Voxrail · 已就绪'
      case 'failed': return `Voxrail · 转写失败${status.error ? ` · ${status.error}` : ''}`
      default: return 'Voxrail · 等待提交'
    }
  }
  switch (status.stage) {
    case 'completed': return '字幕 · 已就绪'
    case 'failed': return `字幕失败${status.error ? ` · ${status.error}` : ''}`
    default: return '字幕处理中'
  }
}

export const transcriptionDetail = (
  status: LX.Podcast.TranscriptionStatus | null | undefined,
  now: number
) => {
  if (!status) return ''
  const parts: string[] = []
  if (status.transcriptSource === 'voxrail') parts.push('音频留在云端处理，IKUN 不上传音频')
  if (status.processedSeconds != null && status.totalSeconds != null) {
    parts.push(
      `已处理 ${formatAudioTime(status.processedSeconds)} / ${formatAudioTime(status.totalSeconds)}`
    )
  }
  if (status.startedAt && RUNNING_STAGES.has(status.stage)) {
    parts.push(`已运行 ${formatElapsed(now - status.startedAt)}`)
  }
  if (status.speakerCount) parts.push(`${status.speakerCount} 位说话人`)
  if (status.speakerLabels?.length) parts.push(`说话人：${status.speakerLabels.join(' / ')}`)
  if (RUNNING_STAGES.has(status.stage)) {
    const heartbeatAge = status.lastHeartbeatAt == null ? null : now - status.lastHeartbeatAt
    parts.push(heartbeatAge != null && heartbeatAge <= 15_000 ? '后台运行中' : '等待云端更新')
  }
  return parts.join(' · ')
}

export const transcriptionWarning = (
  status: LX.Podcast.TranscriptionStatus | null | undefined,
  now: number
) => {
  if (!status || !RUNNING_STAGES.has(status.stage)) return ''
  if (status.lastHeartbeatAt != null && now - status.lastHeartbeatAt >= 30_000) {
    return '云端长时间没有返回新状态，请检查 Voxrail 连接'
  }
  return ''
}

export const isTranscriptionWarning = (
  status: LX.Podcast.TranscriptionStatus | null | undefined,
  now: number
) => !!transcriptionWarning(status, now)

const formatElapsed = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

const formatAudioTime = (value: number) => {
  const seconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
