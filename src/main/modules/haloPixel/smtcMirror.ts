import { utilityProcess, type UtilityProcess } from 'electron'
import path from 'node:path'

// 主进程侧的 SMTC 镜像封装。真正的原生监听跑在 utilityProcess 子进程(smtcWorker.js)里——
// 因为 new SMTCMonitor() 的同步 WinRT 调用在主进程 COM STA 线程上会死锁(整个应用卡死)。
// 这里只负责:fork/kill 子进程、缓存子进程回传的「正在播放」会话快照,并在 getMirrorText 中
// 纯内存读取该缓存(绝不触碰原生模块,故主线程永不阻塞)。
// 非 Windows / fork 失败 / 子进程报告加载失败 → isAvailable()=false,全部 no-op,回退显示时钟。

interface PlayingSession {
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
let changeCb: (() => void) | null = null
let loadFailed = false

export const isAvailable = (): boolean => process.platform === 'win32' && !loadFailed

export const start = (onChange: () => void): void => {
  changeCb = onChange
  if (child) return // 已在监听,仅更新回调即可(幂等)
  if (!isAvailable()) return
  const scriptPath = path.join(__dirname, 'smtcWorker.js')
  try {
    child = utilityProcess.fork(scriptPath, [], { serviceName: 'smtc-monitor' })
  } catch (err) {
    console.warn('[haloPixel] SMTC utilityProcess fork 失败:', err)
    child = null
    loadFailed = true
    return
  }
  child.on('message', (msg: WorkerMessage) => {
    if (!msg) return
    if (msg.type === 'sessions') {
      sessions = msg.sessions ?? []
      changeCb?.()
    } else if (msg.type === 'error') {
      console.warn('[haloPixel] SMTC 子进程不可用:', msg.message)
      loadFailed = true
      stop()
    }
  })
  child.on('exit', () => {
    child = null
  })
}

export const stop = (): void => {
  sessions = []
  changeCb = null
  if (!child) return
  try {
    child.postMessage('dispose')
  } catch {}
  try {
    child.kill()
  } catch {}
  child = null
}

// 从缓存的外部会话里取「正在播放」且非本软件的最新一条,返回「标题 - 艺术家」。
// 本软件判定:标题与艺术家同时等于传入的 player_status(代码库未设 AppUserModelId,无法靠
// sourceAppId 精确识别自身,以标题+艺术家兜底)。
export const getMirrorText = (excludeName: string, excludeSinger: string): string => {
  const exName = excludeName.trim()
  const exSinger = excludeSinger.trim()
  let best: PlayingSession | null = null
  for (const s of sessions) {
    if (!s.title) continue
    if (s.title === exName && s.artist === exSinger) continue
    if (!best || s.lastUpdatedTime > best.lastUpdatedTime) best = s
  }
  if (!best) return ''
  return best.artist ? `${best.title} - ${best.artist}` : best.title
}
