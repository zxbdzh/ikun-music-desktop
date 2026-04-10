<template>
  <div v-if="data?.sections?.length" :class="$style.card">
    <div :class="$style.title">听歌年代</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in data.sections"
        :key="index"
        :class="$style.item"
      >
        <span :class="$style.age">{{ item.age }}</span>
        <div :class="$style.progress">
          <div
            :class="$style.progressFill"
            :style="{ width: getPercent(item.playSongNum) + '%' }"
          />
        </div>
        <span :class="$style.count">{{ item.playSongNum }}首</span>
      </div>
    </div>
    <div v-if="data.songItems?.length" :class="$style.songList">
      <img
        v-for="(song, index) in data.songItems"
        :key="index"
        :class="$style.songCover"
        :src="song.picUrl"
        :alt="song.songName"
        :title="song.songName"
      />
    </div>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'

export default {
  name: 'AgeDistribution',
  props: {
    data: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const maxCount = computed(() => {
      const sections = props.data?.sections || []
      return Math.max(...sections.map(s => s.playSongNum), 1)
    })

    const getPercent = (count) => {
      return Math.round((count / maxCount.value) * 100)
    }

    return {
      maxCount,
      getPercent,
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
}

.age {
  width: 50px;
  font-size: 13px;
  color: var(--color-text);
  flex-shrink: 0;
}

.progress {
  flex: 1;
  height: 6px;
  background: var(--color-secondary-background);
  border-radius: 3px;
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
  transition: width 0.3s;
}

.count {
  width: 45px;
  font-size: 12px;
  color: var(--color-secondary-text);
  text-align: right;
  flex-shrink: 0;
}

.songList {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.songCover {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}
</style>
