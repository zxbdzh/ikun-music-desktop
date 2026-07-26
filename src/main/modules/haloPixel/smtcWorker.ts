import type { MediaInfo, SMTCMonitor as SMTCMonitorInstance } from '@coooookies/windows-smtc-monitor'

// 这是一个 Electron utilityProcess 子进程:专门承载 @coooookies/windows-smtc-monitor 的
// 原生同步 WinRT 调用。原因——在 Electron 主进程(COM STA 消息泵线程)里 new SMTCMonitor()
// 会同步阻塞在 WinRT 异步操作上,造成主线程死锁(整个应用卡死)。子进程没有 STA 消息泵,
// 同样的调用可在数十毫秒内返回。子进程只负责采集「正在播放」的外部会话快照,防抖后回传主进程。

const PLAYBACK_PLAYING = 4
const DEBOUNCE_MS = 200

interface PlayingSession {
  sourceAppId: string
  title: string
  artist: string
  lastUpdatedTime: number
}

const parentPort = process.parentPort
const post = (msg: unknown): void => {
  try {
    parentPort?.postMessage(msg)
  } catch {}
}

type SmtcModule = typeof import('@coooookies/windows-smtc-monitor')
let mod: SmtcModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('@coooookies/windows-smtc-monitor') as SmtcModule
} catch (err) {
  post({ type: 'error', message: `load failed: ${String(err)}` })
}

let monitor: SMTCMonitorInstance | null = null
let debounceTimer: NodeJS.Timeout | null = null

// 采集当前所有 PLAYING(playbackStatus===4)且标题非空的外部会话,回传主进程。
// 不做「是否本软件」过滤——交由主进程结合 player_status 判定(子进程拿不到 player_status)。
const collect = (): void => {
  if (!mod) return
  let sessions: MediaInfo[]
  try {
    sessions = mod.SMTCMonitor.getMediaSessions()
  } catch {
    return
  }
  const result: PlayingSession[] = []
  for (const info of sessions) {
    if (info.playback.playbackStatus !== PLAYBACK_PLAYING) continue
    result.push({
      sourceAppId: info.sourceAppId,
      title: (info.media.title ?? '').trim(),
      artist: (info.media.artist ?? '').trim(),
      lastUpdatedTime: info.lastUpdatedTime,
    })
  }
  post({ type: 'sessions', sessions: result })
}

// 多个 SMTC 事件可能在极短时间内连续触发(切歌会同时改标题/播放态),统一防抖后采集一次。
const fire = (): void => {
  if (debounceTimer) return
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    collect()
  }, DEBOUNCE_MS)
}

if (mod) {
  try {
    monitor = new mod.SMTCMonitor()
  } catch (err) {
    post({ type: 'error', message: `init failed: ${String(err)}` })
    monitor = null
  }
  if (monitor) {
    monitor.on('session-media-changed', fire)
    monitor.on('session-playback-changed', fire)
    monitor.on('session-added', fire)
    monitor.on('session-removed', fire)
    monitor.on('current-session-changed', fire)
    fire() // 首帧主动采集一次当前外部会话
  }
}

parentPort?.on('message', (e: Electron.MessageEvent) => {
  if (e?.data === 'dispose') {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    try {
      monitor?.destroy()
    } catch {}
    monitor = null
    process.exit(0)
  }
})
