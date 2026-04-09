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
          v-if="activeTab === 'simi' || activeTab === 'playlist' || activeTab === 'heartbeat'"
          :class="$style.refreshBtn"
          :aria-label="$t('refresh')"
          :disabled="isLoading || (activeTab === 'simi' && !currentSongId) || (activeTab === 'playlist' && !currentSongId) || (activeTab === 'heartbeat' && !currentSongId)"
          @click="handleRefresh"
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
                  <span
                    v-for="(ar, arIndex) in song.ar"
                    :key="`${song.id}-${ar.id}`"
                    class="select"
                    :class="$style.singerName"
                    @click.stop="handleSingerClick(ar)"
                  >
                    {{ ar.name }}{{ arIndex < song.ar.length - 1 ? '、' : '' }}
                  </span>
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
                  <span
                    v-for="(ar, arIndex) in song.ar"
                    :key="`${song.id}-${ar.id}`"
                    class="select"
                    :class="$style.singerName"
                    @click.stop="handleSingerClick(ar)"
                  >
                    {{ ar.name }}{{ arIndex < song.ar.length - 1 ? '、' : '' }}
                  </span>
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

      <!-- 相似歌单 -->
      <template v-else-if="activeTab === 'playlist'">
        <div v-if="!currentSongId" :class="$style.empty">{{ $t('setting__wy_simi_playlist') }}: {{ $t('wy_need_play_song') }}</div>
        <div v-else-if="isLoading" :class="$style.loading">{{ $t('loading') }}</div>
        <template v-else>
          <div v-if="playlists.length === 0" :class="$style.empty">{{ $t('list__empty') }}</div>
          <div v-else :class="$style.playlistContainer">
            <ul :class="$style.playlistList">
              <li
                v-for="item in playlists"
                :key="item.id"
                :class="$style.playlistItem"
                @click="handlePlaylistClick(item)"
              >
                <div :class="$style.playlistImage">
                  <img :class="$style.playlistImg" loading="lazy" decoding="async" :src="item.img" />
                </div>
                <div :class="$style.playlistDesc">
                  <h4 :class="$style.playlistName">{{ item.name }}</h4>
                  <div :class="$style.playlistInfo">
                    <span><svg-icon name="music" />{{ item.total }}</span>
                    <span><svg-icon name="headphones" />{{ item.playCount }}</span>
                  </div>
                  <p :class="$style.playlistAuthor">{{ item.author }}</p>
                </div>
              </li>
              <li
                v-for="(i, index) in 6"
                :key="'placeholder_' + index"
                :class="$style.playlistItem"
                style="margin-bottom: 0; height: 0"
              />
            </ul>
          </div>
        </template>
      </template>

      <!-- 心动模式 -->
      <template v-else-if="activeTab === 'heartbeat'">
        <div v-if="!currentSongId" :class="$style.empty">{{ $t('setting__wy_heartbeat') }}: {{ $t('wy_need_play_song') }}</div>
        <template v-else>
          <!-- 歌单选择器 -->
          <div v-if="isLoadingPlaylists" :class="$style.loading">{{ $t('loading') }}</div>
          <div v-else-if="userPlaylists.length === 0" :class="$style.empty">{{ $t('list__empty') }}</div>
          <template v-else>
            <!-- 歌单选择下拉框 -->
            <div :class="$style.playlistSelector">
              <select
                :class="$style.select"
                :value="selectedPlaylistId || ''"
                @change="handleHeartbeatPlaylistSelect(Number($event.target.value))"
              >
                <option value="" disabled>请选择歌单</option>
                <option
                  v-for="playlist in userPlaylists"
                  :key="playlist.id"
                  :value="playlist.id"
                >
                  {{ playlist.name }} ({{ playlist.trackCount }})
                </option>
              </select>
            </div>
            <!-- 歌曲列表 -->
            <div v-if="isLoading" :class="$style.loading">{{ $t('loading') }}</div>
            <div v-else-if="songs.length === 0 && selectedPlaylistId" :class="$style.empty">{{ $t('list__empty') }}</div>
            <template v-else-if="songs.length > 0">
              <div :class="$style.songList">
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
                  <span
                    v-for="(ar, arIndex) in song.ar"
                    :key="`${song.id}-${ar.id}`"
                    class="select"
                    :class="$style.singerName"
                    @click.stop="handleSingerClick(ar)"
                  >
                    {{ ar.name }}{{ arIndex < song.ar.length - 1 ? '、' : '' }}
                  </span>
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
import heartbeat from '@renderer/utils/musicSdk/wy/heartbeat'
import { playList } from '@renderer/core/player'
import { setTempList } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { useI18n } from '@root/lang'
import { toNewMusicInfo } from '@common/utils/tools'
import { useRouter } from '@common/utils/vueRouter'

export default {
  name: 'WyCloud',
  setup() {
    const t = useI18n()
    const router = useRouter()
    const dom_content_ref = ref(null)

    const activeTab = ref('daily')
    const songs = ref([])
    const playlists = ref([])
    const isLoading = ref(false)
    const playingIndex = ref(-1)
    // 心动模式相关状态
    const userPlaylists = ref([])
    const selectedPlaylistId = ref(null)
    const isLoadingPlaylists = ref(false)

    const tabs = computed(() => [
      { id: 'daily', title: t('setting__wy_daily_rec') },
      { id: 'simi', title: t('setting__wy_simi_songs') },
      { id: 'playlist', title: t('setting__wy_simi_playlist') },
      { id: 'heartbeat', title: t('setting__wy_heartbeat') },
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
      playlists.value = []
      playingIndex.value = -1
      void nextTick(() => {
        dom_content_ref.value?.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
      })
      void loadData(tabId)
    }

    // 加载用户歌单列表
    const loadUserPlaylists = async () => {
      const cookie = appSetting['common.wy_cookie']
      if (!cookie) return []
      try {
        const uid = await wyUtil.getUid(cookie)
        return await wyUtil.getUserPlaylist(cookie, uid)
      } catch (e) {
        console.error('加载用户歌单失败:', e)
        return []
      }
    }

    // 处理心动模式歌单选择
    const handleHeartbeatPlaylistSelect = async (playlistId) => {
      selectedPlaylistId.value = playlistId
      if (!currentSongId.value || !playlistId) return
      const cookie = appSetting['common.wy_cookie']
      if (!cookie) return
      isLoading.value = true
      try {
        const result = await heartbeat.getHeartbeatModeList(cookie, playlistId, currentSongId.value)
        songs.value = result.list.map(song => ({
          id: song.id,
          name: song.name,
          singer: (song.ar || []).map(a => a.name).join('、'),
          source: 'wy',
          interval: formatDuration(song.dt),
          albumName: song.al?.name || '',
          albumId: song.al?.id || 0,
          img: song.al?.picUrl || '',
          al: song.al,
          ar: song.ar || [],
          fee: song.fee || 0,
        }))
      } catch (e) {
        console.error('Failed to load heartbeat data:', e)
        const errorMsg = e instanceof Error ? e.message : ''
        void dialog.confirm({
          message: `${t('setting__wy_heartbeat_load_failed')}${errorMsg ? ': ' + errorMsg : ''}`,
          confirmButtonText: t('ok'),
        })
      } finally {
        isLoading.value = false
      }
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
            ar: song.ar || [],
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
            ar: song.ar || [],
            fee: song.fee || 0,
          }))
        } else if (tabId === 'playlist') {
          if (!currentSongId.value) return
          const result = await wyUtil.getSimiPlaylist(currentSongId.value)
          playlists.value = result
        } else if (tabId === 'heartbeat') {
          if (!currentSongId.value) return
          // 加载用户歌单列表供选择
          isLoadingPlaylists.value = true
          try {
            userPlaylists.value = await loadUserPlaylists()
            selectedPlaylistId.value = null
            songs.value = []
          } catch (e) {
            console.error('加载用户歌单失败:', e)
          } finally {
            isLoadingPlaylists.value = false
          }
          // 不在这里调用心跳API，等用户选择歌单后再调用
          return
        }
      } catch (e) {
        console.error('Failed to load data:', e)
        let errorMsg = e instanceof Error ? e.message : ''
        if (tabId === 'heartbeat') {
          void dialog.confirm({
            message: `${t('setting__wy_heartbeat_load_failed')}${errorMsg ? ': ' + errorMsg : ''}`,
            confirmButtonText: t('ok'),
          })
        } else {
          void dialog.confirm({
            message: `${t('setting__wy_daily_rec_load_failed')}${errorMsg ? ': ' + errorMsg : ''}`,
            confirmButtonText: t('ok'),
          })
        }
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

    const handleRefresh = () => {
      if (isLoading.value) return
      if (activeTab.value === 'simi' && !currentSongId.value) return
      if (activeTab.value === 'playlist' && !currentSongId.value) return
      if (activeTab.value === 'heartbeat') {
        if (!currentSongId.value) return
        // 如果已选择歌单，刷新心动歌曲；否则重新加载歌单列表
        if (selectedPlaylistId.value) {
          void handleHeartbeatPlaylistSelect(selectedPlaylistId.value)
        } else {
          void loadData(activeTab.value)
        }
        return
      }
      void loadData(activeTab.value)
    }

    const handlePlaylistClick = (item) => {
      void router.push({
        path: '/songList/detail',
        query: {
          source: 'wy',
          id: String(item.id),
          picUrl: item.img,
          fromName: 'WyCloud',
        },
      })
    }

    const handleSingerClick = (arItem) => {
      if (!arItem?.id) return
      void router.push({ path: '/artist', query: { id: arItem.id } })
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
      if (tabId === 'daily' && songs.value.length === 0) {
        void loadData(tabId)
      } else if (tabId === 'simi' && songs.value.length === 0 && currentSongId.value) {
        void loadData(tabId)
      } else if (tabId === 'playlist' && playlists.value.length === 0 && currentSongId.value) {
        void loadData(tabId)
      }
    }, { immediate: true })

    return {
      tabs,
      activeTab,
      songs,
      playlists,
      isLoading,
      playingIndex,
      currentSongId,
      dom_content_ref,
      switchTab,
      handlePlay,
      handleRefresh,
      handlePlaylistClick,
      handleSingerClick,
      // 心动模式
      userPlaylists,
      selectedPlaylistId,
      isLoadingPlaylists,
      handleHeartbeatPlaylistSelect,
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

.singerName {
  cursor: pointer;
  &:hover {
    color: var(--color-primary);
  }
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

// 相似歌单样式
.playlistContainer {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.playlistList {
  display: flex;
  flex-flow: row wrap;
  justify-content: space-between;
}

.playlistItem {
  max-width: 360px;
  width: 32%;
  box-sizing: border-box;
  display: flex;
  margin-bottom: 20px;
  cursor: pointer;
  transition: opacity @transition-normal;
  &:hover {
    opacity: 0.7;
  }
}

.playlistImage {
  flex: none;
  width: 40%;
  display: flex;
  background-position: center;
  background-size: cover;
  border-radius: 4px;
  overflow: hidden;
  opacity: 0.9;
  aspect-ratio: 1 / 1;
  box-shadow: 0 0 2px 0 rgba(0, 0, 0, 0.2);
}

.playlistImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlistDesc {
  flex: auto;
  padding: 2px 15px 2px 7px;
  overflow: hidden;
}

.playlistName {
  font-size: 14px;
  text-align: justify;
  line-height: 1.3;
  .mixin-ellipsis-2();
}

.playlistInfo {
  display: flex;
  flex-flow: row nowrap;
  gap: 15px;
  margin-top: 8px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: justify;
  line-height: 1.2;
  color: var(--color-font-label);
  svg {
    margin-right: 2px;
  }
}

.playlistAuthor {
  margin-top: 6px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: justify;
  line-height: 1.3;
  color: var(--color-font-label);
}

// 心动模式歌单选择器
.playlistSelector {
  padding: 10px 0 15px 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 10px;
}

.select {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-button-background);
  color: var(--color-font);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--color-primary);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}
</style>
