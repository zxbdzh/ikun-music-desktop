<template>
  <div v-if="data" :class="$style.card">
    <div :class="$style.title">{{ dataTitle }}</div>
    <div :class="$style.chart">
      <div
        v-for="(item, index) in chartData"
        :key="index"
        :class="$style.barItem"
      >
        <div :class="$style.barWrapper">
          <div
            :class="[$style.bar, { [$style.top]: item.isTop, [$style.active]: item.duration > 0, [$style.empty]: item.duration === 0 }]"
            :style="{ height: item.height + '%' }"
          >
            <span v-if="item.duration > 0" :class="$style.barLabel">{{ item.time }}</span>
          </div>
        </div>
        <span :class="$style.dayLabel">{{ item.day }}</span>
      </div>
    </div>
    <div v-if="data.listenDays" :class="$style.footer">
      <span>已听 {{ data.listenDays }}/7 天</span>
    </div>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'

export default {
  name: 'ListenTimeChart',
  props: {
    data: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const dataTitle = computed(() => '每日听歌时长')

    const chartData = computed(() => {
      const details = props.data?.durationDetails || []
      if (!details.length) return []

      const maxDuration = Math.max(...details.map(d => d.duration), 1)
      const dayLabels = ['日', '一', '二', '三', '四', '五', '六']

      return details.map((item, index) => {
        const date = new Date(item.period)
        const day = dayLabels[date.getDay()]
        const duration = item.duration || 0
        const height = (duration / maxDuration) * 100
        const hours = Math.floor(duration / 60)
        const mins = duration % 60
        const time = hours > 0 ? `${hours}小时${mins}分` : (mins > 0 ? `${mins}分` : '')

        return {
          day,
          duration,
          height,
          time,
          isTop: index === details.length - 1,
        }
      })
    })

    return {
      dataTitle,
      chartData,
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
  margin-bottom: 16px;
}

.chart {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 120px;
  gap: 8px;
}

.barItem {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.barWrapper {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bar {
  width: 100%;
  max-width: 32px;
  background: var(--color-secondary-background);
  border-radius: 4px 4px 0 0;
  min-height: 4px;
  transition: height 0.3s;
  position: relative;

  &.top,
  &.active {
    background: var(--color-primary);
  }

  &.empty {
    background: transparent;
  }
}

.barLabel {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--color-primary);
  white-space: nowrap;
}

.dayLabel {
  font-size: 10px;
  color: var(--color-secondary-text);
  margin-top: 6px;
}

.footer {
  text-align: center;
  font-size: 12px;
  color: var(--color-secondary-text);
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-secondary-background);
}
</style>
