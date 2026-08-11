import { describe, expect, it } from 'vitest'
import { syncStatusPresentation } from './syncStatus'

const session = (
  syncState: LX.Podcast.Session['syncState'],
  error?: string
): LX.Podcast.Session => ({
  account: { id: 'account-1', email: 'user@example.com', username: '用户' },
  syncEnabled: syncState !== 'local',
  syncState,
  error,
})

describe('podcast sync status presentation', () => {
  it.each([
    ['idle', '云端数据已同步', '立即同步'],
    ['syncing', '正在同步云端数据…', '同步中…'],
    ['error', '同步失败', '重试同步'],
    ['reauth-required', '登录已过期', '重新登录'],
  ] as const)('maps %s to an explicit state and recovery action', (state, label, actionLabel) => {
    expect(syncStatusPresentation(session(state, '请求失败'))).toMatchObject({
      label,
      actionLabel,
    })
  })

  it('keeps the synchronization error visible', () => {
    expect(syncStatusPresentation(session('error', '网络连接超时'))).toMatchObject({
      detail: '网络连接超时',
      action: 'sync',
      isError: true,
    })
  })

  it('does not claim that cloud sync is enabled for a local session', () => {
    expect(syncStatusPresentation(null)).toMatchObject({
      label: '仅保存在本机',
      action: null,
    })
  })
})
