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
      <!-- 每日推荐 -->
      <template v-if="activeTab === 'daily'">
        <div v-if="isLoading" :class="$style.loading">{{ $t('loading') }}</div>
        <template v-else>
          <div v-if="songs.length === 0" :class="$style.empty">{{ $t('list__empty') }}</div>
          <div :class="$style.songList">
            <div
              v-for="(song, index) in songs"
              :key="song.id"
              :class="[$style.songItem, { [$style.playing]: playingIndex === index }]"
              @dblclick="handlePlay(index)"
            >
              <span :class="$style.index">{{ index + 1 }}</span>
              <div :class="$style.info">
                <span :class="$style.name">{{ song.name }}</span>
                <span :class="$style.singer">{{ song.singer }}</span>
              </div>
              <div :class="$style.actions">
                <button :class="$style.playBtn" @click.stop="handlePlay(index)">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    xlink="http://www.w3.org/1999/xlink"
                    height="60%"
                    viewBox="0 0 512 512"
                    space="preserve"
                  >
                    <use xlink:href="#icon-play" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- 心动模式 -->
      <template v-else-if="activeTab === 'heartbeat'">
        <div v-if="!currentSongId" :class="$style.empty">{{ $t('setting__wy_heartbeat_mode') }}: {{ $t('wy_need_play_song') }}</div>
        <div v-else-if="isLoading" :class="$style.loading">{{ $t('loading') }}</div>
        <template v-else>
          <div v-if="songs.length === 0" :class="$style.empty">{{ $t('list__empty') }}</div>
          <div :class="$style.songList">
            <div
              v-for="(song, index) in songs"
              :key="song.id"
              :class="[$style.songItem, { [$style.playing]: playingIndex === index }]"
              @dblclick="handlePlay(index)"
            >
              <span :class="$style.index">{{ index + 1 }}</span>
              <div :class="$style.info">
                <span :class="$style.name">{{ song.name }}</span>
                <span :class="$style.singer">{{ song.singer }}</span>
              </div>
              <div :class="$style.actions">
                <button :class="$style.playBtn" @click.stop="handlePlay(index)">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    xlink="http://www.w3.org/1999/xlink"
                    height="60%"
                    viewBox="0 0 512 512"
                    space="preserve"
                  >
                    <use xlink:href="#icon-play" />
                  </svg>
                </button>
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
          <div :class="$style.songList">
            <div
              v-for="(song, index) in songs"
              :key="song.id"
              :class="[$style.songItem, { [$style.playing]: playingIndex === index }]"
              @dblclick="handlePlay(index)"
            >
              <span :class="$style.index">{{ index + 1 }}</span>
              <div :class="$style.info">
                <span :class="$style.name">{{ song.name }}</span>
                <span :class="$style.singer">{{ song.singer }}</span>
              </div>
              <div :class="$style.actions">
                <button :class="$style.playBtn" @click.stop="handlePlay(index)">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    xlink="http://www.w3.org/1999/xlink"
                    height="60%"
                    viewBox="0 0 512 512"
                    space="preserve"
                  >
                    <use xlink:href="#icon-play" />
                  </svg>
                </button>
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
import { musicInfo } from '@renderer/store/player/state'
import { dialog } from '@renderer/plugins/Dialog'
import wyDailyRec from '@renderer/utils/musicSdk/wy/dailyRec'
import wyUser from '@renderer/utils/musicSdk/wy/user'
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
      { id: 'heartbeat', title: t('setting__wy_heartbeat_mode') },
      { id: 'simi', title: t('setting__wy_simi_songs') },
    ])

    const currentSongId = computed(() => {
      const info = musicInfo.musicInfo
      if (!info || !info.meta || !info.meta.songId) return null
      // 心动模式和相似歌曲只支持网易云歌曲
      if (info.source !== 'wy') return null
      return info.meta.songId
    })

    // 验证 Cookie 是否有效
    const validateCookie = async () => {
      const cookie = appSetting['common.wy_cookie']
      if (!cookie) {
        cookieValid.value = false
        return false
      }
      try {
        const result = await wyUser.verifyCookie(cookie)
        cookieValid.value = result.valid
        return result.valid
      } catch {
        cookieValid.value = false
        return false
      }
    }

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

      // 先验证 Cookie 是否有效
      const isValid = await validateCookie()
      if (!isValid) {
        void dialog.confirm({
          message: t('setting__wy_login_invalid_cookie'),
          confirmButtonText: t('ok'),
        })
        return
      }

      isLoading.value = true
      try {
        if (tabId === 'daily') {
          const result = await wyDailyRec.getDailySongs(cookie)
          // 格式化为 toNewMusicInfo 期望的格式
          songs.value = result.recommend.map(song => ({
            songmid: String(song.id),
            name: song.name,
            singer: (song.ar || []).map(a => a.name).join('、'),
            source: 'wy',
            interval: formatDuration(song.dt),
            albumName: song.al?.name || '',
            albumId: song.al?.id || 0,
            img: song.al?.picUrl || '',
            types: [],
            _types: {},
          }))
        } else if (tabId === 'heartbeat') {
          if (!currentSongId.value) return
          // 获取当前播放歌曲所属歌单ID（如果有的话）
          const playlistId = musicInfo.musicInfo?.meta?.playlistId || 0
          const result = await wyDailyRec.getHeartbeatSongs(
            currentSongId.value,
            playlistId,
            cookie
          )
          songs.value = result.map(song => ({
            songmid: String(song.songId),
            name: song.songName,
            singer: (song.artists || []).map(a => a.name || a.nickname || '').join('、'),
            source: 'wy',
            interval: formatDuration(song.duration),
            albumName: song.albumName || '',
            albumId: song.albumId || 0,
            img: song.albumId ? `https://p3.music.126.net/${song.albumId}/300.jpg` : '',
            types: [],
            _types: {},
          }))
        } else if (tabId === 'simi') {
          if (!currentSongId.value) return
          const result = await wyDailyRec.getSimiSongs(currentSongId.value)
          songs.value = result.map(song => ({
            songmid: String(song.id),
            name: song.name,
            singer: (song.ar || []).map(a => a.name).join('、'),
            source: 'wy',
            interval: formatDuration(song.dt),
            albumName: song.al?.name || '',
            albumId: song.al?.id || 0,
            img: song.al?.picUrl || '',
            types: [],
            _types: {},
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
      // 使用 toNewMusicInfo 转换格式，并用 toRaw + markRawList 去除响应式
      const formattedSongs = markRawList(songs.value.map(s => toNewMusicInfo(toRaw(s))))
      await setTempList('wy_cloud_' + activeTab.value, formattedSongs)
      void playList(LIST_IDS.TEMP, index)
    }

    const formatDuration = (ms) => {
      if (!ms) return ''
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
  padding: 0;
}

.songItem {
  display: flex;
  align-items: center;
  padding: 8px 15px;
  cursor: pointer;

  &:hover {
    background: var(--color-primary-background-hover);
  }

  &.playing {
    background: var(--color-primary-alpha-100);
  }
}

.index {
  width: 30px;
  text-align: center;
  color: var(--color-font-label);
  font-size: 13px;
  flex: none;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 14px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.singer {
  font-size: 12px;
  color: var(--color-font-label);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.actions {
  flex: none;
  width: 60px;
  display: flex;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;

  .songItem:hover & {
    opacity: 1;
  }
}

.playBtn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-button-font);
  padding: 4px;

  &:hover {
    color: var(--color-primary);
  }
}
</style>
