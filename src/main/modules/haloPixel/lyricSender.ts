import type { HaloPixelDevice } from './device'
import { buildLayoutPacket, buildTextPacket, buildUIModelPacket, displayWidth, fitsSinglePacket, TEXT_BYTE_BUDGET } from './protocol'
import type { CharTiming } from './lyricTimer'

export interface LyricSenderOptions {
  autoScroll: boolean
  scrollThreshold: number
  typewriter: boolean
  typewriterSpeed: number
  typewriterSync: boolean
  playbackRate: number
  alternateSplit: boolean
  alternateInterval: number
  latencyCompMs: number
}

const FLUSH_DELAY = 30
const MIN_ALTERNATE_INTERVAL = 1000
const CLOCK_TICK = 50

// Split text into two halves by display width, respecting CJK double-width chars.
const splitByWidth = (text: string, maxWidth: number): [string, string] => {
  const chars = [...text]
  let width = 0
  let splitIdx = chars.length
  for (let i = 0; i < chars.length; i++) {
    const cw = (chars[i].codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1
    if (width + cw > maxWidth) {
      splitIdx = i
      break
    }
    width += cw
  }
  if (splitIdx === 0) splitIdx = 1 // always show at least one character
  return [chars.slice(0, splitIdx).join(''), chars.slice(splitIdx).join('')]
}

export class LyricSender {
  private lastText: string | null = null
  private showingClock = false
  private flushTimer: NodeJS.Timeout | null = null
  private typeTimers: NodeJS.Timeout[] = []
  private altTimer: NodeJS.Timeout | null = null
  private pendingLine: string | null = null
  private pendingTimings: CharTiming[] | null = null
  private pendingLineDurationMs = 0
  private pendingProgressMs = 0
  private pendingAnchorWallMs = 0
  private pendingAnchorMs = 0
  private lastAnchorMs = 0
  private currentTypeText: string | null = null

  constructor(
    private readonly device: HaloPixelDevice,
    private options: LyricSenderOptions,
  ) {}

  setOptions(options: LyricSenderOptions): void {
    this.options = options
  }

  updateProgressMs(progressMs: number): void {
    this.pendingProgressMs = progressMs
    // Pair the playback position with a wall-clock reading so the typewriter clock
    // can interpolate the live position later instead of relying on a stale anchor.
    this.pendingAnchorWallMs = Date.now()
  }

  reset(): void {
    this.clearFlush()
    this.stopTypewriter()
    this.stopAlternation()
    this.pendingLine = null
    this.pendingTimings = null
    this.lastText = null
    this.lastAnchorMs = 0
    this.showingClock = false
  }

  private clearFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  private stopTypewriter(): void {
    // Finish displaying the current typewriter text before stopping
    if (this.currentTypeText) {
      this.device.write(buildTextPacket(this.currentTypeText))
      this.currentTypeText = null
    }
    for (const t of this.typeTimers) clearTimeout(t)
    this.typeTimers = []
  }

  private stopAlternation(): void {
    if (this.altTimer) {
      clearInterval(this.altTimer)
      this.altTimer = null
    }
  }

  // 显示路径绝不能阻塞:已连接才写设备,未连接时只触发一次后台异步重连(openAsync 内有
  // 重入守卫,与 3s 重连循环并发也只跑一次枚举),本轮显示直接放弃,待连上后的下一次刷新生效。
  private ensureOpen(): boolean {
    if (this.device.isConnected) return true
    void this.device.openAsync()
    return false
  }

  sendLyric(
    text: string | null | undefined,
    timings: CharTiming[] | null = null,
    lineDurationMs = 0,
    anchorMs = 0,
  ): void {
    this.pendingLine = (text ?? '').trim()
    this.pendingTimings = timings
    this.pendingLineDurationMs = lineDurationMs
    this.pendingAnchorMs = anchorMs
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flush()
    }, FLUSH_DELAY)
  }

  private flush(): void {
    this.flushTimer = null
    const line = this.pendingLine
    const timings = this.pendingTimings
    const lineDurationMs = this.pendingLineDurationMs
    const anchorMs = this.pendingAnchorMs
    this.pendingLine = null
    this.pendingTimings = null
    this.pendingLineDurationMs = 0
    if (!line) return
    // 同一行文本只在锚点未明显跳变时去重;锚点大幅变化(相邻重复歌词、行内拖动进度)时仍需重渲染
    if (!this.showingClock && line === this.lastText && Math.abs(anchorMs - this.lastAnchorMs) < 500) return
    if (!this.ensureOpen()) return

    this.stopTypewriter()
    this.stopAlternation()
    this.showingClock = false
    this.lastText = line
    this.lastAnchorMs = anchorMs

    const isLong = displayWidth(line) > this.options.scrollThreshold
    if (isLong && this.options.alternateSplit) {
      this.startAlternation(line, lineDurationMs)
    } else if (isLong && this.options.autoScroll) {
      // Hardware scroll can only marquee what fits in one 64-byte packet (~18 CJK
      // chars). Longer lines would have their tail silently dropped, so fall back
      // to a software window marquee that pages the whole line through the display.
      if (fitsSinglePacket(line)) {
        this.typeFullThenStart(line, lineDurationMs, () => {
          this.device.write(buildLayoutPacket('scrollRight'))
          this.device.write(buildTextPacket(line))
        })
      } else {
        this.startMarquee(line, lineDurationMs)
      }
    } else if (this.options.typewriter && this.options.typewriterSync && timings?.length) {
      this.startTypewriterSync(line, timings)
    } else if (this.options.typewriter) {
      this.startTypewriter(line, lineDurationMs)
    } else {
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(line))
    }
  }

  // For long lines: reveal the full text character-by-character first, then
  // trigger the secondary effect (alternation or scroll). The reveal is paced to
  // finish within the first half of the line so the effect still has time to run.
  // Per-character sync timing is intentionally NOT used here: it would end the
  // reveal at the line's last character (≈ line end), leaving no time to scroll
  // before the next line arrives.
  private typeFullThenStart(text: string, lineDurationMs: number, andThen: () => void): void {
    if (!this.options.typewriter) {
      // No typewriter: show full text centered, then immediately start effect
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(text))
      andThen()
      return
    }

    const chars = [...text]
    let pos = 0
    this.currentTypeText = text

    const budget = lineDurationMs > 0 ? lineDurationMs / 2 : Infinity
    const maxInterval = Math.floor(budget / Math.max(chars.length, 1))
    const interval = Math.min(Math.max(this.options.typewriterSpeed, 30), maxInterval)

    this.device.write(buildLayoutPacket('center'))

    const finish = (): void => {
      this.currentTypeText = null
      this.stopTypewriter() // clears the reveal interval before the effect starts
      andThen()
    }
    const tick = (): void => {
      if (!this.device.write(buildTextPacket(chars.slice(0, pos + 1).join('')))) {
        this.currentTypeText = null
        this.stopTypewriter()
        return
      }
      pos++
      if (pos >= chars.length) finish()
    }

    tick()
    if (pos < chars.length) {
      const t = setInterval(() => tick(), interval)
      this.typeTimers.push(t as unknown as NodeJS.Timeout)
    }
  }

  // Software marquee for lines too long to fit a single hardware-scroll packet.
  // Slides a display-width window across the full text (capped to the packet byte
  // budget so an over-large scrollThreshold can never overflow), holds briefly at
  // both ends, then loops. Reuses altTimer so flush/reset/showClock clean it up.
  private startMarquee(text: string, lineDurationMs = 0): void {
    const chars = [...text]
    const width = this.options.scrollThreshold
    const charWidth = (ch: string): number => ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1)

    // Smallest start index whose remaining suffix already fits the window — the
    // frame at which the line's tail becomes fully visible.
    let lastStart = chars.length
    let tailWidth = 0
    let tailBytes = 0
    while (lastStart > 0) {
      const ch = chars[lastStart - 1]
      const cb = Buffer.byteLength(ch, 'utf8')
      if (tailWidth + charWidth(ch) > width || tailBytes + cb > TEXT_BYTE_BUDGET) break
      tailWidth += charWidth(ch)
      tailBytes += cb
      lastStart--
    }
    if (lastStart <= 0) {
      // Whole line fits the window after all; show it once.
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(text))
      return
    }

    const windowAt = (start: number): string => {
      let w = 0
      let b = 0
      let end = start
      while (end < chars.length) {
        const cb = Buffer.byteLength(chars[end], 'utf8')
        if (w + charWidth(chars[end]) > width || b + cb > TEXT_BYTE_BUDGET) break
        w += charWidth(chars[end])
        b += cb
        end++
      }
      return chars.slice(start, end).join('')
    }

    const HOLD = 800 // pause at the first and last frame for readability
    const step =
      lineDurationMs > 0 ? Math.max(Math.floor((lineDurationMs - 2 * HOLD) / lastStart), 120) : 300

    this.device.write(buildLayoutPacket('center'))

    let start = 0
    const tick = (): void => {
      if (this.lastText !== text) return // line changed; abandon the chain
      if (!this.device.write(buildTextPacket(windowAt(start)))) return
      const atEnd = start >= lastStart
      const delay = atEnd || start === 0 ? HOLD + step : step
      start = atEnd ? 0 : start + 1
      this.altTimer = setTimeout(tick, delay) as unknown as NodeJS.Timeout
    }
    tick()
  }

  // "逐字截断": reveal the first screen-segment character-by-character, hold for
  // alternateInterval, then reveal the second segment character-by-character,
  // replacing the first. Ends on the second segment (no looping). When the line
  // turns out to fit one screen, just show/type it once. Honors the typewriter
  // option: with it off, each segment is shown instantly instead of typed.
  private startAlternation(text: string, lineDurationMs = 0): void {
    const [first, second] = splitByWidth(text, this.options.scrollThreshold)
    if (!second) {
      if (this.options.typewriter) {
        this.startTypewriter(first, lineDurationMs)
      } else {
        this.device.write(buildLayoutPacket('center'))
        this.device.write(buildTextPacket(first))
      }
      return
    }

    const hold = Math.max(this.options.alternateInterval, MIN_ALTERNATE_INTERVAL)
    // Share the line's time budget between the two segments, reserving the hold gap.
    const segBudget = lineDurationMs > 0 ? Math.max((lineDurationMs - hold) / 2, 0) : 0

    const showSecond = (): void => {
      if (this.lastText !== text) return // line already changed
      if (this.options.typewriter) {
        this.startTypewriter(second, segBudget)
      } else {
        this.device.write(buildLayoutPacket('center'))
        this.device.write(buildTextPacket(second))
      }
    }

    if (this.options.typewriter) {
      this.startTypewriter(first, segBudget, () => {
        this.altTimer = setTimeout(showSecond, hold) as unknown as NodeJS.Timeout
      })
    } else {
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(first))
      this.altTimer = setTimeout(showSecond, hold) as unknown as NodeJS.Timeout
    }
  }

  private startTypewriter(text: string, lineDurationMs = 0, onDone: (() => void) | null = null): void {
    const chars = [...text]
    let pos = 0
    this.currentTypeText = text

    // Cap interval so all characters finish before the next line arrives
    const maxInterval = lineDurationMs > 0 ? Math.floor(lineDurationMs / chars.length) : Infinity
    const interval = Math.min(Math.max(this.options.typewriterSpeed, 30), maxInterval)

    this.device.write(buildLayoutPacket('center'))
    const tick = (): void => {
      if (!this.device.write(buildTextPacket(chars.slice(0, pos + 1).join('')))) {
        this.stopTypewriter()
        return
      }
      pos++
      if (pos >= chars.length) {
        this.currentTypeText = null
        this.stopTypewriter()
      }
    }
    tick()
    if (pos < chars.length) {
      const t = setInterval(() => {
        tick()
      }, interval)
      this.typeTimers.push(t as unknown as NodeJS.Timeout)
    }
  }

  // Drive the reveal from a live, wall-clock-anchored playback estimate rather than
  // pre-scheduling one timeout per char. Each tick recomputes the estimated playback
  // position (anchor + elapsed wall time * rate + latency compensation) and shows the
  // chars whose start time has passed. This self-corrects FLUSH_DELAY/IPC lag, never
  // accumulates timer drift, and re-bases automatically on the next flush after a seek
  // or rate change. Device writes happen only when the visible count grows.
  private startTypewriterSync(text: string, timings: CharTiming[]): void {
    const chars = [...text]
    if (!chars.length) return

    const rate = this.options.playbackRate || 1
    const anchorPlaybackMs = this.pendingProgressMs
    const anchorWallMs = this.pendingAnchorWallMs || Date.now()
    const lineStartMs = timings[0].startMs

    // If the anchor is missing or wildly off the timing data (stale progress or a
    // seek not yet reflected), fall back to plain speed-based typewriter.
    if (anchorPlaybackMs === 0 || Math.abs(anchorPlaybackMs - lineStartMs) > 5000) {
      const last = timings[timings.length - 1]
      this.startTypewriter(text, last.startMs + last.durationMs - lineStartMs)
      return
    }

    this.device.write(buildLayoutPacket('center'))
    this.currentTypeText = text

    const limit = Math.min(chars.length, timings.length)
    let lastCount = 0
    const render = (): void => {
      if (this.lastText !== text) return // line changed; abandon the clock
      const est = anchorPlaybackMs + (Date.now() - anchorWallMs) * rate + this.options.latencyCompMs
      let count = 0
      for (let i = 0; i < limit; i++) {
        if (timings[i].startMs <= est) count = i + 1
        else break
      }
      if (count > lastCount) {
        lastCount = count
        if (!this.device.write(buildTextPacket(chars.slice(0, count).join('')))) {
          this.stopTypewriter()
          return
        }
      }
      if (count >= chars.length) {
        this.currentTypeText = null
        this.stopTypewriter()
      }
    }

    render() // show the already-elapsed prefix immediately
    if (lastCount < chars.length) {
      const t = setInterval(render, CLOCK_TICK)
      this.typeTimers.push(t as unknown as NodeJS.Timeout)
    }
  }

  // Plain-text display for the SMTC mirror: no typewriter / sync / alternation. The dedup
  // check comes first so a still-scrolling long title isn't torn down and restarted on every
  // debounce tick. Long titles reuse startMarquee with duration 0 → continuous looping scroll.
  showText(text: string | null | undefined): void {
    const line = (text ?? '').trim()
    if (!line) return
    if (!this.showingClock && line === this.lastText) return
    if (!this.ensureOpen()) return
    this.clearFlush()
    this.stopTypewriter()
    this.stopAlternation()
    this.pendingLine = null
    this.pendingTimings = null
    this.showingClock = false
    this.lastText = line
    this.lastAnchorMs = 0
    if (displayWidth(line) > this.options.scrollThreshold) {
      this.startMarquee(line, 0)
    } else {
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(line))
    }
  }

  showClock(): void {
    this.clearFlush()
    this.stopTypewriter()
    this.stopAlternation()
    this.pendingLine = null
    this.pendingTimings = null
    if (this.showingClock) return
    if (!this.ensureOpen()) return
    if (this.device.write(buildUIModelPacket('clock'))) {
      this.showingClock = true
      this.lastText = null
    }
  }
}
