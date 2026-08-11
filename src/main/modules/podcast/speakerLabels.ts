import type { SpeakerDiarizationSegment } from './speakerDiarization'

export interface SpeakerLabelsResult {
  lines: LX.Podcast.TranscriptLine[]
  speakers: LX.Podcast.Speaker[]
}

export const applySpeakerLabels = (
  lines: LX.Podcast.TranscriptLine[],
  segments: SpeakerDiarizationSegment[]
): SpeakerLabelsResult => {
  const normalized = segments
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) &&
      segment.end > segment.start && Number.isSafeInteger(segment.speaker))
    .map((segment) => ({
      startMs: Math.round(segment.start * 1_000),
      endMs: Math.round(segment.end * 1_000),
      speaker: segment.speaker,
    }))
    .sort((left, right) => left.startMs - right.startMs || left.speaker - right.speaker)

  const stableIds = new Map<number, string>()
  const labeledLines = lines.map((line) => {
    let selected: typeof normalized[number] | undefined
    let selectedOverlap = 0
    for (const segment of normalized) {
      if (segment.startMs >= line.endMs) break
      const overlap = Math.max(0, Math.min(line.endMs, segment.endMs) -
        Math.max(line.startMs, segment.startMs))
      if (overlap > selectedOverlap) {
        selected = segment
        selectedOverlap = overlap
      }
    }
    if (!selected) return { ...line, speakerId: undefined }
    let speakerId = stableIds.get(selected.speaker)
    if (!speakerId) {
      speakerId = `speaker-${stableIds.size + 1}`
      stableIds.set(selected.speaker, speakerId)
    }
    return { ...line, speakerId }
  })

  return {
    lines: labeledLines,
    speakers: [...stableIds.values()].map((id, index) => ({
      id,
      name: `说话人 ${index + 1}`,
      origin: 'local',
    })),
  }
}

export const reuseSpeakerLabels = (
  lines: LX.Podcast.TranscriptLine[],
  reference: LX.Podcast.TranscriptSnapshot
): SpeakerLabelsResult => {
  const knownSpeakers = new Set(reference.speakers.map((speaker) => speaker.id))
  const timedLabels = reference.lines.filter(
    (line) => line.speakerId && knownSpeakers.has(line.speakerId)
  )
  return {
    lines: lines.map((line) => {
      let speakerId: string | undefined
      let selectedOverlap = 0
      for (const referenceLine of timedLabels) {
        if (referenceLine.startMs >= line.endMs) break
        const overlap = Math.max(0, Math.min(line.endMs, referenceLine.endMs) -
          Math.max(line.startMs, referenceLine.startMs))
        if (overlap > selectedOverlap) {
          speakerId = referenceLine.speakerId
          selectedOverlap = overlap
        }
      }
      return speakerId ? { ...line, speakerId } : line
    }),
    speakers: reference.speakers,
  }
}
