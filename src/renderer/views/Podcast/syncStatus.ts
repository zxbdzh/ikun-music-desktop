export type SyncStatusAction = 'sync' | 'reauthenticate' | null

export interface SyncStatusPresentation {
  label: string
  detail: string
  action: SyncStatusAction
  actionLabel: string
  busy: boolean
  isError: boolean
}

export const syncStatusPresentation = (
  session?: LX.Podcast.Session | null
): SyncStatusPresentation => {
  switch (session?.syncState) {
    case 'syncing':
      return status('正在同步云端数据…', '', 'sync', '同步中…', true, false)
    case 'idle':
      return status('云端数据已同步', '', 'sync', '立即同步', false, false)
    case 'error':
      return status('同步失败', session.error || '暂时无法连接云端', 'sync', '重试同步', false, true)
    case 'reauth-required':
      return status(
        '登录已过期',
        session.error || '请重新登录后继续同步',
        'reauthenticate',
        '重新登录',
        false,
        true
      )
    default:
      return status('仅保存在本机', '', null, '', false, false)
  }
}

const status = (
  label: string,
  detail: string,
  action: SyncStatusAction,
  actionLabel: string,
  busy: boolean,
  isError: boolean
): SyncStatusPresentation => ({ label, detail, action, actionLabel, busy, isError })
