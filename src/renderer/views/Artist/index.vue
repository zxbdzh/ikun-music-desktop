<template>
  <div :class="$style.container">
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
        <h2>热门歌曲</h2>
        <div v-if="hotSongs.length" :class="$style.songList">
          <div
            v-for="(song, index) in hotSongs"
            :key="song.id"
            :class="[$style.songItem, { [$style.playing]: playingSongId === song.id }]"
            @dblclick="playSong(song, index)"
          >
            <span :class="$style.index">{{ index + 1 }}</span>
            <span :class="$style.songName">{{ song.name }}</span>
            <span :class="$style.singer">{{ formatSinger(song.ar) }}</span>
            <span :class="$style.album">{{ song.al?.name || '-' }}</span>
            <span :class="$style.duration">{{ formatDuration(song.dt) }}</span>
          </div>
        </div>
        <p v-else :class="$style.noData">暂无热门歌曲</p>
      </div>
    </template>
  </div>
</template>

<script>
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import { useRouter } from '@common/utils/vueRouter'

export default {
  name: 'Artist',
  data() {
    return {
      loading: true,
      error: null,
      artistInfo: null,
      hotSongs: [],
      playingSongId: null,
    }
  },
  computed: {
    artistId() {
      return this.$route.query.id
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
        // 热门歌曲在 data.hotSongs 中
        this.hotSongs = data.hotSongs || []
      } catch (err) {
        console.error('获取歌手详情失败:', err)
        this.error = err.message || '获取歌手详情失败'
      } finally {
        this.loading = false
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
      // TODO: 实现播放功能
      this.playingSongId = song.id
      console.log('播放歌曲:', song.name, song.id)
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
  h2 {
    font-size: 20px;
    margin-bottom: 16px;
    color: var(--color-font);
  }
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
</style>
