import { updateSetting } from '@renderer/store/setting'
import { getSession } from '@renderer/utils/musicSdk/lastfm'

export default () => {
  return async (action: string, params: { paths: string[]; token?: string }) => {
    switch (action) {
      case 'auth': {
        const token = params.token
        if (!token) throw new Error('Missing token')
        try {
          const result = await getSession(token)
          updateSetting({
            'common.lastfm_session_key': result.session_key,
            'common.lastfm_username': result.name,
          })
          // 提示授权成功
          const { dialog } = await import('@renderer/plugins/Dialog')
          void dialog({
            message: 'Last.fm 授权成功',
            confirmButtonText: '确定',
          })
        } catch (e: any) {
          console.error('[LastFM] Auth failed:', e)
          const { dialog } = await import('@renderer/plugins/Dialog')
          void dialog({
            message: 'Last.fm 授权失败：' + (e.message || String(e)),
            confirmButtonText: '确定',
          })
        }
        break
      }
      default:
        throw new Error('Unknown Last.fm action: ' + action)
    }
  }
}
