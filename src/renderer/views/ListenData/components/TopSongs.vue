<template>
  <div v-if="data?.sections?.length" :class="$style.card">
    <div :class="$style.title">单曲排行</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in data.sections"
        :key="index"
        :class="$style.item"
        @click="handlePlay(item, index)"
      >
        <img :class="$style.cover" :src="item.picUrl" :alt="item.songName" />
        <div :class="$style.info">
          <span :class="$style.name" :data-full="item.songName" :title="item.songName">{{ item.songName }}</span>
          <span :class="$style.count">{{ item.text }}</span>
        </div>
        <svg :class="$style.playIcon" viewBox="0 0 24 24" width="16" height="16">
          <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
      </div>
    </div>
  </div>
</template>

<script>
import { setTempList } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player'
import { LIST_IDS } from '@common/constants'
import { toNewMusicInfo } from '@common/utils/tools'

export default {
  name: 'TopSongs',
  props: {
    data: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const handlePlay = async(item) => {
      if (!item.songId) return
      // 兼容有 artists 字段(旧API)和没有 artists 字段(新API)的情况
      let singerName = ''
      let singerId = ''
      let ar = []

      if (item.artists?.length) {
        singerName = item.artists.map((a) => a.artistName).join('、')
        singerId = item.artists[0]?.artistId ? String(item.artists[0].artistId) : ''
        ar = item.artists.map((a) => ({ id: String(a.artistId), name: a.artistName }))
      }

      const musicInfo = {
        songmid: String(item.songId),
        name: item.songName,
        singer: singerName,
        source: 'wy',
        interval: '',
        albumName: '',
        albumId: '',
        img: item.picUrl || '',
        types: [],
        _types: {},
        singerId,
        ar,
      }
      const formattedSongs = [toNewMusicInfo(musicInfo)]
      await setTempList('wy_topsong_' + item.songId, formattedSongs)
      void playList(LIST_IDS.TEMP, 0)
    }

    return {
      handlePlay,
    }
  },
}
</script>

<style lang="less" module>
.card {
  background: var(--color-main-background);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.title {
  font-size: 14px;
  color: var(--color-secondary-text);
  margin-bottom: 12px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--color-secondary-background);
  }
}

.cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.name {
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  position: relative;
  cursor: pointer;

  &:hover::after {
    content: attr(data-full);
    position: absolute;
    left: 0;
    top: 100%;
    background: var(--color-text);
    color: var(--color-main-background);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 100;
    margin-top: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
}

.count {
  font-size: 12px;
  color: var(--color-secondary-text);
}

.playIcon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--white);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;

  .item:hover & {
    opacity: 1;
  }
}
</style>
