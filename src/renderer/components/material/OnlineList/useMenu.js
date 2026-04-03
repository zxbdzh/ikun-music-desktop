import { computed, ref, reactive, nextTick } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { useI18n } from '@renderer/plugins/i18n'
import { hasDislike } from '@renderer/core/dislikeList'
import { appSetting } from '@renderer/store/setting'
import { openShareMusicCard } from '@renderer/store/shareMusicCard'

export default ({
  props,
  assertApiSupport,
  emit,
  selectedList,

  handleShowDownloadModal,
  handlePlayMusic,
  handlePlayMusicLater,
  handleSearch,
  handleShowMusicAddModal,
  handleOpenMusicDetail,
  handleCopyMusicLink,
  handleDislikeMusic,
  handleToggleLike,
  handleToggleLikeMultiple,
  handleToggleUnlikeMultiple,
  likeList,
  isLiked,
}) => {
  const itemMenuControl = reactive({
    play: true,
    addTo: true,
    playLater: true,
    download: true,
    search: true,
    sourceDetail: true,
    copyLink: true,
    shareCard: true,
    dislike: true,
    like: true,
  })
  const t = useI18n()
  const menuLocation = reactive({ x: 0, y: 0 })
  const isShowItemMenu = ref(false)
  const currentMusicInfo = ref(null)

  const menus = computed(() => {
    const isWySource = currentMusicInfo.value?.source === 'wy'
    const hasWyCookie = !!appSetting['common.wy_cookie']

    const menuList = [
      {
        name: t('list__play'),
        action: 'play',
        disabled: !itemMenuControl.play,
      },
      {
        name: t('list__download'),
        action: 'download',
        disabled: !itemMenuControl.download,
      },
      {
        name: t('list__play_later'),
        action: 'playLater',
        disabled: !itemMenuControl.playLater,
      },
      {
        name: t('list__search'),
        action: 'search',
        disabled: !itemMenuControl.search,
      },
      {
        name: t('list__add_to'),
        action: 'addTo',
        disabled: !itemMenuControl.addTo,
      },
      {
        name: t('list__source_detail'),
        action: 'sourceDetail',
        disabled: !itemMenuControl.sourceDetail,
      },
      {
        name: t('list__copy_link'),
        action: 'copyLink',
        disabled: !itemMenuControl.copyLink,
      },
      {
        name: t('list__share_card'),
        action: 'shareCard',
        disabled: !itemMenuControl.shareCard,
      },
    ]

    // 只有网易云歌曲显示喜欢/不喜欢按钮
    if (isWySource && hasWyCookie && currentMusicInfo.value) {
      const songId = currentMusicInfo.value.meta?.songId
      const liked = songId ? isLiked(songId) : false
      menuList.push({
        name: liked ? t('list__dislike') : t('list__like'),
        action: 'like',
        disabled: !itemMenuControl.like,
      })
    }

    // 批量喜欢/取消喜欢选项（仅在多选且存在可喜欢的网易云歌曲时显示）
    if (selectedList.value.length > 1) {
      const wySongs = selectedList.value.filter(s => s.source === 'wy' && s.meta?.songId)
      if (wySongs.length > 0 && hasWyCookie) {
        const wySongsNotLiked = wySongs.filter(s => !isLiked(s.meta.songId))
        const wySongsLiked = wySongs.filter(s => isLiked(s.meta.songId))
        if (wySongsNotLiked.length > 0) {
          menuList.push({
            name: t('list__like_multiple', { num: wySongsNotLiked.length }),
            action: 'likeMultiple',
            disabled: false,
          })
        }
        if (wySongsLiked.length > 0) {
          menuList.push({
            name: t('list__dislike_multiple', { num: wySongsLiked.length }),
            action: 'unlikeMultiple',
            disabled: false,
          })
        }
      }
    }

    return menuList
  })

  const showMenu = (event, musicInfo) => {
    currentMusicInfo.value = musicInfo
    itemMenuControl.sourceDetail = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    itemMenuControl.copyLink = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    itemMenuControl.download = assertApiSupport(musicInfo.source)

    itemMenuControl.dislike = !hasDislike(musicInfo)

    if (props.checkApiSource) {
      itemMenuControl.playLater = itemMenuControl.play = itemMenuControl.download
    }

    menuLocation.x = event.pageX
    menuLocation.y = event.pageY

    if (isShowItemMenu.value) return
    emit('show-menu')
    nextTick(() => {
      isShowItemMenu.value = true
    })
  }

  const hideMenu = () => {
    isShowItemMenu.value = false
    currentMusicInfo.value = null
  }

  const menuClick = (action, index) => {
    hideMenu()
    if (!action) return

    switch (action.action) {
      case 'download':
        handleShowDownloadModal(index)
        break
      case 'play':
        handlePlayMusic(index)
        break
      case 'playLater':
        handlePlayMusicLater(index)
        break
      case 'search':
        handleSearch(index)
        break
      case 'addTo':
        handleShowMusicAddModal(index)
        break
      case 'sourceDetail':
        handleOpenMusicDetail(index)
        break
      case 'copyLink':
        handleCopyMusicLink(index)
        break
      case 'shareCard':
        if (currentMusicInfo.value) {
          openShareMusicCard(currentMusicInfo.value)
        }
        break
      case 'dislike':
        handleDislikeMusic(index)
        break
      case 'like':
        handleToggleLike(index)
        break
      case 'likeMultiple':
        handleToggleLikeMultiple(selectedList.value)
        break
      case 'unlikeMultiple':
        handleToggleUnlikeMultiple(selectedList.value)
        break
    }
  }

  return {
    menus,
    menuLocation,
    isShowItemMenu,
    showMenu,
    menuClick,
  }
}
