<template>
  <div :class="$style.list">
    <div class="thead">
      <table>
        <thead>
          <tr v-if="actionButtonsVisible">
            <th class="num" style="width: 5%">#</th>
            <th class="nobreak">{{ $t('music_name') }}</th>
            <th class="nobreak" style="width: 22%">{{ $t('music_singer') }}</th>
            <th class="nobreak" style="width: 22%">{{ $t('music_album') }}</th>
            <th class="nobreak" style="width: 9%">{{ $t('music_time') }}</th>
            <th class="nobreak" style="width: 16%">{{ $t('action') }}</th>
          </tr>
          <tr v-else>
            <th class="num" style="width: 5%">#</th>
            <th class="nobreak">{{ $t('music_name') }}</th>
            <th class="nobreak" style="width: 25%">{{ $t('music_singer') }}</th>
            <th class="nobreak" style="width: 28%">{{ $t('music_album') }}</th>
            <th class="nobreak" style="width: 10%">{{ $t('music_time') }}</th>
          </tr>
        </thead>
      </table>
    </div>
    <div v-show="list.length" ref="dom_listContent" :class="$style.content">
      <base-virtualized-list
        v-if="actionButtonsVisible"
        ref="listRef"
        v-slot="{ item, index }"
        :list="list"
        key-name="id"
        :item-height="listItemHeight"
        container-class="scroll"
        content-class="list"
        @scroll="saveListPosition"
        @contextmenu.capture="handleListRightClick"
      >
        <div
          class="list-item"
          :class="[
            { [$style.active]: playerInfo.isPlayList && playerInfo.playIndex === index },
            { selected: selectedIndex == index || rightClickSelectedIndex == index },
            { active: selectedList.includes(item) },
            { disabled: !assertApiSupport(item.source) },
          ]"
          @click="handleListItemClick($event, index)"
          @contextmenu="handleListItemRightClick($event, item, index)"
        >
          <div class="list-item-cell no-select" :class="$style.num" style="flex: 0 0 5%">
            <transition name="play-active">
              <div
                v-if="playerInfo.isPlayList && playerInfo.playIndex === index"
                :class="$style.playIcon"
              >
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  xlink="http://www.w3.org/1999/xlink"
                  height="50%"
                  viewBox="0 0 512 512"
                  space="preserve"
                >
                  <use xlink:href="#icon-play-outline" />
                </svg>
              </div>
              <div v-else class="num">{{ index + 1 }}</div>
            </transition>
          </div>
          <div class="list-item-cell" :class="$style.pic" style="flex: 0 0 40px">
            <img
              v-if="item.meta.picUrl"
              loading="lazy"
              decoding="async"
              :src="item.meta.picUrl"
              :class="$style.picImg"
            />
            <span v-else :class="$style.picPlaceholder">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="50%" height="50%">
                <path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </span>
          </div>
          <div class="list-item-cell auto name" :aria-label="item.name">
            <span class="select name" :aria-label="item.name">{{ item.name }}</span>
            <span
              v-if="item.source != 'local' && item.meta._qualitys.master"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless_master') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys.atmos_plus"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless_atmos_plus') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys.atmos"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless_atmos') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys.hires"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless_hires') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys.flac"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys['320k']"
              class="no-select badge badge-theme-secondary"
              >{{ $t('tag__high_quality') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys['128k']"
              class="no-select badge badge-theme-secondary"
              >128K</span
            >
            <span v-if="isShowSource" class="no-select badge badge-theme-tertiary">{{
              $t(`source_${item.source}`)
            }}</span>
          </div>
          <div class="list-item-cell singer-cell" style="flex: 0 0 22%">
            <template v-if="item.meta.ar && item.meta.ar.length">
              <span
                v-for="(ar, arIndex) in item.meta.ar"
                :key="ar.id || arIndex"
                class="select singer-name"
                :class="$style.singerName"
                @click.stop="handleSingerNameClick(item, ar, arIndex)"
              >{{ ar.name }}{{ arIndex < item.meta.ar.length - 1 ? '、' : '' }}</span>
            </template>
            <template v-else-if="item.singer && item.singer.includes('、')">
              <span
                v-for="(name, arIndex) in item.singer.split('、')"
                :key="arIndex"
                class="select singer-name"
                :class="$style.singerName"
                @click.stop="handleSingerNameClick(item, { id: undefined, name }, arIndex)"
              >{{ name }}{{ arIndex < item.singer.split('、').length - 1 ? '、' : '' }}</span>
            </template>
            <span v-else class="select singer-name" :aria-label="item.singer" @click.stop="handleSingerClick(item, $event)">{{ item.singer }}</span>
          </div>
          <div class="list-item-cell" style="flex: 0 0 22%">
            <span class="select album-name" :aria-label="item.meta.albumName" @click.stop="handleAlbumClick(item)">{{ item.meta.albumName }}</span>
          </div>
          <div class="list-item-cell" style="flex: 0 0 9%">
            <span class="no-select">{{ item.interval || '--/--' }}</span>
          </div>
          <div class="list-item-cell" style="flex: 0 0 16%; padding-left: 0; padding-right: 0">
            <material-list-buttons
              :index="index"
              :download-btn="assertApiSupport(item.source) && item.source != 'local'"
              @btn-click="handleListBtnClick"
            />
          </div>
        </div>
      </base-virtualized-list>
      <base-virtualized-list
        v-else
        ref="listRef"
        v-slot="{ item, index }"
        :list="list"
        key-name="id"
        :item-height="listItemHeight"
        container-class="scroll"
        content-class="list"
        @scroll="saveListPosition"
        @contextmenu.capture="handleListRightClick"
      >
        <div
          class="list-item"
          :class="[
            { [$style.active]: playerInfo.isPlayList && playerInfo.playIndex === index },
            { selected: selectedIndex == index || rightClickSelectedIndex == index },
            { active: selectedList.includes(item) },
            { disabled: !assertApiSupport(item.source) },
          ]"
          @click="handleListItemClick($event, index)"
          @contextmenu="handleListItemRightClick($event, item, index)"
        >
          <div class="list-item-cell no-select" :class="$style.num" style="flex: 0 0 5%">
            <transition name="play-active">
              <div
                v-if="playerInfo.isPlayList && playerInfo.playIndex === index"
                :class="$style.playIcon"
              >
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  xlink="http://www.w3.org/1999/xlink"
                  height="50%"
                  viewBox="0 0 512 512"
                  space="preserve"
                >
                  <use xlink:href="#icon-play-outline" />
                </svg>
              </div>
              <div v-else class="num">{{ index + 1 }}</div>
            </transition>
          </div>
          <div class="list-item-cell" :class="$style.pic" style="flex: 0 0 40px">
            <img
              v-if="item.meta.picUrl"
              loading="lazy"
              decoding="async"
              :src="item.meta.picUrl"
              :class="$style.picImg"
            />
            <span v-else :class="$style.picPlaceholder">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="50%" height="50%">
                <path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </span>
          </div>
          <div class="list-item-cell auto name">
            <span class="select name" :aria-label="item.name">{{ item.name }}</span>
            <span
              v-if="item.source != 'local' && item.meta._qualitys.master"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless_master') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys.atmos"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless_atmos') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys.hires"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless_hires') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys.flac"
              class="no-select badge badge-theme-primary"
              >{{ $t('tag__lossless') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys['320k']"
              class="no-select badge badge-theme-secondary"
              >{{ $t('tag__high_quality') }}</span
            >
            <span
              v-else-if="item.source != 'local' && item.meta._qualitys['128k']"
              class="no-select badge badge-theme-secondary"
              >128K</span
            >
            <span v-if="isShowSource" class="no-select badge badge-theme-tertiary">{{
              $t(`source_${item.source}`)
            }}</span>
          </div>
          <div class="list-item-cell singer-cell" style="flex: 0 0 25%">
            <template v-if="item.meta.ar && item.meta.ar.length">
              <span
                v-for="(ar, arIndex) in item.meta.ar"
                :key="ar.id || arIndex"
                class="select singer-name"
                :class="$style.singerName"
                @click.stop="handleSingerNameClick(item, ar, arIndex)"
              >{{ ar.name }}{{ arIndex < item.meta.ar.length - 1 ? '、' : '' }}</span>
            </template>
            <template v-else-if="item.singer && item.singer.includes('、')">
              <span
                v-for="(name, arIndex) in item.singer.split('、')"
                :key="arIndex"
                class="select singer-name"
                :class="$style.singerName"
                @click.stop="handleSingerNameClick(item, { id: undefined, name }, arIndex)"
              >{{ name }}{{ arIndex < item.singer.split('、').length - 1 ? '、' : '' }}</span>
            </template>
            <span v-else class="select singer-name" :aria-label="item.singer" @click.stop="handleSingerClick(item, $event)">{{ item.singer }}</span>
          </div>
          <div class="list-item-cell" style="flex: 0 0 28%">
            <span class="select album-name" :aria-label="item.meta.albumName" @click.stop="handleAlbumClick(item)">{{ item.meta.albumName }}</span>
          </div>
          <div class="list-item-cell" style="flex: 0 0 10%">
            <span class="no-select">{{ item.interval || '--/--' }}</span>
          </div>
        </div>
      </base-virtualized-list>
    </div>
    <div v-show="!list.length" :class="$style.noItem">
      <p v-text="$t('no_item')" />
    </div>
    <common-list-add-modal
      v-model:show="isShowListAdd"
      :is-move="isMove"
      :from-list-id="listId"
      :music-info="selectedAddMusicInfo"
      :exclude-list-id="excludeListIds"
      teleport="#view"
    />
    <common-list-add-multiple-modal
      v-model:show="isShowListAddMultiple"
      :from-list-id="listId"
      :is-move="isMoveMultiple"
      :music-list="selectedList"
      :exclude-list-id="excludeListIds"
      teleport="#view"
      @confirm="removeAllSelect"
    />
    <common-download-modal
      v-model:show="isShowDownload"
      :music-info="selectedDownloadMusicInfo"
      teleport="#view"
      :list-id="listId"
    />
    <common-download-multiple-modal
      v-model:show="isShowDownloadMultiple"
      :list="selectedList"
      teleport="#view"
      :list-id="listId"
      @confirm="removeAllSelect"
    />
    <search-list :list="list" :visible="isShowSearchBar" @action="handleMusicSearchAction" />
    <music-sort-modal
      v-model:show="isShowMusicSortModal"
      :music-info="selectedSortMusicInfo"
      :selected-num="selectedNum"
      @confirm="sortMusic"
    />
    <music-toggle-modal
      v-model:show="isShowMusicToggleModal"
      :music-info="selectedToggleMusicInfo"
      @toggle="toggleSource"
    />
    <base-menu
      v-model="isShowItemMenu"
      :menus="menus"
      :xy="menuLocation"
      item-name="name"
      @menu-click="handleMenuClick"
    />
  </div>
</template>

<script>
import { toRaw } from '@common/utils/vueTools'
import { clipboardWriteText } from '@common/utils/electron'
import { assertApiSupport } from '@renderer/store/utils'
import { preloadImage } from '@common/utils/imageCache'
import SearchList from './components/SearchList.vue'
import MusicSortModal from './components/MusicSortModal.vue'
import MusicToggleModal from './components/MusicToggleModal.vue'
import useListInfo from './useListInfo'
import useList from './useList'
import useMenu from './useMenu'
import usePlay from './usePlay'
import useMusicDownload from './useMusicDownload'
import useMusicAdd from './useMusicAdd'
import useSort from './useSort'
import useMusicActions from './useMusicActions'
import useSearch from './useSearch'
import useListScroll from './useListScroll'
import useMusicToggle from './useMusicToggle'
import useLikeMusic from './useLikeMusic'
import { appSetting } from '@renderer/store/setting'
import { useRouter } from '@common/utils/vueRouter'
import { dialog } from '@renderer/plugins/Dialog'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import musicSdk from '@renderer/utils/musicSdk'
export default {
  name: 'MusicList',
  components: {
    SearchList,
    MusicSortModal,
    MusicToggleModal,
  },
  props: {
    listId: {
      type: String,
      required: true,
    },
  },
  emits: ['show-menu'],
  setup(props, { emit }) {
    const router = useRouter()
    const actionButtonsVisible = appSetting['list.actionButtonsVisible']

    const handleSingerNameClick = async (item, ar, arIndex = 0) => {
      const rawAr = toRaw(ar)
      const id = rawAr?.id
      const name = rawAr?.name

      if (id) {
        // 有ID直接跳转
        if (item.source !== 'wy') return
        router.push({ path: '/artist', query: { id } })
      } else if (name && item.meta?.songId) {
        // 无ID但有歌手名和歌曲ID，通过歌曲详情获取歌手信息
        if (item.source === 'wy') {
          try {
            const songInfo = await musicSdk.wy.getMusicInfo(item.meta.songId).promise
            if (songInfo?.ar?.[arIndex]?.id) {
              router.push({ path: '/artist', query: { id: songInfo.ar[arIndex].id } })
              return
            }
          } catch (e) {
            console.error('获取歌曲详情失败:', e)
          }
        }
        // 如果获取失败或不是网易云歌曲，尝试搜索
        const results = await wyUtil.searchArtist(name)
        if (results.length > 0) {
          router.push({ path: '/artist', query: { id: results[0].artistId } })
        } else {
          void dialog.confirm({
            message: `未找到歌手"${name}"的信息`,
            confirmButtonText: '确定',
          })
        }
      }
    }

    const handleAlbumClick = (item) => {
      const albumId = item.meta?.albumId
      if (albumId) {
        router.push({ path: '/album', query: { id: albumId } })
      }
    }

    let scrollIndex = null
    let isAnimation = false
    const handleRestoreScroll = (_scrollIndex, _isAnimation) => {
      scrollIndex = _scrollIndex
      isAnimation = _isAnimation
      if (isAnimation) void restoreScroll(scrollIndex, isAnimation)
      // console.log('handleRestoreScroll', scrollIndex, isAnimation)
    }
    const onLoadedList = () => {
      // console.log('restoreScroll', scrollIndex, isAnimation)
      void restoreScroll(scrollIndex, isAnimation)
    }

    const {
      rightClickSelectedIndex,
      selectedIndex,
      dom_listContent,
      listRef,
      list,
      playerInfo,
      setSelectedIndex,
      isShowSource,
      excludeListIds,
    } = useListInfo({ props, onLoadedList })

    const { selectedList, listItemHeight, handleSelectData, removeAllSelect } = useList({
      listRef,
      list,
    })

    const { handlePlayMusic, handlePlayMusicLater, doubleClickPlay } = usePlay({
      props,
      selectedList,
      list,
      removeAllSelect,
    })

    const {
      isShowListAdd,
      isMove,
      isShowListAddMultiple,
      isMoveMultiple,
      selectedAddMusicInfo,
      handleShowMusicAddModal,
      handleShowMusicMoveModal,
    } = useMusicAdd({ selectedList, list })

    const {
      isShowDownload,
      isShowDownloadMultiple,
      selectedDownloadMusicInfo,
      handleShowDownloadModal,
    } = useMusicDownload({ selectedList, list })

    const {
      isShowMusicSortModal,
      selectedNum,
      selectedSortMusicInfo,
      handleShowSortModal,
      sortMusic,
    } = useSort({ props, list, selectedList, removeAllSelect })

    const {
      handleShowMusicToggleModal,
      isShowMusicToggleModal,
      selectedToggleMusicInfo,
      toggleSource,
    } = useMusicToggle(props, list)

    const {
      handleSearch,
      handleOpenMusicDetail,
      handleCopyName,
      handleCopyMusicLink,
      handleShareCard,
      handleDislikeMusic,
      handleRemoveMusic,
      handleSingerClick,
      handleSingerRightClick,
    } = useMusicActions({ props, list, removeAllSelect, selectedList })

    const { isChecking, isLiked, handleToggleLike, handleToggleLikeMultiple, handleToggleUnlikeMultiple } = useLikeMusic({ list })

    const { menus, menuLocation, isShowItemMenu, showMenu, menuClick } = useMenu({
      assertApiSupport,
      emit,
      selectedList,

      handleShowDownloadModal,
      handlePlayMusic,
      handlePlayMusicLater,
      handleShowMusicToggleModal,
      handleSearch,
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
    })

    const { isShowSearchBar, searchList, handleMusicSearchAction } = useSearch({
      setSelectedIndex,
      handlePlayMusic,
      listRef,
    })

    const { saveListPosition, restoreScroll } = useListScroll({
      props,
      listRef,
      list,
      handleRestoreScroll,
    })

    // 预加载前几张可见歌曲的封面
    const preloadVisibleCovers = () => {
      const preloadCount = 30
      for (let i = 0; i < Math.min(preloadCount, list.value.length); i++) {
        const picUrl = list.value[i]?.meta?.picUrl
        if (picUrl) preloadImage(picUrl)
      }
    }

    // 初始预加载封面
    setTimeout(preloadVisibleCovers, 1000)

    const handleListItemClick = (event, index) => {
      if (rightClickSelectedIndex.value > -1) return
      handleSelectData(index)
      doubleClickPlay(index)
    }
    const handleListItemRightClick = (event, item, index) => {
      // 检查是否点击的是歌手名称元素
      const singerCell = event.target.closest('.singer-cell')
      if (singerCell) {
        if (item && item.meta?.singerId && item.source === 'wy') {
          event.preventDefault()
          router.push({
            path: '/artist',
            query: { id: item.meta.singerId },
          })
          return
        }
      }
      rightClickSelectedIndex.value = index
      showMenu(event, item, index)
    }
    const handleMenuClick = (action) => {
      let index = rightClickSelectedIndex.value
      rightClickSelectedIndex.value = -1
      menuClick(action, index)
    }
    const handleListRightClick = (event) => {
      if (!event.target.classList.contains('select')) return
      event.stopImmediatePropagation()
      let classList = dom_listContent.value.classList
      classList.add('copying')
      window.requestAnimationFrame(() => {
        let str = window.getSelection().toString()
        classList.remove('copying')
        str = str
          .split(/\n\n/)
          .map((s) => s.replace(/\n/g, '  '))
          .join('\n')
          .trim()
        if (!str.length) return
        clipboardWriteText(str)
      })
    }
    const handleListBtnClick = ({ action, index }) => {
      switch (action) {
        case 'download':
          handleShowDownloadModal(index, true)
          break
        case 'play':
          handlePlayMusic(index, true)
          break
        case 'search':
          handleSearch(index)
          break
        case 'listAdd':
          handleShowMusicAddModal(index, true)
          break
      }
    }
    const scrollToTop = () => {
      listRef.value.scrollTo(0, true)
    }

    return {
      listItemHeight,
      handleListItemClick,
      selectedList,
      handleListItemRightClick,
      removeAllSelect,
      handleListBtnClick,
      rightClickSelectedIndex,
      selectedIndex,
      dom_listContent,
      listRef,
      excludeListIds,
      handleSingerNameClick,
      handleAlbumClick,

      menus,
      isShowItemMenu,
      menuLocation,
      handleMenuClick,

      handleListRightClick,
      assertApiSupport,

      isShowListAdd,
      isMove,
      isShowListAddMultiple,
      isMoveMultiple,
      selectedAddMusicInfo,

      isShowMusicSortModal,
      selectedNum,
      selectedSortMusicInfo,
      sortMusic,

      isShowDownload,
      isShowDownloadMultiple,
      selectedDownloadMusicInfo,

      scrollToTop,

      isShowSearchBar,
      searchList,
      handleMusicSearchAction,

      list,
      playerInfo,

      saveListPosition,
      isShowSource,
      handleRestoreScroll,

      actionButtonsVisible,

      isShowMusicToggleModal,
      selectedToggleMusicInfo,
      toggleSource,

      handleSingerClick,
      handleSingerRightClick,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.list {
  overflow: hidden;
  height: 100%;
  flex: auto;
  display: flex;
  flex-flow: column nowrap;

  :global(.list-item) {
    &.active {
      color: var(--color-button-font);
    }
  }

  :global {
    .label-source {
      color: var(--color-primary);
      padding: 5px;
      font-size: 0.8em;
      line-height: 1.2;
      opacity: 0.75;
      display: inline-block;
    }

    .singer-name {
      cursor: pointer;
      &:hover {
        color: var(--color-primary);
      }
    }

    .album-name {
      cursor: pointer;
      &:hover {
        color: var(--color-primary);
      }
    }
  }
}

.num {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.pic {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.picImg {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
}

.picPlaceholder {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: var(--color-song-item-background);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-font-label);
}

.playIcon {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  color: var(--color-button-font);
  opacity: 0.7;
}

.content {
  min-height: 0;
  font-size: 14px;
  display: flex;
  flex-flow: column nowrap;
  flex: auto;
}

.noItem {
  position: relative;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;

  p {
    font-size: 24px;
    color: var(--color-font-label);
  }
}
</style>
