<template>
  <div :class="$style.main">
    <div class="scroll" :class="$style.toc">
      <ul :class="$style.tocList" role="toolbar">
        <li v-for="tab in tabs" :key="tab.id" :class="$style.tocListItem" role="presentation">
          <h2
            :class="[$style.tocH2, { [$style.active]: activeTab === tab.id }]"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-label="tab.title"
            ignore-tip
            @click="switchTab(tab.id)"
          >
            <transition name="list-active">
              <svg-icon
                v-if="activeTab === tab.id"
                name="angle-right-solid"
                :class="$style.activeIcon"
              />
            </transition>
            {{ tab.title }}
          </h2>
        </li>
      </ul>
    </div>
    <div ref="dom_content_ref" class="scroll" :class="$style.content">
      <!-- 内容区顶部按钮 -->
      <div :class="$style.contentHeader">
        <button
          v-if="activeTab === 'simi'"
          :class="$style.refreshBtn"
          :aria-label="$t('refresh')"
          :disabled="isLoading || !currentSongId"
          @click="handleRefreshSimi"
        >
          <svg-icon name="refresh" style="transform: rotate(45deg)" />
        </button>
      </div>
      <!-- 每日推荐 -->
      <template v-if="activeTab === 'daily'">
        <div v-if="isLoading" :class="$style.loading">{{ $t('loading') }}</div>
        <template v-else>
          <div v-if="songs.length === 0" :class="$style.empty">{{ $t('list__empty') }}</div>
          <div v-else :class="$style.songList">
            <!-- 表头 -->
            <div class="thead">
              <table>
                <thead>
                  <tr>
                    <th class="num" style="width: 5%">#</th>
                    <th class="nobreak">{{ $t('music_name') }}</th>
                    <th class="nobreak" style="width: 24%">{{ $t('music_singer') }}</th>
                    <th class="nobreak" style="width: 27%">{{ $t('music_album') }}</th>
                    <th class="nobreak" style="width: 10%">{{ $t('music_time') }}</th>
                  </tr>
                </thead>
              </table>
            </div>
            <!-- 列表内容 -->
            <div :class="$style.listContent">
              <div
                v-for="(song, index) in songs"
                :key="song.id"
                :class="[$style.songItem, { [$style.playing]: playingIndex === index }]"
                @dblclick="handlePlay(index)"
              >
                <div class="num" :class="$style.index">{{ index + 1 }}</div>
                <div :class="$style.pic">
                  <img v-if="song.al?.picUrl" :src="song.al.picUrl" :class="$style.picImg" />
                  <span v-else :class="$style.picPlaceholder">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="50%" height="50%">
                      <path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </span>
                </div>
                <div :class="$style.name">
                  <span class="select" :class="$style.songName">{{ song.name }}</span>
                  <span v-if="song.fee === 1" class="no-select badge badge-theme-secondary">{{ $t('tag__vip') }}</span>
                  <span v-else-if="song.fee === 4" class="no-select badge badge-theme-secondary">{{ $t('tag__付费') }}</span>
                </div>
                <div :class="$style.singer">
                  <span class="select">{{ song.singer }}</span>
                </div>
                <div :class="$style.album">
                  <span class="select">{{ song.al?.name }}</span>
                </div>
                <div :class="$style.time">
                  <span class="no-select">{{ song.interval }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- 相似歌曲 -->
      <template v-else-if="activeTab === 'simi'">
        <div v-if="!currentSongId" :class="$style.empty">{{ $t('setting__wy_simi_songs') }}: {{ $t('wy_need_play_song') }}</div>
        <div v-else-if="isLoading" :class="$style.loading">{{ $t('loading') }}</div>
        <template v-else>
          <div v-if="songs.length === 0" :class="$style.empty">{{ $t('list__empty') }}</div>
          <div v-else :class="$style.songList">
            <!-- 表头 -->
            <div class="thead">
              <table>
                <thead>
                  <tr>
                    <th class="num" style="width: 5%">#</th>
                    <th class="nobreak">{{ $t('music_name') }}</th>
                    <th class="nobreak" style="width: 24%">{{ $t('music_singer') }}</th>
                    <th class="nobreak" style="width: 27%">{{ $t('music_album') }}</th>
                    <th class="nobreak" style="width: 10%">{{ $t('music_time') }}</th>
                  </tr>
                </thead>
              </table>
            </div>
            <!-- 列表内容 -->
            <div :class="$style.listContent">
              <div
                v-for="(song, index) in songs"
                :key="song.id"
                :class="[$style.songItem, { [$style.playing]: playingIndex === index }]"
                @dblclick="handlePlay(index)"
              >
                <div class="num" :class="$style.index">{{ index + 1 }}</div>
                <div :class="$style.pic">
                  <img v-if="song.al?.picUrl" :src="song.al.picUrl" :class="$style.picImg" />
                  <span v-else :class="$style.picPlaceholder">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="50%" height="50%">
                      <path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </span>
                </div>
                <div :class="$style.name">
                  <span class="select" :class="$style.songName">{{ song.name }}</span>
                  <span v-if="song.fee === 1" class="no-select badge badge-theme-secondary">{{ $t('tag__vip') }}</span>
                  <span v-else-if="song.fee === 4" class="no-select badge badge-theme-secondary">{{ $t('tag__付费') }}</span>
                </div>
                <div :class="$style.singer">
                  <span class="select">{{ song.singer }}</span>
                </div>
                <div :class="$style.album">
                  <span class="select">{{ song.al?.name }}</span>
                </div>
                <div :class="$style.time">
                  <span class="no-select">{{ song.interval }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, nextTick, toRaw, markRawList } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { playMusicInfo } from '@renderer/store/player/state'
import { dialog } from '@renderer/plugins/Dialog'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import { playList } from '@renderer/core/player'
import { setTempList } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { useI18n } from '@root/lang'
import { toNewMusicInfo } from '@common/utils/tools'

export default {
  name: 'WyCloud',
  setup() {
    const t = useI18n()
    const dom_content_ref = ref(null)

    const activeTab = ref('daily')
    const songs = ref([])
    const isLoading = ref(false)
    const playingIndex = ref(-1)
    const cookieValid = ref(false)

    const tabs = computed(() => [
      { id: 'daily', title: t('setting__wy_daily_rec') },
      { id: 'simi', title: t('setting__wy_simi_songs') },
    ])

    const currentSongId = computed(() => {
      const info = playMusicInfo.musicInfo
      if (!info || !info.meta || !info.meta.songId) return null
      if (info.source !== 'wy') return null
      return info.meta.songId
    })

    const switchTab = (tabId) => {
      activeTab.value = tabId
      songs.value = []
      playingIndex.value = -1
      void nextTick(() => {
        dom_content_ref.value?.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
      })
      void loadData(tabId)
    }

    const loadData = async (tabId) => {
      const cookie = appSetting['common.wy_cookie']
      if (!cookie) {
        void dialog.confirm({
          message: t('setting__wy_login_not_logged_in'),
          confirmButtonText: t('ok'),
        })
        return
      }

      isLoading.value = true
      try {
        if (tabId === 'daily') {
          // 使用 wyUtil 获取每日推荐
          const result = await wyUtil.getDailySongs(cookie)
          songs.value = result.map(song => ({
            id: song.id,
            name: song.name,
            singer: (song.ar || []).map(a => a.name).join('、'),
            source: 'wy',
            interval: formatDuration(song.dt),
            albumName: song.al?.name || '',
            albumId: song.al?.id || 0,
            img: song.al?.picUrl || '',
            al: song.al,
            fee: song.fee || 0,
          }))
        } else if (tabId === 'simi') {
          if (!currentSongId.value) return
          const result = await wyUtil.getSimiSongs(currentSongId.value)
          songs.value = result.map(song => ({
            id: song.id,
            name: song.name,
            singer: (song.ar || []).map(a => a.name).join('、'),
            source: 'wy',
            interval: formatDuration(song.dt),
            albumName: song.al?.name || '',
            albumId: song.al?.id || 0,
            img: song.al?.picUrl || '',
            al: song.al,
            fee: song.fee || 0,
          }))
        }
      } catch (e) {
        console.error('Failed to load songs:', e)
        const errorMsg = e instanceof Error ? e.message : t('setting__wy_daily_rec_load_failed')
        void dialog.confirm({
          message: `${t('setting__wy_daily_rec_load_failed')}: ${errorMsg}`,
          confirmButtonText: t('ok'),
        })
      } finally {
        isLoading.value = false
      }
    }

    const handlePlay = async (index) => {
      playingIndex.value = index
      const formattedSongs = markRawList(songs.value.map(s => toNewMusicInfo(toRaw({
        ...s,
        songmid: String(s.id),
        name: s.name,
        singer: s.singer,
        source: 'wy',
        interval: s.interval,
        albumName: s.albumName,
        albumId: s.albumId,
        img: s.img,
        types: s.types || [],
        _types: s._types || {},
        meta: {
          songId: String(s.id),
          albumName: s.albumName || '',
          picUrl: s.img || '',
          albumId: s.albumId || '',
        },
      }))))
      await setTempList('wy_cloud_' + activeTab.value, formattedSongs)
      void playList(LIST_IDS.TEMP, index)
    }

    const handleRefreshSimi = () => {
      if (activeTab.value !== 'simi' || !currentSongId.value || isLoading.value) return
      void loadData('simi')
    }

    const formatDuration = (ms) => {
      if (!ms) return '--:--'
      const seconds = Math.floor(ms / 1000)
      const min = Math.floor(seconds / 60)
      const sec = seconds % 60
      return `${min}:${sec.toString().padStart(2, '0')}`
    }

    // 初始化加载
    watch(activeTab, (tabId) => {
      if (songs.value.length === 0) {
        void loadData(tabId)
      }
    }, { immediate: true })

    return {
      tabs,
      activeTab,
      songs,
      isLoading,
      playingIndex,
      currentSongId,
      dom_content_ref,
      switchTab,
      handlePlay,
      handleRefreshSimi,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  display: flex;
  flex-flow: row nowrap;
  height: 100%;
  border-top: var(--color-list-header-border-bottom);
}

.toc {
  flex: 0 0 16%;
  overflow-y: scroll;
}

.tocH2 {
  line-height: 1.5;
  .mixin-ellipsis-1();
  font-size: 13px;
  color: var(--color-font);
  padding: 8px 10px;
  transition: @transition-fast;
  transition-property: background-color, color;

  &:not(.active) {
    cursor: pointer;
    &:hover {
      background-color: var(--color-button-background-hover);
    }
  }
  &.active {
    color: var(--color-primary);
  }
}

.activeIcon {
  height: 0.9em;
  width: 0.9em;
  margin-left: -0.45em;
  vertical-align: -0.05em;
}

.tocList {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tocListItem {
  margin: 0;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
}

.contentHeader {
  flex: none;
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.refreshBtn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-button-font);
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    color: var(--color-primary);
    background: var(--color-primary-alpha-100);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.loading {
  padding: 40px;
  text-align: center;
  color: var(--color-font-label);
}

.empty {
  padding: 40px;
  text-align: center;
  color: var(--color-font-label);
}

.songList {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 14px;
  overflow: hidden;
  height: 100%;
}

.listContent {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.songItem {
  display: flex;
  align-items: center;
  padding: 8px 0;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background: var(--color-primary-background-hover);
  }

  &.playing {
    background: var(--color-primary-alpha-100);
  }
}

.index {
  width: 5%;
  text-align: center;
  color: var(--color-font-label);
  font-size: 13px;
  flex: none;
}

.pic {
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 10px;
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

.name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.songName {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.singer {
  flex: 0 0 24%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-font-label);
}

.album {
  flex: 0 0 27%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-font-label);
}

.time {
  flex: 0 0 10%;
  text-align: center;
  color: var(--color-font-label);
}

// 表头样式
.thead {
  flex: none;
  padding: 0 0 8px 0;
  border-bottom: 1px solid var(--color-border);

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    font-weight: normal;
    font-size: 13px;
    color: var(--color-font-label);
    text-align: left;
    padding: 4px 0;
    user-select: none;
  }
}
</style>
