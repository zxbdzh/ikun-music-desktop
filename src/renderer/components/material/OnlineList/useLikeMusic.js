import { appSetting } from '@renderer/store/setting'
import wyUser from '@renderer/utils/musicSdk/wy/user'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'

export default ({ props }) => {
  const t = useI18n()

  const handleLikeMusic = async (index) => {
    const cookie = appSetting['common.wy_cookie']
    if (!cookie) {
      void dialog({
        message: t('setting__wy_login_not_logged_in'),
        confirmButtonText: t('ok'),
      })
      return
    }

    const musicInfo = props.list[index]
    // 网易云歌曲 ID 在 meta.songId 中
    const songId = musicInfo.meta.songId

    try {
      await wyUser.likeSong(songId, true, cookie)
      void dialog({
        message: t('wy_like_success'),
        confirmButtonText: t('ok'),
      })
    } catch (err) {
      console.error('Like song failed:', err)
      void dialog({
        message: t('wy_like_failed'),
        confirmButtonText: t('ok'),
      })
    }
  }

  return {
    handleLikeMusic,
  }
}
