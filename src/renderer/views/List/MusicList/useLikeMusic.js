import { ref } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import wyUser from '@renderer/utils/musicSdk/wy/user'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'

export default ({ list }) => {
  const t = useI18n()

  // 缓存用户喜欢的歌曲ID列表
  const likeList = ref(new Set())
  const isLikeListFetching = ref(false)

  // 获取喜欢列表并存入缓存
  const fetchLikeList = async () => {
    const cookie = appSetting['common.wy_cookie']
    if (!cookie || isLikeListFetching.value) return

    isLikeListFetching.value = true
    try {
      const uid = await wyUser.getUid(cookie)
      if (uid > 0) {
        const ids = await wyUser.getLikeList(uid, cookie)
        // 确保所有 ID 都是数字类型
        likeList.value = new Set(ids.map(id => Number(id)))
      }
    } catch (err) {
      console.error('Failed to fetch like list:', err)
    } finally {
      isLikeListFetching.value = false
    }
  }

  // 判断歌曲是否已喜欢
  const isLiked = (songId) => {
    if (!songId) return false
    return likeList.value.has(Number(songId))
  }

  // 切换喜欢状态
  const handleToggleLike = async (index) => {
    const cookie = appSetting['common.wy_cookie']
    if (!cookie) {
      void dialog({
        message: t('setting__wy_login_not_logged_in'),
        confirmButtonText: t('ok'),
      })
      return
    }

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

    const liked = isLiked(songId)

    try {
      // liked=true表示已喜欢，需要取消；liked=false表示未喜欢，需要添加
      await wyUser.likeSong(songId, !liked, cookie)

      // 操作成功后重新获取列表更新缓存
      await fetchLikeList()

      void dialog({
        message: liked ? t('wy_unlike_success') : t('wy_like_success'),
        confirmButtonText: t('ok'),
      })
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
    const cookie = appSetting['common.wy_cookie']
    if (!cookie) {
      void dialog({
        message: t('setting__wy_login_not_logged_in'),
        confirmButtonText: t('ok'),
      })
      return
    }

    // 筛选出可喜欢的网易云歌曲（未喜欢的）
    const wySongsToLike = selectedList
      .filter(s => s.source === 'wy' && s.meta?.songId && !isLiked(s.meta.songId))
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
        await wyUser.likeSong(song.songId, true, cookie)
        successCount++
      } catch (err) {
        console.error(`Failed to like song ${song.songId}:`, err)
      }
    }

    // 刷新喜欢列表缓存
    await fetchLikeList()

    void dialog({
      message: t('wy_like_multiple_success', { count: successCount, total: wySongsToLike.length }),
      confirmButtonText: t('ok'),
    })
  }

  // 批量取消喜欢
  const handleToggleUnlikeMultiple = async (selectedList) => {
    const cookie = appSetting['common.wy_cookie']
    if (!cookie) {
      void dialog({
        message: t('setting__wy_login_not_logged_in'),
        confirmButtonText: t('ok'),
      })
      return
    }

    // 筛选出已喜欢的网易云歌曲
    const wySongsToUnlike = selectedList
      .filter(s => s.source === 'wy' && s.meta?.songId && isLiked(s.meta.songId))
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
        await wyUser.likeSong(song.songId, false, cookie)
        successCount++
      } catch (err) {
        console.error(`Failed to unlike song ${song.songId}:`, err)
      }
    }

    // 刷新喜欢列表缓存
    await fetchLikeList()

    void dialog({
      message: t('wy_unlike_multiple_success', { count: successCount, total: wySongsToUnlike.length }),
      confirmButtonText: t('ok'),
    })
  }

  return {
    likeList,
    fetchLikeList,
    isLiked,
    handleToggleLike,
    handleToggleLikeMultiple,
    handleToggleUnlikeMultiple,
  }
}
