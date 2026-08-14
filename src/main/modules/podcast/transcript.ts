export interface TimedTranscriptWord {
  startMs: number
  endMs: number
  text: string
}

export const transcriptDescriptor = (
  snapshot: LX.Podcast.TranscriptSnapshot
): LX.Podcast.TranscriptDescriptor => ({
  protocolVersion: 2,
  contentId: snapshot.contentId,
  revision: snapshot.revision,
  state: snapshot.state,
  isPartial: snapshot.isPartial,
})

export const createTranscriptDelta = (
  snapshot: LX.Podcast.TranscriptSnapshot,
  sinceRevision = 0,
  baseSnapshot?: LX.Podcast.TranscriptSnapshot | null
): LX.Podcast.TranscriptDelta => {
  const isCurrent = sinceRevision === snapshot.revision
  const canDiff =
    !isCurrent &&
    sinceRevision > 0 &&
    sinceRevision < snapshot.revision &&
    baseSnapshot?.contentId === snapshot.contentId &&
    baseSnapshot.revision === sinceRevision
  const reset = !isCurrent && !canDiff
  const previousLines = canDiff
    ? new Map(baseSnapshot.lines.map((line) => [line.id, JSON.stringify(line)]))
    : new Map<string, string>()
  const currentIds = new Set(snapshot.lines.map((line) => line.id))
  return {
    protocolVersion: 2,
    contentId: snapshot.contentId,
    baseRevision: sinceRevision,
    revision: snapshot.revision,
    reset,
    state: snapshot.state,
    isPartial: snapshot.isPartial,
    upsertLines: isCurrent
      ? []
      : reset
        ? snapshot.lines
        : snapshot.lines.filter((line) => previousLines.get(line.id) !== JSON.stringify(line)),
    deletedLineIds: canDiff
      ? baseSnapshot.lines.filter((line) => !currentIds.has(line.id)).map((line) => line.id)
      : [],
    speakers: snapshot.speakers,
  }
}

export const lineFromSegment = (
  contentId: string,
  index: number | string,
  startMs: number,
  endMs: number,
  displayText: string,
  timedWords: readonly TimedTranscriptWord[] = []
): LX.Podcast.TranscriptLine => {
  const actualWords = timedWords.filter(
    (word) =>
      Number.isFinite(word.startMs) &&
      Number.isFinite(word.endMs) &&
      word.endMs > word.startMs &&
      word.text.trim()
  )
  let cursor = 0
  const words = actualWords.flatMap((word, wordIndex): LX.Podcast.Word[] => {
    const token = word.text.trim()
    const tokenIndex = displayText.indexOf(token, cursor)
    if (tokenIndex < 0) return []
    const wordStart = Math.max(startMs, Math.round(word.startMs))
    const wordEnd = Math.min(endMs, Math.round(word.endMs))
    if (wordEnd <= wordStart) return []
    cursor = tokenIndex + token.length
    return [{
      id: `${contentId}:${index}:${wordIndex}`,
      startIndex: tokenIndex,
      length: token.length,
      startMs: wordStart,
      endMs: wordEnd,
    }]
  })
  return {
    id: `${contentId}:${index}`,
    startMs,
    endMs,
    displayText,
    words,
  }
}
