import { utilityProcess, type UtilityProcess } from 'electron'
import path from 'node:path'

interface PlayingSession {
  sourceAppId: string
  title: string
  artist: string
  lastUpdatedTime: number
}

interface SessionsMessage {
  type: 'sessions'
  sessions: PlayingSession[]
}
interface ErrorMessage {
  type: 'error'
  message: string
}
type WorkerMessage = SessionsMessage | ErrorMessage

let child: UtilityProcess | null = null
let sessions: PlayingSession[] = []
const subscribers = new Set<() => void>()
let legacyUnsubscribe: (() => void) | null = null
let loadFailed = false
let isStopping = false

export const isAvailable = (): boolean => process.platform === 'win32' && !loadFailed

const notify = (): void => {
  for (const listener of subscribers) listener()
}

const stopWorker = (): void => {
  sessions = []
  const worker = child
  if (!worker) return
  child = null
  isStopping = true
  try {
    worker.postMessage('dispose')
  } catch {}
  try {
    worker.kill()
  } catch {}
}

const startWorker = (): void => {
  if (child || !isAvailable()) return
  const scriptPath = path.join(__dirname, 'smtcWorker.js')
  try {
    const worker = utilityProcess.fork(scriptPath, [], { serviceName: 'smtc-monitor' })
    child = worker
    worker.on('message', (msg: WorkerMessage) => {
      if (!msg) return
      if (msg.type === 'sessions') {
        sessions = msg.sessions ?? []
        notify()
      } else if (msg.type === 'error') {
        console.warn('[haloPixel] SMTC worker unavailable:', msg.message)
        loadFailed = true
        sessions = []
        stopWorker()
        notify()
      }
    })
    worker.on('exit', () => {
      if (child === worker) child = null
      if (isStopping) {
        isStopping = false
        return
      }
      loadFailed = true
      sessions = []
      notify()
    })
  } catch (err) {
    console.warn('[haloPixel] SMTC utilityProcess fork failed:', err)
    child = null
    loadFailed = true
    notify()
    return
  }
}

/**
 * Subscribe to cached Windows SMTC playing sessions. Every subscriber shares one worker.
 */
export const subscribe = (onChange: () => void): (() => void) => {
  subscribers.add(onChange)
  startWorker()
  return () => {
    subscribers.delete(onChange)
    if (!subscribers.size) stopWorker()
  }
}

// Compatibility facade for HaloPixel's existing lifecycle.
export const start = (onChange: () => void): void => {
  legacyUnsubscribe?.()
  legacyUnsubscribe = subscribe(onChange)
}

export const stop = (): void => {
  legacyUnsubscribe?.()
  legacyUnsubscribe = null
}

export const getPlayingSessions = (): readonly PlayingSession[] => sessions

export const getMirrorText = (excludeName: string, excludeSinger: string): string => {
  const exName = excludeName.trim()
  const exSinger = excludeSinger.trim()
  let best: PlayingSession | null = null
  for (const session of sessions) {
    if (!session.title) continue
    if (session.title === exName && session.artist === exSinger) continue
    if (!best || session.lastUpdatedTime > best.lastUpdatedTime) best = session
  }
  if (!best) return ''
  return best.artist ? `${best.title} - ${best.artist}` : best.title
}
