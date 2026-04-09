<template>
  <div :class="$style.container">
    <div v-if="loading" :class="$style.loading">
      <p>加载中...</p>
    </div>
    <div v-else-if="error" :class="$style.error">
      <p>{{ error }}</p>
      <button @click="loadAlbumInfo">重试</button>
    </div>
    <template v-else-if="albumInfo">
      <!-- 专辑头部信息 -->
      <div :class="$style.header">
        <button :class="$style.backBtn" @click="$router.back()">
          <span>←</span> 返回
        </button>
        <img :src="albumInfo.album.picUrl" :class="$style.cover" />
        <div :class="$style.info">
          <h1 :class="$style.name">
            {{ albumInfo.album.name }}
          </h1>
          <div :class="$style.artist" @click.stop="handleArtistClick">
            艺人：{{ albumInfo.album.artist.name }}
          </div>
          <div :class="$style.stats">
            <span>歌曲: {{ albumInfo.album.size }}</span>
            <span>发行时间: {{ formatPublishTime(albumInfo.album.publishTime) }}</span>
          </div>
          <div v-if="albumInfo.album.description" :class="$style.desc" @click="toggleDescExpand" :title="isDescExpanded ? '点击收起' : '点击展开'">
            {{ isDescExpanded ? albumInfo.album.description : albumInfo.album.description.slice(0, 150) + (albumInfo.album.description.length > 150 ? '...' : '') }}
          </div>
        </div>
      </div>

      <!-- 歌曲列表工具栏 -->
      <div :class="$style.toolbar">
        <div :class="$style.pageInfo">
          共 {{ albumInfo.songs.length }} 首
        </div>
      </div>

      <!-- 歌曲列表 -->
      <div v-if="loadingSongs" :class="$style.loading">{{ $t('loading') }}</div>
      <div v-else-if="songs.length === 0" :class="$style.empty">{{ $t('list__empty') }}</div>
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
              <span :class="$style.albumName">{{ song.al?.name }}</span>
            </div>
            <div :class="$style.time">
              <span class="no-select">{{ song.interval }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, toRaw } from '@common/utils/vueTools'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import { playList } from '@renderer/core/player'
import { setTempList } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { toNewMusicInfo } from '@common/utils/tools'

export default {
  name: 'Album',
  data() {
    return {
      loading: true,
      loadingSongs: false,
      error: null,
      albumInfo: null,
      songs: [],
      playingIndex: -1,
      isDescExpanded: false,
    }
  },
  computed: {
    albumId() {
      return this.$route.query.id
    },
  },
  mounted() {
    this.loadAlbumInfo()
  },
  watch: {
    '$route.query.id'(newId, oldId) {
      if (newId !== oldId) {
        this.loading = true
        this.songs = []
        this.isDescExpanded = false
        this.loadAlbumInfo()
      }
    }
  },
  methods: {
    async loadAlbumInfo() {
      if (!this.albumId) {
        this.error = '缺少专辑ID'
        this.loading = false
        return
      }
      this.loading = true
      this.error = null
      try {
        const data = await wyUtil.getAlbumDetail(this.albumId)
        this.albumInfo = data
        this.processSongs(data.songs)
      } catch (err) {
        console.error('获取专辑详情失败:', err)
        this.error = err.message || '获取专辑详情失败'
      } finally {
        this.loading = false
      }
    },
    processSongs(songs) {
      this.songs = songs.map(song => ({
        id: song.id,
        name: song.name,
        singer: (song.ar || []).map(a => a.name).join('、'),
        source: 'wy',
        interval: this.formatDuration(song.dt),
        albumName: song.al?.name || this.albumInfo?.album?.name || '',
        albumId: song.al?.id || this.albumId,
        img: song.al?.picUrl || this.albumInfo?.album?.picUrl || '',
        al: song.al,
        ar: song.ar || [],
        fee: song.fee || 0,
      }))
    },
    handleArtistClick() {
      const artistId = this.albumInfo?.album?.artist?.id
      if (artistId) {
        this.$router.push({ path: '/artist', query: { id: artistId } })
      }
    },
    handleSingerClick(arItem) {
      const raw = toRaw(arItem)
      const id = raw?.id
      if (!id) return
      this.$router.push({ path: '/artist', query: { id } })
    },
    toggleDescExpand() {
      this.isDescExpanded = !this.isDescExpanded
    },
    formatDuration(ms) {
      if (!ms) return '--:--'
      const seconds = Math.floor(ms / 1000)
      const min = Math.floor(seconds / 60)
      const sec = seconds % 60
      return `${min}:${sec.toString().padStart(2, '0')}`
    },
    formatPublishTime(timestamp) {
      if (!timestamp) return '--'
      const date = new Date(timestamp)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    },
    async handlePlay(index) {
      this.playingIndex = index
      const formattedSongs = this.songs.map(s => {
        const ar = s.ar ? s.ar.map(a => ({ id: a.id, name: a.name })) : []
        return toNewMusicInfo(toRaw({
          ...s,
          ar,
          songmid: String(s.id),
          name: s.name,
          singer: s.singer,
          singerId: ar[0]?.id,
          source: 'wy',
          interval: s.interval,
          albumName: s.albumName,
          albumId: s.albumId,
          img: s.img,
          types: [],
          _types: {},
          meta: {
            songId: String(s.id),
            albumName: s.albumName || '',
            picUrl: s.img || '',
            albumId: s.albumId || '',
            singerId: ar[0]?.id,
            ar,
          },
        }))
      })
      await setTempList('wy_album_' + this.albumId, formattedSongs)
      void playList(LIST_IDS.TEMP, index)
    },
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
}

.loading,
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-font-label);

  button {
    margin-top: 16px;
    padding: 8px 24px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
}

.header {
  position: relative;
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}

.backBtn {
  position: absolute;
  top: 0;
  left: 0;
  padding: 8px 16px;
  background: var(--color-button-background);
  color: var(--color-button-font);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &:hover {
    background: var(--color-button-background-hover);
  }

  span {
    font-size: 16px;
  }
}

.cover {
  width: 200px;
  height: 200px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  margin-top: 40px;
}

.info {
  flex: 1;
  min-width: 0;
  margin-top: 40px;
}

.name {
  font-size: 20px;
  margin: 0 0 8px 0;
  color: var(--color-font);
}

.artist {
  color: var(--color-primary);
  margin-bottom: 12px;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}

.stats {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  color: var(--color-font-description);

  span {
    padding: 4px 12px;
    background: var(--color-button-background);
    border-radius: 4px;
  }
}

.desc {
  color: var(--color-font-description);
  font-size: 14px;
  line-height: 1.6;
  cursor: pointer;
  &:hover {
    color: var(--color-primary);
  }
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.pageInfo {
  color: var(--color-font-label);
  font-size: 14px;
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
  height: calc(100% - 180px);
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
  font-size: 13px;
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
  font-size: 13px;
}

.singerName {
  cursor: pointer;
  &:hover {
    color: var(--color-primary);
  }
}

.albumName {
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
  font-size: 13px;
}

.time {
  flex: 0 0 10%;
  text-align: center;
  color: var(--color-font-label);
  font-size: 13px;
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
