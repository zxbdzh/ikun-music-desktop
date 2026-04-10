<template>
  <div v-if="data" :class="$style.card">
    <div :class="$style.title">{{ monthLabel }}曲风</div>
    <div v-if="topItem" :class="$style.topItem">
      <svg-icon name="star" :class="$style.topIcon" />
      <span :class="$style.topLabel">TOP</span>
      <div :class="$style.topInfo">
        <span :class="$style.topGenre" :title="topItem.genreName">{{ topItem.genreName }}</span>
        <span :class="$style.topPercent">{{ topItem.percent }}%</span>
      </div>
    </div>
    <div :class="$style.bars">
      <div
        v-for="(item, index) in data.sections"
        :key="index"
        :class="$style.barItem"
      >
        <span :class="$style.barLabel" :title="item.genreName">{{ item.genreName }}</span>
        <div :class="$style.barTrack">
          <div
            :class="$style.barFill"
            :style="{ width: item.percent + '%' }"
          />
        </div>
        <span :class="$style.barPercent">{{ item.percent }}%</span>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'

export default {
  name: 'StyleDistribution',
  props: {
    data: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const monthLabel = computed(() => {
      return props.data?.genreName || '曲风'
    })

    const topItem = computed(() => {
      const sections = props.data?.sections
      if (!sections?.length) return null
      return sections.reduce((max, item) =>
        parseInt(item.percent) > parseInt(max.percent) ? item : max
      , sections[0])
    })

    return {
      monthLabel,
      topItem,
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

.topItem {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px;
  background: var(--color-secondary-background);
  border-radius: 8px;
}

.topIcon {
  color: var(--color-primary);
  width: 16px;
  height: 16px;
}

.topLabel {
  font-size: 10px;
  color: var(--color-primary);
  font-weight: bold;
}

.topInfo {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.topGenre {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.topPercent {
  font-size: 18px;
  font-weight: bold;
  color: var(--color-primary);
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.barItem {
  display: flex;
  align-items: center;
  gap: 8px;
}

.barLabel {
  width: 60px;
  font-size: 12px;
  color: var(--color-secondary-text);
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.barTrack {
  flex: 1;
  height: 8px;
  background: var(--color-secondary-background);
  border-radius: 4px;
  overflow: hidden;
}

.barFill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s;
}

.barPercent {
  width: 36px;
  font-size: 12px;
  color: var(--color-secondary-text);
  text-align: right;
  flex-shrink: 0;
}
</style>
