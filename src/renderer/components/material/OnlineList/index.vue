<template>
  <div :class="$style.songList">
    <!-- <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut"> -->
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
              <th class="nobreak" style="width: 24%">{{ $t('music_singer') }}</th>
              <th class="nobreak" style="width: 27%">{{ $t('music_album') }}</th>
              <th class="nobreak" style="width: 10%">{{ $t('music_time') }}</th>
            </tr>
          </thead>
        </table>
      </div>
      <div :class="$style.content">
        <div v-show="!noItem" ref="dom_listContent" :class="$style.content">
          <base-virtualized-list
            v-if="actionButtonsVisible"
            ref="listRef"
            :list="list"
            key-name="id"
            :item-height="listItemHeight"
            container-class="scroll"
            content-class="list"
            @contextmenu.capture="handleListRightClick"
          >
            <template #default="{ item, index }">
              <div
                class="list-item"
                :class="[
                  { selected: rightClickSelectedIndex == index },
                  { active: selectedList.includes(item) },
                ]"
                @click="handleListItemClick($event, index)"
                @contextmenu="handleListItemRightClick($event, index)"
              >
                <div class="list-item-cell no-select num" style="flex: 0 0 5%" @click.stop>
                  {{ index + 1 }}
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
                    v-if="item.meta._qualitys.master"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_master') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.atmos_plus"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_atmos_plus') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.atmos"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_atmos') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.hires"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_hires') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.flac"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys['320k']"
                    class="no-select badge badge-theme-secondary"
                    >{{ $t('tag__high_quality') }}</span
                  >
                  <span v-if="sourceTag" class="no-select badge badge-theme-tertiary">{{
                    item.source
                  }}</span>
                </div>
                <div class="list-item-cell" style="flex: 0 0 22%">
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
                  <span v-else class="select" :aria-label="item.singer">{{ item.singer }}</span>
                </div>
                <div class="list-item-cell" style="flex: 0 0 22%">
                  <span class="select" :aria-label="item.meta.albumName">{{
                    item.meta.albumName
                  }}</span>
                </div>
                <div class="list-item-cell" style="flex: 0 0 9%">
                  <span class="no-select">{{ item.interval || '--/--' }}</span>
                </div>
                <div
                  class="list-item-cell"
                  style="flex: 0 0 16%; padding-left: 0; padding-right: 0"
                >
                  <material-list-buttons
                    :index="index"
                    :remove-btn="false"
                    :download-btn="assertApiSupport(item.source)"
                    :play-btn="checkApiSource ? assertApiSupport(item.source) : true"
                    @btn-click="handleListBtnClick"
                  />
                </div>
              </div>
            </template>
            <template #footer>
              <div :class="$style.pagination">
                <material-pagination
                  :count="total"
                  :limit="limit"
                  :page="page"
                  @btn-click="$emit('togglePage', $event)"
                />
              </div>
            </template>
          </base-virtualized-list>
          <base-virtualized-list
            v-else
            ref="listRef"
            :list="list"
            key-name="id"
            :item-height="listItemHeight"
            container-class="scroll"
            content-class="list"
            @contextmenu.capture="handleListRightClick"
          >
            <template #default="{ item, index }">
              <div
                class="list-item"
                :class="[
                  { selected: rightClickSelectedIndex == index },
                  { active: selectedList.includes(item) },
                ]"
                @click="handleListItemClick($event, index)"
                @contextmenu="handleListItemRightClick($event, index)"
              >
                <div class="list-item-cell no-select num" style="flex: 0 0 5%" @click.stop>
                  {{ index + 1 }}
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
                    v-if="item.meta._qualitys.master"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_master') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.atmos_plus"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_atmos_plus') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.atmos"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_atmos') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.hires"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless_hires') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys.flac"
                    class="no-select badge badge-theme-primary"
                    >{{ $t('tag__lossless') }}</span
                  >
                  <span
                    v-else-if="item.meta._qualitys['320k']"
                    class="no-select badge badge-theme-secondary"
                    >{{ $t('tag__high_quality') }}</span
                  >
                  <span v-if="sourceTag" class="no-select badge badge-theme-tertiary">{{
                    item.source
                  }}</span>
                </div>
                <div class="list-item-cell" style="flex: 0 0 24%">
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
                  <span v-else class="select" :aria-label="item.singer">{{ item.singer }}</span>
                </div>
                <div class="list-item-cell" style="flex: 0 0 27%">
                  <span class="select" :aria-label="item.meta.albumName">{{
                    item.meta.albumName
                  }}</span>
                </div>
                <div class="list-item-cell" style="flex: 0 0 10%">
                  <span class="no-select">{{ item.interval || '--/--' }}</span>
                </div>
              </div>
            </template>
            <template #footer>
              <div :class="$style.pagination">
                <material-pagination
                  :count="total"
                  :limit="limit"
                  :page="page"
                  @btn-click="$emit('togglePage', $event)"
                />
              </div>
            </template>
          </base-virtualized-list>
        </div>
        <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
          <div v-show="noItem" :class="$style.noitem">
            <p v-text="noItem" />
          </div>
        </transition>
      </div>
    </div>
    <!-- </transition> -->
    <!-- <material-flow-btn :show="isShowEditBtn && assertApiSupport(source)" :remove-btn="false" @btn-click="handleFlowBtnClick" /> -->
    <!-- <common-download-modal v-model:show="isShowDownload" :music-info="selectedDownloadMusicInfo" teleport="#view" />
    <common-download-multiple-modal v-model:show="isShowDownloadMultiple" :list="selectedList" teleport="#view" @confirm="removeAllSelect" /> -->
    <common-list-add-modal
      v-model:show="isShowListAdd"
      :music-info="selectedAddMusicInfo"
      teleport="#view"
    />
    <common-list-add-multiple-modal
      v-model:show="isShowListAddMultiple"
      :music-list="selectedList"
      teleport="#view"
      @confirm="removeAllSelect"
    />
    <common-download-modal
      v-model:show="isShowDownload"
      :music-info="selectedDownloadMusicInfo"
      teleport="#view"
    />
    <common-download-multiple-modal
      v-model:show="isShowDownloadMultiple"
      :list="selectedList"
      teleport="#view"
      @confirm="removeAllSelect"
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
import { clipboardWriteText } from '@common/utils/electron'
import { assertApiSupport } from '@renderer/store/utils'
import { preloadImage } from '@common/utils/imageCache'
import { ref, toRaw } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { dialog } from '@renderer/plugins/Dialog'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import wy from '@renderer/utils/musicSdk/wy'
import useList from './useList'
import useMenu from './useMenu'
import usePlay from './usePlay'
import useMusicDownload from './useMusicDownload'
import useMusicAdd from './useMusicAdd'
import useMusicActions from './useMusicActions'
import useLikeMusic from './useLikeMusic'
import { appSetting } from '@renderer/store/setting'
export default {
  name: 'MaterialOnlineList',
  props: {
    list: {
      type: Array,
      default() {
        return []
      },
    },
    page: {
      type: Number,
      required: true,
    },
    limit: {
      type: Number,
      required: true,
    },
    total: {
      type: Number,
      required: true,
    },
    sourceTag: {
      type: Boolean,
      default: false,
    },
    noItem: {
      type: String,
      default: '',
    },
    checkApiSource: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['show-menu', 'play-list', 'togglePage'],
  setup(props, { emit }) {
    const router = useRouter()
    const actionButtonsVisible = appSetting['list.actionButtonsVisible']
    const rightClickSelectedIndex = ref(-1)
    const dom_listContent = ref(null)
    const listRef = ref(null)

    const handleSingerNameClick = async (item, ar, arIndex = 0) => {
      const rawItem = toRaw(item)
      const rawAr = toRaw(ar)
      const id = rawAr?.id
      const name = rawAr?.name

      if (id) {
        // 有ID直接跳转（网易云歌手页）
        if (rawItem.source !== 'wy') return
        router.push({ path: '/artist', query: { id } })
      } else if (name && rawItem.meta?.songId && rawItem.source === 'wy') {
        // 无ID但有歌曲ID，用歌曲详情API获取歌手ID
        try {
          const info = await wy.getMusicInfo(rawItem.meta.songId).promise
          if (info?.ar?.[arIndex]?.id) {
            router.push({ path: '/artist', query: { id: info.ar[arIndex].id } })
          } else {
            // 兜底：使用歌手名搜索
            const results = await wyUtil.searchArtist(name)
            if (results.length > 0) {
              router.push({ path: '/artist', query: { id: results[0].artistId } })
            }
          }
        } catch {
          // 兜底：使用歌手名搜索
          const results = await wyUtil.searchArtist(name)
          if (results.length > 0) {
            router.push({ path: '/artist', query: { id: results[0].artistId } })
          }
        }
      } else if (name) {
        // 非网易云或无歌曲ID，兜底搜索
        const results = await wyUtil.searchArtist(name)
        if (results.length > 0) {
          router.push({ path: '/artist', query: { id: results[0].artistId } })
        } else {
          // 搜索结果为空，提示用户
          void dialog.confirm({
            message: `未找到歌手"${name}"的信息`,
            confirmButtonText: '确定',
          })
        }
      }
    }

    const { selectedList, listItemHeight, handleSelectData, removeAllSelect } = useList({
      props,
      listRef,
    })

    const { handlePlayMusic, handlePlayMusicLater, doubleClickPlay } = usePlay({
      selectedList,
      props,
      removeAllSelect,
      emit,
    })

    const { isShowListAdd, isShowListAddMultiple, selectedAddMusicInfo, handleShowMusicAddModal } =
      useMusicAdd({ selectedList, props })

    const {
      isShowDownload,
      isShowDownloadMultiple,
      selectedDownloadMusicInfo,
      handleShowDownloadModal,
    } = useMusicDownload({ selectedList, props })

    const { handleSearch, handleOpenMusicDetail, handleCopyMusicLink, handleDislikeMusic } = useMusicActions({ props })

    const { isChecking, isLiked, handleToggleLike, handleToggleLikeMultiple, handleToggleUnlikeMultiple } = useLikeMusic({ list: props.list })

    const { menus, menuLocation, isShowItemMenu, showMenu, menuClick } = useMenu({
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
    })

    const handleListItemClick = (event, index) => {
      if (rightClickSelectedIndex.value > -1) return
      handleSelectData(index)
      doubleClickPlay(index)
    }
    const handleListItemRightClick = (event, index) => {
      rightClickSelectedIndex.value = index
      showMenu(event, props.list[index], index)
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
          void handlePlayMusic(index, true)
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

    // 预加载前几张可见歌曲的封面
    const preloadVisibleCovers = () => {
      const preloadCount = 30
      for (let i = 0; i < Math.min(preloadCount, props.list.length); i++) {
        const picUrl = props.list[i]?.meta?.picUrl
        if (picUrl) preloadImage(picUrl)
      }
    }

    // 初始预加载封面
    setTimeout(preloadVisibleCovers, 1000)

    return {
      listItemHeight,
      handleListItemClick,
      selectedList,
      handleListItemRightClick,
      removeAllSelect,
      handleListBtnClick,
      rightClickSelectedIndex,
      dom_listContent,
      listRef,

      menus,
      isShowItemMenu,
      menuLocation,
      handleMenuClick,

      handleListRightClick,
      assertApiSupport,
      handleSingerNameClick,

      isShowListAdd,
      isShowListAddMultiple,
      selectedAddMusicInfo,

      isShowDownload,
      isShowDownloadMultiple,
      selectedDownloadMusicInfo,

      scrollToTop,
      actionButtonsVisible,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.songList {
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  position: relative;
}

.list {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  font-size: 14px;
}

.content {
  flex: auto;
  min-height: 0;
  position: relative;
  height: 100%;
}

.pagination {
  text-align: center;
  padding: 15px 0;
  // left: 50%;
  // transform: translateX(-50%);
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
.singerName {
  cursor: pointer;
  &:hover {
    color: var(--color-primary);
  }
}
.noitem {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  // background-color: var(--color-000);

  p {
    font-size: 24px;
    color: var(--color-font-label);
  }
}
</style>
