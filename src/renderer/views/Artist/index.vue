<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <button :class="$style.backBtn" @click="$router.back()">
        <span>←</span> 返回
      </button>
    </div>
    <div v-if="loading" :class="$style.loading">
      <p>加载中...</p>
    </div>
    <div v-else-if="error" :class="$style.error">
      <p>{{ error }}</p>
      <button @click="loadArtistInfo">重试</button>
    </div>
    <template v-else-if="artistInfo">
      <div :class="$style.header">
        <img :src="artistInfo.artist.cover" :class="$style.cover" />
        <div :class="$style.info">
          <h1 :class="$style.name">
            {{ artistInfo.artist.name }}
            <span v-if="artistInfo.artist.transNames?.length" :class="$style.transName">
              ({{ artistInfo.artist.transNames.join(', ') }})
            </span>
          </h1>
          <div v-if="artistInfo.artist.alias?.length" :class="$style.alias">
            {{ artistInfo.artist.alias.join(', ') }}
          </div>
          <div :class="$style.stats">
            <span>歌曲: {{ artistInfo.artist.musicSize }}</span>
            <span>专辑: {{ artistInfo.artist.albumSize }}</span>
            <span>MV: {{ artistInfo.artist.mvSize }}</span>
          </div>
          <div v-if="artistInfo.artist.briefDesc" :class="$style.desc">
            {{ artistInfo.artist.briefDesc }}
          </div>
        </div>
      </div>
      <div :class="$style.content">
        <div :class="$style.toolbar">
          <div :class="$style.tabs">
            <button
              :class="[$style.tab, { [$style.active]: order === 'hot' }]"
              @click="switchOrder('hot')"
            >
              热门
            </button>
            <button
              :class="[$style.tab, { [$style.active]: order === 'time' }]"
              @click="switchOrder('time')"
            >
              最新
            </button>
          </div>
          <div :class="$style.pageInfo">
            第{{ currentPage }}页/共{{ totalPages }}页
          </div>
        </div>
        <div v-if="loadingSongs" :class="$style.loadingSongs">
          <p>加载歌曲中...</p>
        </div>
        <div v-else-if="songs.length" :class="$style.songList">
          <div
            v-for="(song, index) in songs"
            :key="song.id"
            :class="[$style.songItem, { [$style.playing]: playingSongId === song.id }]"
            @dblclick="playSong(song, index)"
          >
            <span :class="$style.index">{{ (currentPage - 1) * limit + index + 1 }}</span>
            <span :class="$style.songName">{{ song.name }}</span>
            <span :class="$style.singer">{{ formatSinger(song.ar) }}</span>
            <span :class="$style.album">{{ song.al?.name || '-' }}</span>
            <span :class="$style.duration">{{ formatDuration(song.dt) }}</span>
          </div>
        </div>
        <p v-else :class="$style.noData">暂无歌曲</p>
        <div v-if="totalPages > 1" :class="$style.pagination">
          <button :class="$style.pageBtn" :disabled="currentPage <= 1" @click="prevPage">
            上一页
          </button>
          <button :class="$style.pageBtn" :disabled="currentPage >= totalPages" @click="nextPage">
            下一页
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'

export default {
  name: 'Artist',
  data() {
    return {
      loading: true,
      loadingSongs: false,
      error: null,
      artistInfo: null,
      songs: [],
      total: 0,
      order: 'hot',
      currentPage: 1,
      limit: 50,
      playingSongId: null,
    }
  },
  computed: {
    artistId() {
      return this.$route.query.id
    },
    totalPages() {
      return Math.ceil(this.total / this.limit) || 1
    },
  },
  mounted() {
    this.loadArtistInfo()
  },
  methods: {
    async loadArtistInfo() {
      if (!this.artistId) {
        this.error = '缺少歌手ID'
        this.loading = false
        return
      }
      this.loading = true
      this.error = null
      try {
        const data = await wyUtil.getArtistInfo(this.artistId)
        this.artistInfo = data
        this.loadSongs()
      } catch (err) {
        console.error('获取歌手详情失败:', err)
        this.error = err.message || '获取歌手详情失败'
      } finally {
        this.loading = false
      }
    },
    async loadSongs() {
      this.loadingSongs = true
      try {
        const offset = (this.currentPage - 1) * this.limit
        const result = await wyUtil.getArtistSongs(this.artistId, this.order, this.limit, offset)
        this.songs = result.songs
        this.total = result.total
      } catch (err) {
        console.error('获取歌手歌曲失败:', err)
      } finally {
        this.loadingSongs = false
      }
    },
    switchOrder(newOrder) {
      if (this.order === newOrder) return
      this.order = newOrder
      this.currentPage = 1
      this.loadSongs()
    },
    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--
        this.loadSongs()
      }
    },
    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++
        this.loadSongs()
      }
    },
    formatSinger(ar) {
      if (!ar) return '-'
      return ar.map(a => a.name).join(', ')
    },
    formatDuration(dt) {
      if (!dt) return '--:--'
      const totalSeconds = Math.floor(dt / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    },
    playSong(song, index) {
      this.playingSongId = song.id
    },
  },
}
</script>

<style lang="less" module>
.container {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
}

.backBtn {
  padding: 8px 16px;
  background: var(--color-button-background);
  color: var(--color-button-font);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 20px;

  &:hover {
    background: var(--color-button-background-hover);
  }

  span {
    font-size: 16px;
  }
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

.pageHeader {
  display: flex;
  gap: 24px;
  margin-bottom: 30px;
}

.cover {
  width: 200px;
  height: 200px;
  border-radius: 8px;
  object-fit: cover;
}

.info {
  flex: 1;
}

.name {
  font-size: 28px;
  margin: 0 0 8px 0;
  color: var(--color-font);
}

.transName {
  font-size: 18px;
  color: var(--color-font-label);
  font-weight: normal;
}

.alias {
  color: var(--color-font-label);
  margin-bottom: 12px;
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
  max-height: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.content {
  margin-top: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tabs {
  display: flex;
  gap: 8px;
}

.tab {
  padding: 8px 20px;
  background: var(--color-button-background);
  color: var(--color-button-font);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: var(--color-button-background-hover);
  }

  &.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
}

.pageInfo {
  color: var(--color-font-label);
  font-size: 14px;
}

.loadingSongs {
  text-align: center;
  padding: 40px;
  color: var(--color-font-label);
}

.songList {
  display: flex;
  flex-direction: column;
}

.songItem {
  display: grid;
  grid-template-columns: 50px 1fr 150px 150px 80px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: var(--color-song-item-background-hover);
  }

  &.playing {
    background: var(--color-primary-light);
  }
}

.index {
  color: var(--color-font-label);
  text-align: center;
}

.songName {
  color: var(--color-font);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.singer,
.album {
  color: var(--color-font-description);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duration {
  color: var(--color-font-label);
  text-align: right;
}

.noData {
  color: var(--color-font-label);
  text-align: center;
  padding: 40px;
}

.pagination {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}

.pageBtn {
  padding: 8px 24px;
  background: var(--color-button-background);
  color: var(--color-button-font);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-button-background-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
