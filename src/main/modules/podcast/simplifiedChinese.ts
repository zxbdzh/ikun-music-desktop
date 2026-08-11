import { Converter } from 'opencc-js'

const toSimplified = Converter({ from: 'tw', to: 'cn' })

export const simplifyAsrText = (text: string) => toSimplified(text)

export const simplifyAsrLine = (
  line: LX.Podcast.TranscriptLine
): LX.Podcast.TranscriptLine => {
  const displayText = simplifyAsrText(line.displayText)
  if (displayText === line.displayText) return line

  let previousEnd = 0
  const words = line.words.flatMap((word): LX.Podcast.Word[] => {
    const sourceStart = Math.max(0, Math.min(line.displayText.length, word.startIndex))
    const sourceEnd = Math.max(sourceStart, Math.min(
      line.displayText.length,
      word.startIndex + word.length
    ))
    const startIndex = Math.max(
      previousEnd,
      Math.min(displayText.length, simplifyAsrText(line.displayText.slice(0, sourceStart)).length)
    )
    const endIndex = Math.max(
      startIndex,
      Math.min(displayText.length, simplifyAsrText(line.displayText.slice(0, sourceEnd)).length)
    )
    previousEnd = endIndex
    return endIndex > startIndex
      ? [{ ...word, startIndex, length: endIndex - startIndex }]
      : []
  })

  return { ...line, displayText, words }
}

export const simplifyAsrSnapshot = (
  snapshot: LX.Podcast.TranscriptSnapshot
): LX.Podcast.TranscriptSnapshot => {
  if (snapshot.source !== 'asr') return snapshot

  let changed = false
  const lines = snapshot.lines.map((line) => {
    const simplified = simplifyAsrLine(line)
    if (simplified !== line) changed = true
    return simplified
  })
  return changed ? { ...snapshot, lines } : snapshot
}
