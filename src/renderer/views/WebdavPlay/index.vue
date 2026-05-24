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
              <svg-icon v-if="activeTab === tab.id" name="angle-right-solid" :class="$style.activeIcon" />
            </transition>
            {{ tab.title }}
          </h2>
        </li>
      </ul>
    </div>

    <div ref="dom_content_ref" class="scroll" :class="$style.content">
      <!-- 目录浏览 -->
      <template v-if="activeTab === 'browse'">
        <div :class="$style.panel">
          <div :class="$style.panelRow">
            <span :class="$style.label">{{ $t('webdav_play__status') }}</span>
            <span :class="connected ? $style.statusOk : $style.statusOff">
              {{ connected ? $t('webdav_play__connected') : $t('webdav_play__disconnected') }}
            </span>
          </div>
          <div v-if="!isConfigured" :class="$style.tip">
            {{ $t('webdav_play__not_configured') }}
            <a :class="$style.link" @click="goSetting">{{ $t('webdav_play__go_setting') }}</a>
          </div>
          <div :class="$style.btnRow">
            <button :class="$style.btn" :disabled="loading || !isConfigured" @click="handleTest">
              {{ $t('webdav_play__test') }}
            </button>
            <span v-if="statusText" :class="$style.tip">{{ statusText }}</span>
          </div>
        </div>

        <div :class="$style.panel">
          <div :class="$style.panelRow">
            <span :class="$style.label">{{ $t('webdav_play__current_dir') }}</span>
            <span :class="$style.dirText">{{ folderName(currentFolder) }}</span>
          </div>
          <div :class="$style.panelRow">
            <span :class="$style.label">{{ $t('webdav_play__selected_dir') }}</span>
            <span :class="$style.dirText">{{ folderName(selectedFolder) }}</span>
          </div>
          <div :class="$style.btnRow">
            <button
              :class="$style.btn"
              :disabled="!connected || folderLoading || !folderStack.length"
              @click="backFolder"
            >
              {{ $t('webdav_play__back') }}
            </button>
            <button :class="$style.btn" :disabled="!connected || loading" @click="selectFolder">
              {{ $t('webdav_play__select_dir') }}
            </button>
            <button :class="$style.btn" :disabled="!connected || loading" @click="scan">
              {{ $t('webdav_play__scan') }}
            </button>
          </div>
          <div v-if="folderLoading" :class="$style.tip">{{ $t('webdav_play__dir_loading') }}</div>
          <div v-else-if="folders.length" :class="$style.folderList">
            <div
              v-for="folder in folders"
              :key="folder.path"
              :class="$style.folderItem"
              @click="enterFolder(folder)"
            >
              <svg-icon name="music" :class="$style.folderIcon" />
              <div :class="$style.folderInfo">
                <span :class="$style.folderName">{{ folder.name }}</span>
                <span :class="$style.folderPath">{{ folder.path }}</span>
              </div>
            </div>
          </div>
          <div v-else :class="$style.tip">
            {{ connected ? $t('webdav_play__no_subdir') : $t('webdav_play__test_first') }}
          </div>
        </div>
      </template>

      <!-- 全部歌曲 -->
      <template v-else-if="activeTab === 'songs'">
        <div :class="$style.listHeader">
          <input
            v-model="searchText"
            :class="$style.search"
            :placeholder="$t('webdav_play__search_placeholder')"
          />
          <span :class="$style.headerInfo">{{ scanText || headerText }}</span>
          <button :class="$style.btn" :disabled="!connected || loading" @click="scan">
            {{ $t('webdav_play__rescan') }}
          </button>
        </div>
        <div v-if="!filteredSongs.length" :class="$style.empty">
          {{ searchText.trim() ? $t('webdav_play__no_match') : $t('webdav_play__no_songs') }}
        </div>
        <div v-else :class="$style.songList">
          <div
            v-for="(song, index) in filteredSongs"
            :key="song.id"
            :class="[$style.songItem, { [$style.playing]: playingId === song.id }]"
            @dblclick="play(filteredSongs, song)"
          >
            <div :ref="(el) => registerCover(el, song)" :class="$style.pic">
              <img v-if="song.meta.picUrl" :src="song.meta.picUrl" :class="$style.picImg" loading="lazy" />
              <svg-icon v-else name="music" :class="$style.picPlaceholder" />
            </div>
            <div :class="$style.songMain">
              <span :class="$style.songName">{{ song.name || song.meta.fileName }}</span>
              <span :class="$style.songSinger">{{ song.singer || song.meta.filePath }}</span>
            </div>
            <span :class="$style.songMeta">{{ detailText(song) }}</span>
          </div>
        </div>
      </template>

      <!-- 歌单 -->
      <template v-else-if="activeTab === 'playlists'">
        <template v-if="currentPlaylist">
          <div :class="$style.listHeader">
            <button :class="$style.btn" @click="currentPlaylist = null">{{ $t('webdav_play__back') }}</button>
            <span :class="$style.headerInfo">
              {{ currentPlaylist.name }} · {{ playlistSongsLoading ? $t('loading') : `${playlistSongs.length}` }}
            </span>
          </div>
          <div v-if="!playlistSongs.length" :class="$style.empty">
            {{ playlistSongsLoading ? $t('loading') : $t('webdav_play__playlist_empty') }}
          </div>
          <div v-else :class="$style.songList">
            <div
              v-for="song in playlistSongs"
              :key="song.id"
              :class="[$style.songItem, { [$style.playing]: playingId === song.id }]"
              @dblclick="play(playlistSongs, song)"
              @contextmenu.prevent="showSongMenu($event, song)"
            >
              <div :ref="(el) => registerCover(el, song, false)" :class="$style.pic">
                <img v-if="song.meta.picUrl" :src="song.meta.picUrl" :class="$style.picImg" loading="lazy" />
                <svg-icon v-else name="music" :class="$style.picPlaceholder" />
              </div>
              <div :class="$style.songMain">
                <span :class="$style.songName">{{ song.name || song.meta.fileName }}</span>
                <span :class="$style.songSinger">{{ song.singer }}</span>
              </div>
              <span :class="$style.songMeta">{{ detailText(song) }}</span>
            </div>
          </div>
        </template>
        <template v-else>
          <div :class="$style.listHeader">
            <span :class="$style.headerInfo">{{ folderName(selectedFolder) }}</span>
            <button :class="$style.btn" :disabled="!selectedFolder || playlistsLoading" @click="loadPlaylists">
              {{ $t('refresh') }}
            </button>
          </div>
          <div v-if="!playlists.length" :class="$style.empty">
            {{
              playlistsLoading
                ? $t('loading')
                : selectedFolder
                  ? $t('webdav_play__no_playlist')
                  : $t('webdav_play__select_first')
            }}
          </div>
          <div v-else :class="$style.songList">
            <div
              v-for="pl in playlists"
              :key="pl.folder.path"
              :class="$style.songItem"
              @click="openPlaylist(pl)"
              @contextmenu.prevent="showPlaylistMenu($event, pl)"
            >
              <div :class="$style.pic">
                <svg-icon name="music" :class="$style.picPlaceholder" />
              </div>
              <div :class="$style.songMain">
                <span :class="$style.songName">{{ pl.name }}</span>
                <span :class="$style.songSinger">{{ playlistSubtitle(pl) }}</span>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>

    <base-menu
      v-model="isShowItemMenu"
      :menus="menuItems"
      :xy="menuLocation"
      item-name="name"
      @menu-click="handleMenuClick"
    />

    <material-modal :show="isShowRename" @close="isShowRename = false">
      <div :class="$style.renameModal">
        <h2 :class="$style.renameTitle">{{ $t('webdav_play__rename_title') }}</h2>
        <base-input
          v-model="renameText"
          :class="$style.renameInput"
          :placeholder="$t('webdav_play__rename_placeholder')"
          @submit="confirmRename"
        />
        <div :class="$style.renameBtns">
          <button :class="$style.btn" @click="isShowRename = false">{{ $t('cancel') }}</button>
          <button :class="$style.btn" @click="confirmRename">{{ $t('ok') }}</button>
        </div>
      </div>
    </material-modal>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onBeforeUnmount, toRaw } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { playMusicInfo } from '@renderer/store/player/state'
import { dialog } from '@renderer/plugins/Dialog'
import { playList } from '@renderer/core/player'
import { setTempList } from '@renderer/store/list/action'
import { getPicPath } from '@renderer/core/music'
import { LIST_IDS } from '@common/constants'
import { useI18n } from '@root/lang'
import { useRouter } from '@common/utils/vueRouter'
import {
  getWebDAVPlayConfig,
  resetWebDAVPlayClient,
  saveWebDAVPlayConfig,
  testWebDAVPlayConnection,
} from '@renderer/core/webdavPlay/client'
import {
  deleteWebDAVPlaylist,
  deleteWebDAVPlaylistSong,
  generateWebDAVPlaylistManifest,
  listWebDAVFolders,
  listWebDAVPlaylists,
  loadWebDAVPlaylist,
  renameWebDAVPlaylist,
  saveWebDAVSelectedFolder,
  scanWebDAVSongs,
} from '@renderer/core/webdavPlay/drive'

const formatTime = (time) => (time ? new Date(time).toLocaleString() : '')
const formatSize = (size) => {
  if (!size) return ''
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export default {
  name: 'WebdavPlay',
  setup() {
    const t = useI18n()
    const router = useRouter()
    const dom_content_ref = ref(null)

    const activeTab = ref('browse')
    const connected = ref(false)
    const statusText = ref('')
    const loading = ref(false)

    const folderStack = ref([])
    const folders = ref([])
    const folderLoading = ref(false)
    const selectedFolder = ref(null)
    const songs = ref([])
    const scannedAt = ref(undefined)
    const scanText = ref('')
    const searchText = ref('')

    const playlists = ref([])
    const playlistsLoading = ref(false)
    const currentPlaylist = ref(null)
    const playlistSongs = ref([])
    const playlistSongsLoading = ref(false)

    const isShowItemMenu = ref(false)
    const menuLocation = reactive({ x: 0, y: 0 })
    const menuTarget = ref(null) // { type: 'playlist', playlist } | { type: 'song', song, folder }
    const isShowRename = ref(false)
    const renameText = ref('')
    const renameTarget = ref(null)

    const menuItems = computed(() => {
      if (menuTarget.value?.type === 'playlist') {
        return [
          { action: 'rename', name: t('webdav_play__menu_rename') },
          { action: 'generate', name: t('webdav_play__menu_generate') },
          { action: 'delete', name: t('webdav_play__menu_delete') },
        ]
      }
      if (menuTarget.value?.type === 'song') {
        return [{ action: 'removeSong', name: t('webdav_play__menu_remove_song') }]
      }
      return []
    })

    const tabs = computed(() => [
      { id: 'browse', title: t('webdav_play__tab_browse') },
      { id: 'songs', title: t('webdav_play__tab_songs') },
      { id: 'playlists', title: t('webdav_play__tab_playlists') },
    ])

    const isConfigured = computed(
      () => !!appSetting['webdavPlay.url']?.trim() && !!appSetting['webdavPlay.username']?.trim()
    )
    const currentFolder = computed(() => folderStack.value[folderStack.value.length - 1] ?? null)
    const playingId = computed(() => playMusicInfo.musicInfo?.id ?? null)

    const filteredSongs = computed(() => {
      const text = searchText.value.trim().toLowerCase()
      if (!text) return songs.value
      return songs.value.filter((item) =>
        [item.name, item.singer, item.meta.fileName, item.meta.filePath].some((v) =>
          (v ?? '').toLowerCase().includes(text)
        )
      )
    })

    const headerText = computed(() => {
      if (searchText.value.trim()) return `${filteredSongs.value.length}/${songs.value.length}`
      return `${songs.value.length}${scannedAt.value ? ` · ${formatTime(scannedAt.value)}` : ''}`
    })

    const folderName = (folder) => folder?.path || t('webdav_play__root')
    const detailText = (song) => {
      const time = song.meta.lastModifiedTime
        ? new Date(song.meta.lastModifiedTime).toLocaleDateString()
        : ''
      return [formatSize(song.meta.size), time].filter(Boolean).join(' · ')
    }
    const playlistSubtitle = (pl) => {
      const countText = pl.hasManifest
        ? `${pl.songCount} ${t('webdav_play__songs_unit')}`
        : t('webdav_play__no_manifest')
      return [countText, formatSize(pl.totalSize)].filter(Boolean).join(' · ')
    }

    const loadConfig = async () => {
      const config = await getWebDAVPlayConfig()
      selectedFolder.value = config.selectedFolder ?? null
      songs.value = config.songs ?? []
      scannedAt.value = config.scannedAt
    }

    const loadFolders = async (folder) => {
      folderLoading.value = true
      try {
        folders.value = await listWebDAVFolders(folder)
      } catch (err) {
        folders.value = []
        toast(err)
      } finally {
        folderLoading.value = false
      }
    }

    const toast = (err) => {
      const message = err instanceof Error ? err.message : String(err)
      void dialog({ message, confirmButtonText: t('ok') })
    }

    const handleTest = async () => {
      if (!isConfigured.value) return
      loading.value = true
      statusText.value = t('webdav_play__testing')
      resetWebDAVPlayClient()
      try {
        await testWebDAVPlayConnection()
        connected.value = true
        folderStack.value = []
        statusText.value = t('webdav_play__test_success')
        await loadFolders(null)
      } catch (err) {
        connected.value = false
        statusText.value = err instanceof Error ? err.message : String(err)
        toast(err)
      } finally {
        loading.value = false
      }
    }

    const enterFolder = (folder) => {
      folderStack.value = [...folderStack.value, folder]
      void loadFolders(folder)
    }
    const backFolder = () => {
      folderStack.value = folderStack.value.slice(0, -1)
      void loadFolders(currentFolder.value)
    }

    const selectFolder = async () => {
      loading.value = true
      try {
        const config = await saveWebDAVSelectedFolder(currentFolder.value)
        selectedFolder.value = config.selectedFolder ?? null
        statusText.value = `${t('webdav_play__selected')}: ${folderName(config.selectedFolder)}`
      } catch (err) {
        toast(err)
      } finally {
        loading.value = false
      }
    }

    const runScan = async () => {
      loading.value = true
      scanText.value = t('webdav_play__scan_start')
      try {
        const config = await scanWebDAVSongs(selectedFolder.value, (count, path) => {
          scanText.value = t('webdav_play__scanning', { count, path })
        })
        songs.value = config.songs
        scannedAt.value = config.scannedAt
        scanText.value = ''
        activeTab.value = 'songs'
      } catch (err) {
        scanText.value = err instanceof Error ? err.message : String(err)
        toast(err)
      } finally {
        loading.value = false
      }
    }

    const scan = async () => {
      if (!connected.value) {
        statusText.value = t('webdav_play__test_first')
        activeTab.value = 'browse'
        return
      }
      if (!selectedFolder.value) {
        const confirmed = await dialog.confirm({
          message: t('webdav_play__scan_root_confirm'),
          confirmButtonText: t('webdav_play__scan_continue'),
          cancelButtonText: t('cancel'),
        })
        if (!confirmed) return
      }
      await runScan()
    }

    const rawList = (list) => list.map((s) => structuredClone(toRaw(s)))
    const play = (list, song) => {
      const index = list.findIndex((item) => item.id === song.id)
      if (index < 0) return
      void setTempList(`webdav_${activeTab.value}`, rawList(list)).then(() => {
        void playList(LIST_IDS.TEMP, index)
      })
    }

    const loadPlaylists = async () => {
      if (!selectedFolder.value) {
        playlists.value = []
        return
      }
      playlistsLoading.value = true
      try {
        playlists.value = await listWebDAVPlaylists(selectedFolder.value)
      } catch (err) {
        toast(err)
      } finally {
        playlistsLoading.value = false
      }
    }

    const openPlaylist = async (pl) => {
      currentPlaylist.value = pl
      playlistSongs.value = []
      playlistSongsLoading.value = true
      try {
        playlistSongs.value = await loadWebDAVPlaylist(pl.folder)
      } catch (err) {
        toast(err)
      } finally {
        playlistSongsLoading.value = false
      }
    }

    const showPlaylistMenu = (event, playlist) => {
      menuTarget.value = { type: 'playlist', playlist }
      menuLocation.x = event.pageX
      menuLocation.y = event.pageY
      isShowItemMenu.value = true
    }
    const showSongMenu = (event, song) => {
      const folder = currentPlaylist.value?.folder
      if (!folder) return
      menuTarget.value = { type: 'song', song, folder }
      menuLocation.x = event.pageX
      menuLocation.y = event.pageY
      isShowItemMenu.value = true
    }

    const confirmRename = async () => {
      const playlist = renameTarget.value
      const newName = renameText.value.trim()
      if (!playlist || !newName) return
      isShowRename.value = false
      try {
        const newFolder = await renameWebDAVPlaylist(playlist.folder, newName)
        if (currentPlaylist.value?.folder.path === playlist.folder.path) {
          currentPlaylist.value = { ...currentPlaylist.value, folder: newFolder, name: newName }
        }
        await loadPlaylists()
        toast(t('webdav_play__renamed'))
      } catch (err) {
        toast(err)
      }
    }

    const handleMenuClick = (item) => {
      const target = menuTarget.value
      if (!item || !target) return
      switch (item.action) {
        case 'rename':
          if (target.type !== 'playlist') return
          renameTarget.value = target.playlist
          renameText.value = target.playlist.name
          isShowRename.value = true
          break
        case 'generate':
          if (target.type !== 'playlist') return
          void generateWebDAVPlaylistManifest(target.playlist.folder)
            .then((count) => {
              toast(t('webdav_play__generated', { count }))
              void loadPlaylists()
            })
            .catch((err) => toast(err))
          break
        case 'delete': {
          if (target.type !== 'playlist') return
          const playlist = target.playlist
          void dialog
            .confirm({
              message: t('webdav_play__delete_confirm', { name: playlist.name }),
              confirmButtonText: t('webdav_play__delete_btn'),
              cancelButtonText: t('cancel'),
            })
            .then((confirmed) => {
              if (!confirmed) return
              void deleteWebDAVPlaylist(playlist.folder)
                .then(() => {
                  if (currentPlaylist.value?.folder.path === playlist.folder.path) {
                    currentPlaylist.value = null
                  }
                  void loadPlaylists()
                  toast(t('webdav_play__deleted'))
                })
                .catch((err) => toast(err))
            })
          break
        }
        case 'removeSong': {
          if (target.type !== 'song') return
          const { song, folder } = target
          void dialog
            .confirm({
              message: t('webdav_play__remove_song_confirm', {
                name: song.name || song.meta.fileName,
              }),
              confirmButtonText: t('webdav_play__remove_song_btn'),
              cancelButtonText: t('cancel'),
            })
            .then((confirmed) => {
              if (!confirmed) return
              void deleteWebDAVPlaylistSong(folder, song)
                .then(() => {
                  playlistSongs.value = playlistSongs.value.filter((s) => s.id !== song.id)
                  toast(t('webdav_play__song_removed'))
                })
                .catch((err) => toast(err))
            })
          break
        }
      }
    }

    const switchTab = (id) => {
      activeTab.value = id
      if (id === 'playlists' && !currentPlaylist.value && !playlists.value.length) void loadPlaylists()
    }

    const goSetting = () => {
      void router.push({ path: '/setting', query: { name: 'SettingWebdav' } })
    }

    // 封面懒加载:仅对进入视口的行从在线源补封面,写回 meta 并防抖持久化
    let observer = null
    const elSongMap = new WeakMap()
    let persistTimer = null
    const schedulePersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        void getWebDAVPlayConfig().then((config) => {
          config.songs = rawList(songs.value)
          saveWebDAVPlayConfig(config)
        })
      }, 3000)
    }
    const registerCover = (el, song, persist = true) => {
      if (!el || !observer) return
      if (song.meta.picUrl) return
      elSongMap.set(el, { song, persist })
      observer.observe(el)
    }

    onMounted(() => {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const el = entry.target
            const entryData = elSongMap.get(el)
            observer.unobserve(el)
            elSongMap.delete(el)
            if (!entryData || entryData.song.meta.picUrl) continue
            const { song, persist } = entryData
            void getPicPath({ musicInfo: song, isRefresh: false, listId: null })
              .then((url) => {
                if (url) {
                  song.meta.picUrl = url
                  if (persist) schedulePersist()
                }
              })
              .catch(() => {})
          }
        },
        { rootMargin: '100px' }
      )
      void loadConfig().then(() => {
        if (isConfigured.value) void handleTest()
      })
    })
    onBeforeUnmount(() => {
      if (observer) observer.disconnect()
      if (persistTimer) clearTimeout(persistTimer)
    })

    return {
      dom_content_ref,
      tabs,
      activeTab,
      connected,
      statusText,
      loading,
      isConfigured,
      folderStack,
      folders,
      folderLoading,
      currentFolder,
      selectedFolder,
      songs,
      scanText,
      searchText,
      filteredSongs,
      headerText,
      playingId,
      playlists,
      playlistsLoading,
      currentPlaylist,
      playlistSongs,
      playlistSongsLoading,
      isShowItemMenu,
      menuLocation,
      menuItems,
      isShowRename,
      renameText,
      folderName,
      detailText,
      playlistSubtitle,
      switchTab,
      handleTest,
      enterFolder,
      backFolder,
      selectFolder,
      scan,
      play,
      loadPlaylists,
      openPlaylist,
      showPlaylistMenu,
      showSongMenu,
      handleMenuClick,
      confirmRename,
      goSetting,
      registerCover,
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
  overflow-y: auto;
}
.tocList {
  list-style: none;
  padding: 0;
  margin: 0;
}
.tocListItem {
  margin: 0;
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
.content {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
}
.panel {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}
.panelRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
}
.label {
  color: var(--color-font-label);
  flex: none;
}
.dirText {
  .mixin-ellipsis-1();
  color: var(--color-font);
}
.statusOk {
  color: var(--color-primary);
  font-weight: bold;
}
.statusOff {
  color: var(--color-font-label);
}
.btnRow {
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.btn {
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-button-background);
  color: var(--color-button-font);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  &:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.tip {
  font-size: 12px;
  color: var(--color-font-label);
  line-height: 1.6;
  margin-top: 6px;
}
.link {
  color: var(--color-primary);
  cursor: pointer;
  margin-left: 4px;
}
.folderList {
  margin-top: 10px;
}
.folderItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  &:hover {
    background: var(--color-primary-background-hover);
  }
}
.folderIcon {
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--color-font-label);
}
.folderInfo {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.folderName {
  .mixin-ellipsis-1();
  font-size: 13px;
}
.folderPath {
  .mixin-ellipsis-1();
  font-size: 11px;
  color: var(--color-font-label);
}
.listHeader {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
}
.search {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-main-background);
  color: var(--color-font);
  font-size: 13px;
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}
.headerInfo {
  flex: 1;
  .mixin-ellipsis-1();
  font-size: 12px;
  color: var(--color-font-label);
}
.empty {
  padding: 40px;
  text-align: center;
  color: var(--color-font-label);
}
.songList {
  flex: 1;
  min-height: 0;
}
.songItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-radius: 4px;
  cursor: pointer;
  &:hover {
    background: var(--color-primary-background-hover);
  }
  &.playing {
    background: var(--color-primary-background-active);
    .songName {
      color: var(--color-button-font);
    }
  }
}
.pic {
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.picImg {
  width: 38px;
  height: 38px;
  border-radius: 4px;
  object-fit: cover;
}
.picPlaceholder {
  width: 20px;
  height: 20px;
  color: var(--color-font-label);
}
.songMain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.songName {
  .mixin-ellipsis-1();
  font-size: 14px;
}
.songSinger {
  .mixin-ellipsis-1();
  font-size: 12px;
  color: var(--color-font-label);
  margin-top: 2px;
}
.songMeta {
  flex: none;
  font-size: 11px;
  color: var(--color-font-label);
}
.renameModal {
  padding: 18px;
  width: 320px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.renameTitle {
  font-size: 14px;
  color: var(--color-font);
}
.renameInput {
  width: 100%;
}
.renameBtns {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
