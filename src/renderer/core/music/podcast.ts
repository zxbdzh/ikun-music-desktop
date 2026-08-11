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
        ? '字幕生成失败，请在 IKUN 中重试'
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

export const getMusicUrl = async (musicInfo: LX.Music.MusicInfoPodcast) => {
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
  const statusText: Partial<Record<LX.Podcast.TranscriptState, string>> = {
    missing: '暂无字幕，请在 IKUN 中生成',
    preparing: '正在生成字幕',
    failed: '字幕生成失败，请在 IKUN 中重试',
    unavailable: '当前内容不支持字幕',
  }
  const lyric = toLrc(delta) || `[00:00.000]${statusText[delta.state] ?? ''}`
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
