import type { HaloPixelDevice } from './device'
import { buildLayoutPacket, buildTextPacket, buildUIModelPacket, displayWidth } from './protocol'
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
}

const FLUSH_DELAY = 30
const MIN_ALTERNATE_INTERVAL = 1000

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
  private pendingProgress = 0
  private currentTypeText: string | null = null

  constructor(
    private readonly device: HaloPixelDevice,
    private options: LyricSenderOptions,
  ) {}

  setOptions(options: LyricSenderOptions): void {
    this.options = options
  }

  updateProgress(progress: number): void {
    this.pendingProgress = progress
  }

  reset(): void {
    this.clearFlush()
    this.stopTypewriter()
    this.stopAlternation()
    this.pendingLine = null
    this.pendingTimings = null
    this.lastText = null
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

  private ensureOpen(): boolean {
    return this.device.isConnected || this.device.open()
  }

  sendLyric(text: string | null | undefined, timings: CharTiming[] | null = null, lineDurationMs = 0): void {
    this.pendingLine = (text ?? '').trim()
    this.pendingTimings = timings
    this.pendingLineDurationMs = lineDurationMs
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
    this.pendingLine = null
    this.pendingTimings = null
    this.pendingLineDurationMs = 0
    if (!line) return
    if (!this.showingClock && line === this.lastText) return
    if (!this.ensureOpen()) return

    this.stopTypewriter()
    this.stopAlternation()
    this.showingClock = false
    this.lastText = line

    const isLong = displayWidth(line) > this.options.scrollThreshold
    if (isLong && this.options.alternateSplit) {
      this.typeFullThenStart(line, timings, lineDurationMs, () => this.startAlternation(line, timings))
    } else if (isLong && this.options.autoScroll) {
      this.typeFullThenStart(line, timings, lineDurationMs, () => {
        this.device.write(buildLayoutPacket('scrollRight'))
        this.device.write(buildTextPacket(line))
      })
    } else if (this.options.typewriter && this.options.typewriterSync && timings?.length) {
      this.startTypewriterSync(line, timings)
    } else if (this.options.typewriter) {
      this.startTypewriter(line, lineDurationMs)
    } else {
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(line))
    }
  }

  // For long lines: show the full text first (typewriter or instant),
  // then trigger the secondary effect (alternation or scroll).
  private typeFullThenStart(
    text: string,
    timings: CharTiming[] | null,
    lineDurationMs: number,
    andThen: () => void,
  ): void {
    if (!this.options.typewriter) {
      // No typewriter: show full text centered, then immediately start effect
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(text))
      andThen()
      return
    }

    if (this.options.typewriterSync && timings?.length) {
      // Sync mode: use actual timing, schedule effect after last character
      const chars = [...text]
      const rate = this.options.playbackRate || 1
      const progressMs = this.pendingProgress * 1000
      this.currentTypeText = text

      this.device.write(buildLayoutPacket('center'))

      // Send already-visible characters
      let sentCount = 0
      for (let i = 0; i < chars.length && i < timings.length; i++) {
        if (timings[i].startMs <= progressMs) sentCount = i + 1
        else break
      }
      if (sentCount > 0) this.device.write(buildTextPacket(chars.slice(0, sentCount).join('')))

      if (sentCount >= chars.length) {
        this.currentTypeText = null
        andThen()
        return
      }

      for (let i = sentCount; i < chars.length && i < timings.length; i++) {
        const delay = (timings[i].startMs - progressMs) / rate
        if (delay < 0) {
          this.device.write(buildTextPacket(chars.slice(0, i + 1).join('')))
          continue
        }
        const isLast = i === chars.length - 1 || i === timings.length - 1
        const t = setTimeout(() => {
          if (this.lastText !== text) return
          this.device.write(buildTextPacket(chars.slice(0, i + 1).join('')))
          if (isLast) {
            this.currentTypeText = null
            andThen()
          }
        }, delay)
        this.typeTimers.push(t)
      }
    } else {
      // Non-sync typewriter: cap to half the line duration so effect still has time
      const chars = [...text]
      let pos = 0
      this.currentTypeText = text

      const halfDuration = lineDurationMs > 0 ? lineDurationMs / 2 : Infinity
      const maxInterval = Math.floor(halfDuration / Math.max(chars.length, 1))
      const interval = Math.min(Math.max(this.options.typewriterSpeed, 30), maxInterval)

      this.device.write(buildLayoutPacket('center'))

      const tick = (): void => {
        if (!this.device.write(buildTextPacket(chars.slice(0, pos + 1).join('')))) {
          this.currentTypeText = null
          this.stopTypewriter()
          return
        }
        pos++
        if (pos >= chars.length) {
          this.currentTypeText = null
          andThen()
        }
      }
      tick()
      if (pos < chars.length) {
        const t = setInterval(() => tick(), interval)
        this.typeTimers.push(t as unknown as NodeJS.Timeout)
      }
    }
  }

  private startAlternation(text: string, timings: CharTiming[] | null): void {
    const [first, second] = splitByWidth(text, this.options.scrollThreshold)
    if (!second) {
      // Text fits in one screen after all — just show it
      this.device.write(buildLayoutPacket('center'))
      this.device.write(buildTextPacket(first))
      return
    }

    const interval = Math.max(this.options.alternateInterval, MIN_ALTERNATE_INTERVAL)
    let showFirst = true

    this.device.write(buildLayoutPacket('center'))
    this.device.write(buildTextPacket(first))

    this.altTimer = setInterval(() => {
      showFirst = !showFirst
      const half = showFirst ? first : second
      this.device.write(buildTextPacket(half))
    }, interval) as unknown as NodeJS.Timeout
  }

  private startTypewriter(text: string, lineDurationMs = 0): void {
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

  private startTypewriterSync(text: string, timings: CharTiming[]): void {
    const chars = [...text]
    if (!chars.length) return

    this.device.write(buildLayoutPacket('center'))

    const rate = this.options.playbackRate || 1
    const progressMs = this.pendingProgress * 1000
    const lineStartMs = timings[0].startMs
    const drift = Math.abs(progressMs - lineStartMs)

    // If progress is wildly off from the timing data (stale progress or seek),
    // fall back to non-sync typewriter to avoid scheduling all characters at once.
    if (drift > 5000 || progressMs === 0) {
      this.startTypewriter(text, 0)
      return
    }

    let sentCount = 0

    // Send characters that should already be visible
    for (let i = 0; i < chars.length && i < timings.length; i++) {
      if (timings[i].startMs <= progressMs) {
        sentCount = i + 1
      } else {
        break
      }
    }
    if (sentCount > 0) {
      this.device.write(buildTextPacket(chars.slice(0, sentCount).join('')))
    }
    if (sentCount >= chars.length) {
      this.currentTypeText = null
      return
    }

    // Schedule remaining characters
    for (let i = sentCount; i < chars.length && i < timings.length; i++) {
      const delay = (timings[i].startMs - progressMs) / rate
      if (delay < 0) {
        this.device.write(buildTextPacket(chars.slice(0, i + 1).join('')))
        sentCount = i + 1
        continue
      }
      const isLast = i === chars.length - 1 || i === timings.length - 1
      const t = setTimeout(() => {
        if (this.lastText !== text) return
        this.device.write(buildTextPacket(chars.slice(0, i + 1).join('')))
        if (isLast) this.currentTypeText = null
      }, delay)
      this.typeTimers.push(t)
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
