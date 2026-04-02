import { computed, ref, reactive, nextTick } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { useI18n } from '@renderer/plugins/i18n'
import { hasDislike } from '@renderer/core/dislikeList'
import { appSetting } from '@renderer/store/setting'

export default ({
  props,
  assertApiSupport,
  emit,

  handleShowDownloadModal,
  handlePlayMusic,
  handlePlayMusicLater,
  handleSearch,
  handleShowMusicAddModal,
  handleOpenMusicDetail,
  handleCopyMusicLink,
  handleDislikeMusic,
  handleLikeMusic,
}) => {
  const itemMenuControl = reactive({
    play: true,
    addTo: true,
    playLater: true,
    download: true,
    search: true,
    sourceDetail: true,
    copyLink: true,
    dislike: true,
    like: true,
  })
  const t = useI18n()
  const menuLocation = reactive({ x: 0, y: 0 })
  const isShowItemMenu = ref(false)

  const menus = computed(() => {
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
        name: t('list__dislike'),
        action: 'dislike',
        disabled: !itemMenuControl.dislike,
      },
    ]

    // 如果已登录网易云，添加喜欢按钮
    if (appSetting['common.wy_cookie']) {
      menuList.push({
        name: t('list__like'),
        action: 'like',
        disabled: !itemMenuControl.like,
      })
    }

    return menuList
  })

  const showMenu = (event, musicInfo) => {
    itemMenuControl.sourceDetail = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    itemMenuControl.copyLink = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    // this.listMenu.itemMenuControl.play =
    //   this.listMenu.itemMenuControl.playLater =
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
  }

  const menuClick = (action, index) => {
    // console.log(action)
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
      case 'dislike':
        handleDislikeMusic(index)
        break
      case 'like':
        handleLikeMusic(index)
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
