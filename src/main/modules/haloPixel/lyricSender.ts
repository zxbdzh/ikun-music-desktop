import type { HaloPixelDevice } from './device'
import { buildLayoutPacket, buildTextPacket, buildUIModelPacket, displayWidth, type HaloPixelLayout } from './protocol'

export interface LyricSenderOptions {
  autoScroll: boolean
  scrollThreshold: number
}

// Turns lyric lines into device packets, de-duplicating repeated frames and
// choosing a scrolling layout when a line is wider than the threshold.
export class LyricSender {
  private lastText: string | null = null
  private showingClock = false

  constructor(
    private readonly device: HaloPixelDevice,
    private options: LyricSenderOptions,
  ) {}

  setOptions(options: LyricSenderOptions): void {
    this.options = options
  }

  reset(): void {
    this.lastText = null
    this.showingClock = false
  }

  private ensureOpen(): boolean {
    return this.device.isConnected || this.device.open()
  }

  sendLyric(text: string | null | undefined): void {
    const line = (text ?? '').trim()
    if (!line) return // empty interlude line: keep the previous frame
    if (!this.showingClock && line === this.lastText) return
    if (!this.ensureOpen()) return

    const layout: HaloPixelLayout =
      this.options.autoScroll && displayWidth(line) > this.options.scrollThreshold ? 'scrollRight' : 'center'
    const ok = this.device.write(buildLayoutPacket(layout)) && this.device.write(buildTextPacket(line))
    if (ok) {
      this.lastText = line
      this.showingClock = false
    }
  }

  showClock(): void {
    if (this.showingClock) return
    if (!this.ensureOpen()) return
    if (this.device.write(buildUIModelPacket('clock'))) {
      this.showingClock = true
      this.lastText = null
    }
  }
}
