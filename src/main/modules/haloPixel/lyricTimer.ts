// Parses two lyric formats to produce per-character timings:
// 1. lxlrc (逐字歌词): <startMs,durationMs>text — exact per-character timing
// 2. Plain LRC: [mm:ss.ms]text — even distribution across each line's duration
//    (line duration inferred from the next line's time tag)

export interface CharTiming {
  text: string
  /** Absolute milliseconds from the beginning of the song */
  startMs: number
  durationMs: number
}

interface LxParsedLine {
  plainText: string
  charTimings: CharTiming[]
}

interface LrcLine {
  timeMs: number
  text: string
}

const DEFAULT_LINE_DURATION = 5000

// ---- lxlrc parser ----

const lxTagExp = /<(\d+),(\d+)>([^<]*)/g

const parseLxlyric = (lrc: string): LxParsedLine[] => {
  const lines: LxParsedLine[] = []
  for (const rawLine of lrc.split(/\r\n|\r|\n/)) {
    const chars: CharTiming[] = []
    let plainText = ''
    for (const m of rawLine.matchAll(lxTagExp)) {
      const startMs = parseInt(m[1])
      const durationMs = parseInt(m[2])
      const text = m[3]
      if (!text) continue
      chars.push({ text, startMs, durationMs })
      plainText += text
    }
    if (chars.length) lines.push({ plainText, charTimings: chars })
  }
  return lines
}

// ---- plain LRC parser (fallback) ----

const lrcTimeExp = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?]/

const parseLrc = (lrc: string): LrcLine[] => {
  const lines: LrcLine[] = []
  for (const raw of lrc.split(/\r\n|\r|\n/)) {
    const timeTags = raw.match(/\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?]/g)
    if (!timeTags) continue
    const text = raw.replace(/\[[^\]]*]/g, '').trim()
    if (!text) continue
    for (const tag of timeTags) {
      const m = lrcTimeExp.exec(tag)
      if (!m) continue
      const min = parseInt(m[1])
      const sec = parseInt(m[2])
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3)) : 0
      lines.push({ timeMs: min * 60000 + sec * 1000 + ms, text })
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

const buildFallbackTimings = (line: LrcLine, lineDuration: number, chars: string[]): CharTiming[] => {
  const dur = Math.max(lineDuration, 500) / chars.length
  return chars.map((c, i) => ({
    text: c,
    startMs: line.timeMs + Math.round(i * dur),
    durationMs: Math.round(dur),
  }))
}

// ---- LyricTimer ----

export class LyricTimer {
  // lxlrc source (preferred)
  private lxlyric = ''
  private lxLines: LxParsedLine[] = []
  private lxIndex = -1

  // plain LRC source (fallback)
  private lrc = ''
  private lrcLines: LrcLine[] = []
  private lrcIndex = -1

  updateLxlyric(lxlyric: string): void {
    if (lxlyric === this.lxlyric) return
    this.lxlyric = lxlyric
    this.lxLines = parseLxlyric(lxlyric)
    this.lxIndex = -1
  }

  updateLyric(lrc: string): void {
    if (lrc === this.lrc) return
    this.lrc = lrc
    this.lrcLines = parseLrc(lrc)
    this.lrcIndex = -1
  }

  getTimings(text: string): CharTiming[] | null {
    return this.getTimingsWithDuration(text).timings
  }

  getTimingsWithDuration(text: string): { timings: CharTiming[] | null; lineDurationMs: number } {
    if (!text) return { timings: null, lineDurationMs: 0 }

    // Try lxlrc first (exact per-char timing)
    if (this.lxLines.length) {
      const idx = this.findLxIndex(text)
      if (idx >= 0) {
        const timings = this.lxLines[idx].charTimings
        if (timings.length && !timings.every((c) => c.startMs === 0 && c.durationMs === 0)) {
          const durationMs = timings[timings.length - 1].startMs + timings[timings.length - 1].durationMs - timings[0].startMs
          return { timings, lineDurationMs: durationMs }
        }
      }
    }

    // Fall back to plain LRC (even distribution)
    if (this.lrcLines.length) {
      const idx = this.findLrcIndex(text)
      if (idx >= 0) {
        const line = this.lrcLines[idx]
        const nextTime = idx + 1 < this.lrcLines.length
          ? this.lrcLines[idx + 1].timeMs
          : line.timeMs + DEFAULT_LINE_DURATION
        const durationMs = nextTime - line.timeMs
        return { timings: buildFallbackTimings(line, durationMs, [...text]), lineDurationMs: durationMs }
      }
    }

    return { timings: null, lineDurationMs: 0 }
  }

  private findLxIndex(text: string): number {
    const n = this.lxLines.length
    for (let i = 0; i < n; i++) {
      const idx = (this.lxIndex + 1 + i) % n
      if (this.lxLines[idx].plainText === text) {
        this.lxIndex = idx
        return idx
      }
    }
    return -1
  }

  private findLrcIndex(text: string): number {
    const n = this.lrcLines.length
    for (let i = 0; i < n; i++) {
      const idx = (this.lrcIndex + 1 + i) % n
      if (this.lrcLines[idx].text === text) {
        this.lrcIndex = idx
        return idx
      }
    }
    return -1
  }
}
