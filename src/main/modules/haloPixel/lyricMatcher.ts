interface LrcLine {
  time: number
  text: string
}

const timeTagExp = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?]/

const parseLrc = (lrc: string): LrcLine[] => {
  const lines: LrcLine[] = []
  for (const raw of lrc.split(/\r\n|\r|\n/)) {
    const timeTags = raw.match(/\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?]/g)
    if (!timeTags) continue
    const text = raw.replace(/\[[^\]]*]/g, '').trim()
    if (!text) continue
    for (const tag of timeTags) {
      const m = timeTagExp.exec(tag)
      if (!m) continue
      const min = parseInt(m[1])
      const sec = parseInt(m[2])
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3)) : 0
      lines.push({ time: min * 60000 + sec * 1000 + ms, text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

// Maps the current original lyric line to its translated/romanized line.
// Original and extended LRC share the same time axis, so we locate the current
// original line (advancing a pointer to disambiguate repeated lines) and look up
// the extended text by timestamp. Falls back to the original text on any miss.
export class LyricMatcher {
  private origLrc = ''
  private extLrc = ''
  private origLines: LrcLine[] = []
  private extMap = new Map<number, string>()
  private pointer = 0

  resolve(text: string, origLrc: string, extLrc: string): string {
    if (!text || !extLrc || !origLrc) return text

    if (origLrc !== this.origLrc) {
      this.origLrc = origLrc
      this.origLines = parseLrc(origLrc)
      this.pointer = 0
    }
    if (extLrc !== this.extLrc) {
      this.extLrc = extLrc
      this.extMap = new Map(parseLrc(extLrc).map((l) => [l.time, l.text]))
    }

    const idx = this.findIndex(text)
    if (idx < 0) return text
    this.pointer = idx + 1
    return this.extMap.get(this.origLines[idx].time) ?? text
  }

  private findIndex(text: string): number {
    const n = this.origLines.length
    for (let i = 0; i < n; i++) {
      const idx = (this.pointer + i) % n
      if (this.origLines[idx].text === text) return idx
    }
    return -1
  }
}
