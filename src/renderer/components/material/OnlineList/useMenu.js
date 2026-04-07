import { ref, reactive, nextTick } from '@common/utils/vueTools'
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
  const menuList = ref([])

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

    // 如果是网易云歌曲，先添加带 loading 的喜欢按钮
    const isWySource = currentMusicInfo.value?.source === 'wy'
    const hasWyCookie = !!appSetting['common.wy_cookie']
    if (isWySource && hasWyCookie) {
      list.push({
        name: t('list__like'),
        action: 'like',
        disabled: true,
        loading: true,
      })
    }

    return list
  }

  // 构建完整菜单（异步检查喜欢状态）
  const buildMenu = async () => {
    const isWySource = currentMusicInfo.value?.source === 'wy'
    const hasWyCookie = !!appSetting['common.wy_cookie']

    // 找到已存在的喜欢按钮并更新状态
    if (isWySource && hasWyCookie && currentMusicInfo.value) {
      const songId = currentMusicInfo.value.meta?.songId
      const likeItem = menuList.value.find(item => item.action === 'like')
      if (likeItem) {
        // 异步检查喜欢状态
        const liked = songId ? await isLiked(songId) : false
        // 更新菜单项
        likeItem.name = liked ? t('list__dislike') : t('list__like')
        likeItem.disabled = !itemMenuControl.like
        likeItem.loading = false
      }
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
          menuList.value.push({
            name: t('list__like_multiple', { num: notLiked.length }),
            action: 'likeMultiple',
            disabled: false,
          })
        }
        if (liked.length > 0) {
          menuList.value.push({
            name: t('list__dislike_multiple', { num: liked.length }),
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
    itemMenuControl.download = assertApiSupport(musicInfo.source)

    itemMenuControl.dislike = !hasDislike(musicInfo)

    if (props.checkApiSource) {
      itemMenuControl.playLater = itemMenuControl.play = itemMenuControl.download
    }

    menuLocation.x = event.pageX
    menuLocation.y = event.pageY

    if (isShowItemMenu.value) return
    emit('show-menu')

    // 先构建不含喜欢状态的基础菜单并显示
    menuList.value = buildBaseMenu()

    nextTick(() => {
      isShowItemMenu.value = true
      // 再异步构建完整菜单（更新喜欢状态）
      void buildMenu()
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
    menus: menuList,
    menuLocation,
    isShowItemMenu,
    showMenu,
    menuClick,
  }
}
