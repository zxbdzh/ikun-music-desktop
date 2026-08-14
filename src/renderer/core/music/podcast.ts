import { sendPodcastCommand } from '@renderer/utils/ipc'

let lyricRequestGeneration = 0
let lyricRefreshGeneration = 0
let lyricRefreshTimer: ReturnType<typeof setTimeout> | null = null

const stopLyricRefresh = () => {
  lyricRefreshGeneration++
  if (lyricRefreshTimer) {
    clearTimeout(lyricRefreshTimer)
    lyricRefreshTimer = null
  }
}

export const resolvePodcastMusicInfo = (
  musicInfo: LX.Player.PlayMusicInfo['musicInfo'] | null
): LX.Music.MusicInfoPodcast | null => {
  const resolved = musicInfo && 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
  return resolved && 'podcast' in resolved.meta
    ? (resolved as LX.Music.MusicInfoPodcast)
    : null
}

export const activatePodcastEpisode = async (
  musicInfo: LX.Player.PlayMusicInfo['musicInfo'] | null
): Promise<LX.Music.MusicInfoPodcast | null> => {
  const podcast = resolvePodcastMusicInfo(musicInfo)
  if (!podcast) return null
  await sendPodcastCommand({ action: 'activate-episode', episodeId: podcast.id })
  return podcast
}

export const cancelPendingLyricRequest = () => {
  lyricRequestGeneration++
  stopLyricRefresh()
}

const timestamp = (milliseconds: number) => {
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = (milliseconds % 60_000) / 1000
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`
}

const toLrc = (delta: LX.Podcast.TranscriptDelta) => {
  const speakers = new Map(delta.speakers.map((speaker) => [speaker.id, speaker.name]))
  const lines = [...delta.upsertLines].sort(
    (left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id)
  )
  const statusText =
    delta.state === 'preparing'
      ? '当前片段正在生成'
      : delta.state === 'failed'
        ? '云端字幕生成失败，稍后将自动重试'
        : ''
  const output: Array<{ startMs: number; text: string }> = []

  if (statusText && lines[0]?.startMs > 15_000) output.push({ startMs: 0, text: statusText })
  lines.forEach((line, index) => {
    if (index > 0) {
      const previous = lines[index - 1]
      if (statusText && line.startMs - previous.endMs > 15_000) {
        output.push({ startMs: previous.endMs + 1, text: statusText })
      }
    }
    const speaker = line.speakerId ? speakers.get(line.speakerId) : undefined
    const prefix = speaker ? `${speaker}：` : ''
    output.push({ startMs: line.startMs, text: `${prefix}${line.displayText}` })
  })
  if (statusText && lines.length > 0) {
    output.push({ startMs: lines[lines.length - 1].endMs + 1, text: statusText })
  }

  return output
    .sort((left, right) => left.startMs - right.startMs)
    .map((line) => {
      return `[${timestamp(line.startMs)}]${line.text}`
    })
    .join('\n')
}

const transcriptionLyricStatus = (
  status: LX.Podcast.TranscriptionStatus | null
) => {
  if (!status || status.transcriptSource !== 'voxrail') return ''
  if (status.stage === 'queued') return 'Voxrail 排队中'
  if (status.stage === 'failed') return `Voxrail 转写失败${status.error ? ` · ${status.error}` : ''}`
  if (status.stage === 'completed') return 'Voxrail 字幕已就绪'
  const stageLabels: Record<LX.Podcast.TranscriptionProgressStage, string> = {
    'downloading-media': '下载云端音频中',
    transcribing: '云端转写中',
    diarizing: '区分说话人中',
    'annotating-speakers': '标注说话人中',
    'publishing-final': '发布字幕中',
  }
  const label = status.progressStage ? stageLabels[status.progressStage] : '云端转写中'
  const progress = status.progress == null
    ? ''
    : ` · ${Math.round(Math.max(0, Math.min(1, status.progress)) * 100)}%`
  const processed = status.processedSeconds != null && status.totalSeconds != null
    ? ` · ${formatAudioTime(status.processedSeconds)} / ${formatAudioTime(status.totalSeconds)}`
    : ''
  return `Voxrail ${label}${progress}${processed}`
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

export const getMusicUrl = async (musicInfo: LX.Music.MusicInfoPodcast) => {
  if (!musicInfo.meta.audioUrl?.trim()) throw new Error('当前博客没有可播放的音频')
  await activatePodcastEpisode(musicInfo)
  return musicInfo.meta.audioUrl
}

export const getPicUrl = async (musicInfo: LX.Music.MusicInfoPodcast) =>
  musicInfo.meta.artworkUrl || musicInfo.meta.picUrl || ''

export const getLyricInfo = async (
  musicInfo: LX.Music.MusicInfoPodcast
): Promise<LX.Player.LyricInfo> => {
  const requestGeneration = ++lyricRequestGeneration
  const delta = await sendPodcastCommand<LX.Podcast.TranscriptDelta>({
    action: 'transcript',
    episodeId: musicInfo.id,
    sinceRevision: 0,
  })
  if (requestGeneration !== lyricRequestGeneration) {
    throw new Error('Podcast lyric request superseded')
  }
  const generatedLyric = toLrc(delta)
  let cloudStatus = ''
  if (!generatedLyric && (delta.state === 'missing' || delta.state === 'preparing')) {
    try {
      cloudStatus = transcriptionLyricStatus(
        await sendPodcastCommand<LX.Podcast.TranscriptionStatus | null>({
          action: 'transcription-status',
          episodeId: musicInfo.id,
        })
      )
    } catch {
      cloudStatus = ''
    }
    if (requestGeneration !== lyricRequestGeneration) {
      throw new Error('Podcast lyric request superseded')
    }
  }
  const statusText: Partial<Record<LX.Podcast.TranscriptState, string>> = {
    missing: '字幕尚未就绪，Voxrail 将自动处理',
    preparing: 'Voxrail 正在生成字幕',
    failed: '云端字幕生成失败，稍后将自动重试',
    unavailable: '当前内容不支持字幕',
  }
  const lyric = generatedLyric || `[00:00.000]${cloudStatus || statusText[delta.state] || ''}`
  return {
    lyric,
    tlyric: '',
    rlyric: '',
    lxlyric: '',
    rawlrcInfo: { lyric },
  }
}

export const startPodcastLyricRefresh = (
  musicInfo: LX.Music.MusicInfoPodcast,
  onUpdate: (lyricInfo: LX.Player.LyricInfo) => void,
  intervalMs = 2_000
) => {
  stopLyricRefresh()
  const refreshGeneration = lyricRefreshGeneration
  let lastLyric = ''

  const refresh = async () => {
    if (refreshGeneration !== lyricRefreshGeneration) return
    try {
      const lyricInfo = await getLyricInfo(musicInfo)
      if (refreshGeneration !== lyricRefreshGeneration) return
      if (lyricInfo.lyric !== lastLyric) {
        lastLyric = lyricInfo.lyric
        onUpdate(lyricInfo)
      }
    } catch {
      if (refreshGeneration !== lyricRefreshGeneration) return
    }
    lyricRefreshTimer = setTimeout(() => void refresh(), intervalMs)
  }

  lyricRefreshTimer = setTimeout(() => void refresh(), intervalMs)
}
