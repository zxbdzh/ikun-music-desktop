import { ref, shallowReactive, reactive, nextTick } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { useI18n } from '@renderer/plugins/i18n'
import { hasDislike } from '@renderer/core/dislikeList'
import { appSetting } from '@renderer/store/setting'

export default ({
  assertApiSupport,
  emit,
  selectedList,

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
  handleToggleLikeMultiple,
  handleToggleUnlikeMultiple,
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
  const currentLikeStatus = ref(false)
  const menuList = ref([])

  // 构建基础菜单
  const buildBaseMenu = () => {
    return [
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
  }

  // 构建完整菜单（异步检查喜欢状态）
  const buildMenu = async () => {
    const isWySource = currentMusicInfo.value?.source === 'wy'
    const hasWyCookie = !!appSetting['common.wy_cookie']

    const list = buildBaseMenu()

    // 只有网易云歌曲显示喜欢/不喜欢按钮
    if (isWySource && hasWyCookie && currentMusicInfo.value) {
      const songId = currentMusicInfo.value.meta?.songId
      const liked = songId ? await isLiked(songId) : false
      currentLikeStatus.value = liked
      list.push({
        name: liked ? t('list__dislike') : t('list__like'),
        action: 'like',
        disabled: !itemMenuControl.like,
      })
    }

    // 批量喜欢/取消喜欢选项（仅在多选且存在可喜欢的网易云歌曲时显示）
    if (selectedList.value.length > 1) {
      const wySongs = selectedList.value.filter(s => s.source === 'wy' && s.meta?.songId)
      if (wySongs.length > 0 && hasWyCookie) {
        // 异步检查每个歌曲的喜欢状态
        const notLiked = []
        const liked = []
        for (const song of wySongs) {
          const isSongLiked = await isLiked(song.meta.songId)
          if (isSongLiked) {
            liked.push(song)
          } else {
            notLiked.push(song)
          }
        }
        if (notLiked.length > 0) {
          list.push({
            name: t('list__like_multiple', { num: notLiked.length }),
            action: 'likeMultiple',
            disabled: false,
          })
        }
        if (liked.length > 0) {
          list.push({
            name: t('list__dislike_multiple', { num: liked.length }),
            action: 'unlikeMultiple',
            disabled: false,
          })
        }
      }
    }

    list.push({
      name: t('list__remove'),
      action: 'remove',
      disabled: !itemMenuControl.remove,
    })

    return list
  }

  const showMenu = async (event, musicInfo) => {
    currentMusicInfo.value = musicInfo
    itemMenuControl.sourceDetail = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    itemMenuControl.copyLink = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    itemMenuControl.download = assertApiSupport(musicInfo.source) && musicInfo.source != 'local'

    itemMenuControl.dislike = !hasDislike(musicInfo)

    menuLocation.x = event.pageX
    menuLocation.y = event.pageY

    if (isShowItemMenu.value) return

    emit('show-menu')

    // 异步构建菜单
    menuList.value = await buildMenu()

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
      case 'likeMultiple':
        handleToggleLikeMultiple(selectedList.value)
        break
      case 'unlikeMultiple':
        handleToggleUnlikeMultiple(selectedList.value)
        break
    }
  }

  return {
    menus: menuList,
    menuLocation,
    isShowItemMenu,
    showMenu,
    menuClick,
  }
}
