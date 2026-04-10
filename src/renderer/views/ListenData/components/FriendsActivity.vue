<template>
  <div v-if="friendItems?.length" :class="$style.card">
    <div :class="$style.title">好友在听</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in friendItems"
        :key="index"
        :class="$style.item"
      >
        <img :class="$style.avatar" :src="item.userAvatar" :alt="item.username" />
        <img :class="$style.songCover" :src="item.songPicUrl" :alt="item.songName" />
        <div :class="$style.info">
          <span :class="$style.username">{{ item.username }}</span>
          <span :class="$style.song" :data-full="item.songName" :title="item.songName">{{ item.songName }}</span>
          <span v-if="item.artistName" :class="$style.artist">{{ item.artistName }}</span>
        </div>
        <span v-if="item.playCount" :class="$style.playCount">{{ item.playCount }}次</span>
        <span :class="$style.playBtn" @click.stop="handlePlay(item)">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M8 5v14l11-7z" fill="currentColor"/>
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { setTempList } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player'
import { LIST_IDS } from '@common/constants'
import { toNewMusicInfo } from '@common/utils/tools'

export default {
  name: 'FriendsActivity',
  props: {
    data: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    // 兼容旧API(friendsListenWeekBlock.items)和新API(weekFriendsListenBlock.friendListenRecords)
    const friendItems = computed(() => {
      if (!props.data) return []
      if (props.data.items?.length) return props.data.items
      if (props.data.friendListenRecords?.length) return props.data.friendListenRecords
      return []
    })

    const handlePlay = async(item) => {
      if (!item.songId) return
      const musicInfo = {
        songmid: String(item.songId),
        name: item.songName,
        singer: item.artistName || '',
        source: 'wy',
        interval: '',
        albumName: item.albumName || '',
        albumId: item.albumId ? String(item.albumId) : '',
        img: item.songPicUrl || '',
        types: [],
        _types: {},
        singerId: item.artistId ? String(item.artistId) : '',
        ar: item.artistId ? [{ id: String(item.artistId), name: item.artistName || '' }] : [],
      }
      const formattedSongs = [toNewMusicInfo(musicInfo)]
      await setTempList('wy_friend_' + item.songId, formattedSongs)
      void playList(LIST_IDS.TEMP, 0)
    }

    return {
      friendItems,
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
  gap: 10px;
  padding: 6px;
  border-radius: 8px;

  &:hover {
    background: var(--color-secondary-background);
  }
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.songCover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.username {
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song {
  font-size: 12px;
  color: var(--color-secondary-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.artist {
  font-size: 11px;
  color: var(--color-secondary-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playCount {
  font-size: 12px;
  color: var(--color-secondary-text);
  flex-shrink: 0;
}

.playBtn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--white);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;

  .item:hover & {
    opacity: 1;
  }
}
</style>
