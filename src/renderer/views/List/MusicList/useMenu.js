import { ref, shallowReactive, reactive, nextTick } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { useI18n } from '@renderer/plugins/i18n'
import { hasDislike } from '@renderer/core/dislikeList'
import { appSetting } from '@renderer/store/setting'
import { openSongMemory } from '@renderer/store/songMemory'

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
    songMemory: true,
  })
  const t = useI18n()
  const menuLocation = shallowReactive({ x: 0, y: 0 })
  const isShowItemMenu = ref(false)
  const currentMusicInfo = ref(null)
  const currentLikeStatus = ref(false)
  const menuList = ref([])
  // 保存批量操作的歌曲列表
  const batchLikeList = ref([])
  const batchUnlikeList = ref([])

  // 构建基础菜单
  const buildBaseMenu = () => {
    const list = [
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
      {
        name: t('list__remove'),
        action: 'remove',
        disabled: !itemMenuControl.remove,
      },
    ]

    // 如果是网易云歌曲且不是多选，先添加带 loading 的喜欢按钮
    const isWySource = currentMusicInfo.value?.source === 'wy'
    const hasWyCookie = !!appSetting['common.wy_cookie']
    if (isWySource && hasWyCookie && selectedList.value.length <= 1) {
      list.push({
        name: t('list__like'),
        action: 'like',
        disabled: true,
        loading: true,
      })
    }

    // 添加回忆坐标按钮
    if (isWySource && hasWyCookie) {
      list.push({
        name: t('song_memory'),
        action: 'songMemory',
        disabled: false,
      })
    }

    return list
  }

  // 更新菜单中的喜欢状态和批量选项
  const updateMenuLikeStatus = async () => {
    const isWySource = currentMusicInfo.value?.source === 'wy'
    const hasWyCookie = !!appSetting['common.wy_cookie']

    // 更新单个歌曲的喜欢按钮
    if (isWySource && hasWyCookie && currentMusicInfo.value) {
      const songId = currentMusicInfo.value.meta?.songId
      const likeItem = menuList.value.find(item => item.action === 'like')
      if (likeItem) {
        const liked = songId ? await isLiked(songId) : false
        currentLikeStatus.value = liked
        likeItem.name = liked ? t('list__dislike') : t('list__like')
        likeItem.disabled = !itemMenuControl.like
        likeItem.loading = false
      }
    }

    // 批量喜欢/取消喜欢选项
    if (selectedList.value.length > 1) {
      const wySongs = selectedList.value.filter(s => s.source === 'wy' && s.meta?.songId)
      if (wySongs.length > 0 && hasWyCookie) {
        batchLikeList.value = []
        batchUnlikeList.value = []
        for (const song of wySongs) {
          const isSongLiked = await isLiked(song.meta.songId)
          if (isSongLiked) {
            batchUnlikeList.value.push(song)
          } else {
            batchLikeList.value.push(song)
          }
        }
        if (batchLikeList.value.length > 0) {
          menuList.value.push({
            name: t('list__like_multiple', { num: batchLikeList.value.length }),
            action: 'likeMultiple',
            disabled: false,
          })
        }
        if (batchUnlikeList.value.length > 0) {
          menuList.value.push({
            name: t('list__dislike_multiple', { num: batchUnlikeList.value.length }),
            action: 'unlikeMultiple',
            disabled: false,
          })
        }
      }
    }
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

    // 先构建不含喜欢状态的基础菜单并显示
    menuList.value = buildBaseMenu()

    nextTick(() => {
      isShowItemMenu.value = true
      // 异步更新喜欢状态和批量选项
      void updateMenuLikeStatus()
    })
  }

  const hideMenu = () => {
    isShowItemMenu.value = false
    currentMusicInfo.value = null
  }

  const menuClick = (action, index) => {
    if (!action) return
    const actionType = action.action
    const musicInfo = currentMusicInfo.value
    hideMenu()
    if (!actionType) return
    switch (actionType) {
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
      case 'songMemory':
        if (musicInfo) {
          openSongMemory(musicInfo)
        }
        break
      case 'likeMultiple':
        handleToggleLikeMultiple(batchLikeList.value)
        break
      case 'unlikeMultiple':
        handleToggleUnlikeMultiple(batchUnlikeList.value)
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
