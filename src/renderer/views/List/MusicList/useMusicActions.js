import { useRouter } from '@common/utils/vueRouter'
import musicSdk from '@renderer/utils/musicSdk'
import { openUrl, clipboardWriteText } from '@common/utils/electron'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { removeListMusics } from '@renderer/store/list/action'
import { appSetting } from '@renderer/store/setting'
import { toOldMusicInfo } from '@renderer/utils/index'
import { addDislikeInfo, hasDislike } from '@renderer/core/dislikeList'
import { playNext } from '@renderer/core/player'
import { playMusicInfo } from '@renderer/store/player/state'
import { openShareMusicCard } from '@renderer/store/shareMusicCard'

export default ({ props, list, selectedList, removeAllSelect }) => {
  const router = useRouter()
  const t = useI18n()

  const handleSearch = (index) => {
    const info = list.value[index]
    router.push({
      path: '/search',
      query: {
        text: `${info.name} ${info.singer}`,
      },
    })
  }

  const handleOpenMusicDetail = (index) => {
    const minfo = list.value[index]
    const url = musicSdk[minfo.source]?.getMusicDetailPageUrl(toOldMusicInfo(minfo))
    if (!url) return
    openUrl(url)
  }

  // 歌手名称点击/右键跳转歌手详情页
  const handleSingerClick = async (item, event) => {
    // 网易云歌曲如果没有 singerId，懒加载获取
    if (!item.meta?.singerId && item.source === 'wy' && item.meta?.songId) {
      try {
        const requestObj = musicSdk.wy.getMusicInfo(item.meta.songId)
        const songDetail = await requestObj.promise
        if (songDetail?.ar?.[0]?.id) {
          item.meta.singerId = songDetail.ar[0].id
        }
      } catch (err) {
        console.error('获取歌手ID失败:', err)
      }
    }
    if (!item.meta?.singerId || item.source !== 'wy') return
    router.push({
      path: '/artist',
      query: { id: item.meta.singerId },
    })
  }

  // 返回 true 表示已处理（跳转），返回 false 表示需要显示菜单
  const handleSingerRightClick = async (item, event) => {
    event.preventDefault()
    // 网易云歌曲如果没有 singerId，懒加载获取
    if (!item.meta?.singerId && item.source === 'wy' && item.meta?.songId) {
      try {
        const requestObj = musicSdk.wy.getMusicInfo(item.meta.songId)
        const songDetail = await requestObj.promise
        if (songDetail?.ar?.[0]?.id) {
          item.meta.singerId = songDetail.ar[0].id
        }
      } catch (err) {
        console.error('获取歌手ID失败:', err)
      }
    }
    if (item.meta?.singerId && item.source === 'wy') {
      router.push({
        path: '/artist',
        query: { id: item.meta.singerId },
      })
      return true
    }
    return false
  }

  const handleCopyName = (index) => {
    const minfo = list.value[index]
    clipboardWriteText(
      appSetting['download.fileName'].replace('歌名', minfo.name).replace('歌手', minfo.singer)
    )
  }

  const handleCopyMusicLink = (index) => {
    const minfo = list.value[index]
    const url = musicSdk[minfo.source]?.getMusicDetailPageUrl(toOldMusicInfo(minfo))
    if (!url) return
    clipboardWriteText(`${minfo.name} (${minfo.singer}) ${url}`)
  }

  const handleShareCard = (index) => {
    const minfo = list.value[index]
    if (!minfo) return
    openShareMusicCard(minfo)
  }

  const handleDislikeMusic = async (index) => {
    const minfo = list.value[index]
    const confirm = await dialog.confirm({
      message: minfo.singer
        ? t('lists__dislike_music_singer_tip', { name: minfo.name, singer: minfo.singer })
        : t('lists__dislike_music_tip', { name: minfo.name }),
      cancelButtonText: t('cancel_button_text_2'),
      confirmButtonText: t('confirm_button_text'),
    })
    if (!confirm) return
    await addDislikeInfo([{ name: minfo.name, singer: minfo.singer }])
    if (hasDislike(playMusicInfo.musicInfo)) {
      playNext(true)
    }
  }

  const handleRemoveMusic = async (index, single) => {
    if (selectedList.value.length && !single) {
      const confirm = await (selectedList.value.length > 1
        ? dialog.confirm({
            message: t('lists__remove_music_tip', { len: selectedList.value.length }),
            confirmButtonText: t('lists__remove_tip_button'),
          })
        : Promise.resolve(true))
      if (!confirm) return
      removeListMusics({ listId: props.listId, ids: selectedList.value.map((m) => m.id) })
      removeAllSelect()
    } else {
      removeListMusics({ listId: props.listId, ids: [list.value[index].id] })
    }
  }

  return {
    handleSearch,
    handleOpenMusicDetail,
    handleCopyName,
    handleCopyMusicLink,
    handleShareCard,
    handleDislikeMusic,
    handleRemoveMusic,
    handleSingerClick,
    handleSingerRightClick,
  }
}
