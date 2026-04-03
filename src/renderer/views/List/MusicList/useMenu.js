import { computed, ref, shallowReactive, reactive, nextTick } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { useI18n } from '@renderer/plugins/i18n'
import { hasDislike } from '@renderer/core/dislikeList'
import { appSetting } from '@renderer/store/setting'

export default ({
  assertApiSupport,
  emit,

  handleShowDownloadModal,
  handlePlayMusic,
  handlePlayMusicLater,
  handleSearch,
  handleShowMusicToggleModal,
  handleShowMusicAddModal,
  handleShowMusicMoveModal,
  handleShowSortModal,
  handleOpenMusicDetail,
  handleCopyName,
  handleCopyMusicLink,
  handleShareCard,
  handleDislikeMusic,
  handleRemoveMusic,
  handleToggleLike,
  likeList,
  isLiked,
}) => {
  const itemMenuControl = reactive({
    play: true,
    playLater: true,
    copyName: true,
    copyLink: true,
    shareCard: true,
    addTo: true,
    moveTo: true,
    sort: true,
    toggleSource: true,
    download: true,
    search: true,
    dislike: true,
    remove: true,
    sourceDetail: true,
    like: true,
  })
  const t = useI18n()
  const menuLocation = shallowReactive({ x: 0, y: 0 })
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
        name: t('list__share_card'),
        action: 'shareCard',
        disabled: !itemMenuControl.shareCard,
      },
      {
        name: t('list__play_later'),
        action: 'playLater',
        disabled: !itemMenuControl.playLater,
      },
      {
        name: t('list__add_to'),
        action: 'addTo',
        disabled: !itemMenuControl.addTo,
      },
      {
        name: t('list__move_to'),
        action: 'moveTo',
        disabled: !itemMenuControl.moveTo,
      },
      {
        name: t('list__sort'),
        action: 'sort',
        disabled: !itemMenuControl.sort,
      },
      {
        name: t('list__toggle_source'),
        action: 'toggleSource',
        disabled: !itemMenuControl.toggleSource,
      },
      {
        name: t('list__copy_name'),
        action: 'copyName',
        disabled: !itemMenuControl.copyName,
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
        name: t('list__search'),
        action: 'search',
        disabled: !itemMenuControl.search,
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

    menuList.push({
      name: t('list__remove'),
      action: 'remove',
      disabled: !itemMenuControl.remove,
    })

    return menuList
  })

  const showMenu = (event, musicInfo) => {
    currentMusicInfo.value = musicInfo
    itemMenuControl.sourceDetail = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    itemMenuControl.copyLink = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    itemMenuControl.download = assertApiSupport(musicInfo.source) && musicInfo.source != 'local'

    itemMenuControl.dislike = !hasDislike(musicInfo)

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
      case 'play':
        handlePlayMusic(index)
        break
      case 'playLater':
        handlePlayMusicLater(index)
        break
      case 'copyName':
        handleCopyName(index)
        break
      case 'copyLink':
        handleCopyMusicLink(index)
        break
      case 'shareCard':
        handleShareCard(index)
        break
      case 'addTo':
        handleShowMusicAddModal(index)
        break
      case 'moveTo':
        handleShowMusicMoveModal(index)
        break
      case 'sort':
        handleShowSortModal(index)
        break
      case 'toggleSource':
        handleShowMusicToggleModal(index)
        break
      case 'download':
        handleShowDownloadModal(index)
        break
      case 'search':
        handleSearch(index)
        break
      case 'dislike':
        handleDislikeMusic(index)
        break
      case 'remove':
        handleRemoveMusic(index)
        break
      case 'sourceDetail':
        handleOpenMusicDetail(index)
        break
      case 'like':
        handleToggleLike(index)
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
