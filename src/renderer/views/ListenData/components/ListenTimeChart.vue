<template>
  <div v-if="data" :class="$style.card">
    <div :class="$style.title">{{ dataTitle }}</div>
    <!-- 柱状图模式 (周视图) -->
    <div v-if="!isMonthView" :class="$style.chart">
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
    <!-- 热力图模式 (月视图) -->
    <div v-else :class="$style.heatmap">
      <div :class="$style.heatmapGrid">
        <div
          v-for="(item, index) in heatmapData"
          :key="index"
          :class="[$style.heatmapCell, { [$style.empty]: item.duration === 0 }]"
          :style="{ backgroundColor: getHeatColor(item.duration) }"
          :title="`${item.dateStr}: ${item.time || '无'}`"
        >
          <span v-if="item.duration > 0" :class="$style.heatmapLabel">{{ item.dayStr }}</span>
        </div>
      </div>
      <div :class="$style.heatmapLegend">
        <span :class="$style.legendLabel">少</span>
        <div :class="$style.legendGradient"></div>
        <span :class="$style.legendLabel">多</span>
      </div>
    </div>
    <div v-if="data.listenDays" :class="$style.footer">
      <span>已听 {{ data.listenDays }}/{{ isMonthView ? '30' : '7' }} 天</span>
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

    const isMonthView = computed(() => {
      const details = props.data?.durationDetails || []
      return details.length > 14
    })

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

    const heatmapData = computed(() => {
      const details = props.data?.durationDetails || []
      if (!details.length) return []

      const dayLabels = ['日', '一', '二', '三', '四', '五', '六']

      return details
        .filter(item => item.duration > 0)
        .map((item) => {
          const date = new Date(item.period)
          const duration = item.duration || 0
          const hours = Math.floor(duration / 60)
          const mins = duration % 60
          const time = hours > 0 ? `${hours}小时${mins}分` : (mins > 0 ? `${mins}分` : '')

          return {
            day: date.getDate(),
            dayStr: dayLabels[date.getDay()],
            dateStr: `${date.getMonth() + 1}月${date.getDate()}日`,
            month: date.getMonth(),
            duration,
            time,
          }
        })
    })

    const maxDuration = computed(() => {
      const details = props.data?.durationDetails || []
      return Math.max(...details.map(d => d.duration), 1)
    })

    const getHeatColor = (duration) => {
      if (duration === 0) return 'transparent'
      const ratio = duration / maxDuration.value
      // 颜色从浅到深，使用主题色
      const baseColor = { r: 255, g: 255, b: 255 }
      const targetColor = { r: 30, g: 136, b: 229 }
      const r = Math.round(baseColor.r + (targetColor.r - baseColor.r) * ratio)
      const g = Math.round(baseColor.g + (targetColor.g - baseColor.g) * ratio)
      const b = Math.round(baseColor.b + (targetColor.b - baseColor.b) * ratio)
      return `rgb(${r}, ${g}, ${b})`
    }

    return {
      dataTitle,
      chartData,
      heatmapData,
      isMonthView,
      getHeatColor,
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

.heatmap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.heatmapGrid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.heatmapCell {
  aspect-ratio: 1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  cursor: default;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }

  &.empty {
    background: var(--color-secondary-background);
  }
}

.heatmapLabel {
  font-size: 10px;
  color: var(--white);
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.heatmapLegend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.legendLabel {
  font-size: 11px;
  color: var(--color-secondary-text);
}

.legendGradient {
  width: 100px;
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(to right, rgba(30, 136, 229, 0.2), rgba(30, 136, 229, 1));
}
</style>
