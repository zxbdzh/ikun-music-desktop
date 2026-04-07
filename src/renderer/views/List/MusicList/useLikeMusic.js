import { ref } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'

export default ({ list }) => {
  const t = useI18n()

  // 当前用户的 uid
  const userUid = ref(0)
  const isChecking = ref(false)

  // 获取用户 uid
  const fetchUid = async () => {
    const cookie = appSetting['common.wy_cookie']
    if (!cookie || userUid.value) return
    userUid.value = await wyUtil.getUid(cookie)
  }

  // 确保已登录并获取 uid，返回 cookie
  const requireLogin = async () => {
    const cookie = appSetting['common.wy_cookie']
    if (!cookie) {
      void dialog({
        message: t('setting__wy_login_not_logged_in'),
        confirmButtonText: t('ok'),
      })
      return null
    }
    if (!userUid.value) {
      await fetchUid()
    }
    if (!userUid.value) {
      void dialog({
        message: t('setting__wy_login_expired') || '登录已失效，请重新登录',
        confirmButtonText: t('ok'),
      })
      return null
    }
    return cookie
  }

  // 判断歌曲是否已喜欢（直接调用 API，不使用缓存）
  const isLiked = async (songId) => {
    if (!songId) return false
    const cookie = appSetting['common.wy_cookie']
    if (!cookie) return false

    isChecking.value = true
    try {
      const result = await wyUtil.checkIsLiked([songId], cookie)
      return result.likedIds.has(Number(songId))
    } catch (err) {
      console.error('Check is liked error:', err)
      return false
    } finally {
      isChecking.value = false
    }
  }

  // 切换喜欢状态
  const handleToggleLike = async (index) => {
    const cookie = await requireLogin()
    if (!cookie) return

    const musicInfo = list.value[index]
    if (!musicInfo) {
      console.error('Music info not found at index:', index)
      return
    }

    const songId = musicInfo.meta?.songId
    if (!songId) {
      console.error('Song ID not found in music info')
      return
    }

    const liked = await isLiked(songId)

    try {
      // liked=true表示已喜欢，需要取消；liked=false表示未喜欢，需要添加
      const result = await wyUtil.likeSong(songId, userUid.value, !liked, cookie)

      if (result.success) {
        void dialog({
          message: liked ? t('wy_unlike_success') : t('wy_like_success'),
          confirmButtonText: t('ok'),
        })
      } else {
        void dialog({
          message: t('wy_like_failed'),
          confirmButtonText: t('ok'),
        })
      }
    } catch (err) {
      console.error('Toggle like failed:', err)
      void dialog({
        message: t('wy_like_failed'),
        confirmButtonText: t('ok'),
      })
    }
  }

  // 批量切换喜欢状态
  const handleToggleLikeMultiple = async (selectedList) => {
    const cookie = await requireLogin()
    if (!cookie) return

    // 筛选出可喜欢的网易云歌曲
    const wySongsToLike = selectedList
      .filter(s => s.source === 'wy' && s.meta?.songId)
      .map(s => ({ songId: s.meta.songId, name: s.name }))

    if (wySongsToLike.length === 0) {
      void dialog({
        message: t('wy_like_all_already_liked'),
        confirmButtonText: t('ok'),
      })
      return
    }

    // 确认对话框
    const confirmed = await dialog.confirm({
      message: t('wy_like_multiple_confirm', { num: wySongsToLike.length }),
      confirmButtonText: t('ok'),
      cancelButtonText: t('cancel_button_text_2'),
    })
    if (!confirmed) return

    // 批量执行喜欢
    let successCount = 0
    for (const song of wySongsToLike) {
      try {
        const result = await wyUtil.likeSong(song.songId, userUid.value, true, cookie)
        if (result.success) successCount++
      } catch (err) {
        console.error(`Failed to like song ${song.songId}:`, err)
      }
    }

    void dialog({
      message: t('wy_like_multiple_success', { count: successCount, total: wySongsToLike.length }),
      confirmButtonText: t('ok'),
    })
  }

  // 批量取消喜欢
  const handleToggleUnlikeMultiple = async (selectedList) => {
    const cookie = await requireLogin()
    if (!cookie) return

    // 筛选出已喜欢的网易云歌曲
    const wySongsToUnlike = selectedList
      .filter(s => s.source === 'wy' && s.meta?.songId)
      .map(s => ({ songId: s.meta.songId, name: s.name }))

    if (wySongsToUnlike.length === 0) {
      void dialog({
        message: t('wy_unlike_all_already_not_liked'),
        confirmButtonText: t('ok'),
      })
      return
    }

    // 确认对话框
    const confirmed = await dialog.confirm({
      message: t('wy_unlike_multiple_confirm', { num: wySongsToUnlike.length }),
      confirmButtonText: t('ok'),
      cancelButtonText: t('cancel_button_text_2'),
    })
    if (!confirmed) return

    // 批量执行取消喜欢
    let successCount = 0
    for (const song of wySongsToUnlike) {
      try {
        const result = await wyUtil.likeSong(song.songId, userUid.value, false, cookie)
        if (result.success) successCount++
      } catch (err) {
        console.error(`Failed to unlike song ${song.songId}:`, err)
      }
    }

    void dialog({
      message: t('wy_unlike_multiple_success', { count: successCount, total: wySongsToUnlike.length }),
      confirmButtonText: t('ok'),
    })
  }

  // 初始化获取 uid
  void fetchUid()

  return {
    isChecking,
    isLiked,
    handleToggleLike,
    handleToggleLikeMultiple,
    handleToggleUnlikeMultiple,
  }
}
