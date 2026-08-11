import { lineFromSegment } from './transcript'

export const parsePublisherTranscript = (
  contentId: string,
  raw: string,
  contentType: string,
  language = 'auto'
): LX.Podcast.TranscriptSnapshot => {
  const normalizedType = contentType.toLowerCase().split(';')[0].trim()
  const segments = normalizedType.includes('json')
    ? parseJsonTranscript(raw)
    : parseTimedText(raw)
  const speakerIds = new Map<string, string>()
  const lines = segments.map((segment, index) => {
    const line = lineFromSegment(
      contentId,
      index,
      segment.startMs,
      segment.endMs,
      segment.text,
      segment.words
    )
    if (segment.speakerName) {
      let speakerId = speakerIds.get(segment.speakerName)
      if (!speakerId) {
        speakerId = `publisher:${speakerIds.size + 1}`
        speakerIds.set(segment.speakerName, speakerId)
      }
      line.speakerId = speakerId
    }
    return line
  })
  return {
    protocolVersion: 2,
    contentId,
    revision: 1,
    state: 'ready',
    source: 'publisher',
    language,
    isPartial: false,
    lines,
    speakers: [...speakerIds].map(([name, id]) => ({ id, name, origin: 'publisher' })),
  }
}

interface SegmentWord {
  startMs: number
  endMs: number
  text: string
}

interface Segment {
  startMs: number
  endMs: number
  text: string
  speakerName?: string
  words?: SegmentWord[]
}

const parseTimedText = (raw: string): Segment[] => {
  const blocks = raw.replace(/^\uFEFF/, '').split(/\r?\n\s*\r?\n/)
  const result: Segment[] = []
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim())
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) continue
    const [start, end] = lines[timingIndex].split('-->').map((part) => part.trim().split(/\s+/)[0])
    const startMs = parseTimestamp(start)
    const endMs = parseTimestamp(end)
    const cue = lines.slice(timingIndex + 1).join(' ')
    const speakerName = cue.match(/<v(?:\.[^\s>]+)*(?:\s+([^>]+))?>/i)?.[1]?.trim()
    const text = cue
      .replace(/<[^>]+>/g, '')
      .trim()
    if (endMs > startMs && text) result.push({ startMs, endMs, text, speakerName })
  }
  return result
}

const parseJsonTranscript = (raw: string): Segment[] => {
  const value = JSON.parse(raw) as unknown
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as any).segments ??
        (value as any).items ??
        (value as any).transcript ??
        (value as any).transcription ??
        [])
      : []
  if (!Array.isArray(candidates)) return []
  return candidates
    .map((item): Segment | null => {
      if (!item || typeof item !== 'object') return null
      const start = Number(
        (item as any).offsets?.from ??
          (item as any).startTime ??
          (item as any).start ??
          (item as any).start_ms
      )
      const end = Number(
        (item as any).offsets?.to ?? (item as any).endTime ?? (item as any).end ?? (item as any).end_ms
      )
      const milliseconds =
        (item as any).offsets?.from != null ||
        (item as any).start_ms != null ||
        (item as any).end_ms != null
      const text = String((item as any).body ?? (item as any).text ?? '').trim()
      const speaker = (item as any).speaker
      const speakerName = String(
        (typeof speaker === 'object' ? speaker?.name ?? speaker?.label : speaker) ??
          (item as any).speaker_name ??
          (item as any).speakerLabel ??
          ''
      ).trim()
      if (!Number.isFinite(start) || !Number.isFinite(end) || !text) return null
      const words = parseJsonWords(item as Record<string, unknown>)
      return {
        startMs: Math.round(milliseconds ? start : start * 1_000),
        endMs: Math.round(milliseconds ? end : end * 1_000),
        text,
        speakerName: speakerName || undefined,
        words,
      }
    })
    .filter((item): item is Segment => item != null && item.endMs > item.startMs)
}

const parseJsonWords = (item: Record<string, unknown>): Segment['words'] => {
  const candidates = Array.isArray((item as any).tokens)
    ? (item as any).tokens
    : Array.isArray((item as any).words)
      ? (item as any).words
      : []
  const words = candidates
    .map((word: unknown) => {
      if (!word || typeof word !== 'object') return null
      const value = word as any
      const start = Number(value.offsets?.from ?? value.start_ms ?? value.startTime ?? value.start)
      const end = Number(value.offsets?.to ?? value.end_ms ?? value.endTime ?? value.end)
      const milliseconds =
        value.offsets?.from != null || value.start_ms != null || value.end_ms != null
      const text = String(value.text ?? value.word ?? '').trim()
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return null
      return {
        startMs: Math.round(milliseconds ? start : start * 1_000),
        endMs: Math.round(milliseconds ? end : end * 1_000),
        text,
      }
    })
    .filter((word: SegmentWord | null): word is SegmentWord => word != null)
  return words.length > 0 ? words : undefined
}

const parseTimestamp = (raw: string) => {
  const normalized = raw.replace(',', '.')
  const parts = normalized.split(':')
  if (parts.length < 2 || parts.length > 3) return 0
  const seconds = Number(parts.pop())
  const minutes = Number(parts.pop())
  const hours = Number(parts.pop() ?? 0)
  if (![seconds, minutes, hours].every(Number.isFinite)) return 0
  return Math.round((hours * 3_600 + minutes * 60 + seconds) * 1_000)
}
