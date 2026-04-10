<template>
  <div v-if="data" :class="$style.card">
    <div v-if="achievementTitle" :class="$style.badge">
      <span :class="$style.badgeText">{{ achievementTitle }}</span>
    </div>
    <div :class="$style.stats">
      <div :class="$style.statRow">
        <span :class="$style.statValue">{{ totalDuration }}</span>
      </div>
      <div :class="$style.statRow">
        <span :class="$style.statLabel">{{ typeLabel }}共听</span>
      </div>
      <div :class="$style.statRow">
        <span :class="$style.statDays">{{ listenDays }}{{ isSongCount ? '首' : '天' }}</span>
      </div>
    </div>
    <div v-if="data.listenTimeBlock" :class="$style.desc">
      {{ data.listenTimeBlock.playDurationText }}
    </div>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'

export default {
  name: 'ListenProgress',
  props: {
    data: {
      type: Object,
      default: null,
    },
    type: {
      type: String,
      default: 'week',
    },
    periodOffset: {
      type: Number,
      default: -1,
    },
  },
  setup(props) {
    const isYearReport = computed(() => props.type === 'year' && props.data?.yearItems)

    const yearIndex = computed(() => Math.abs(props.periodOffset) - 1)

    const achievementTitle = computed(() => {
      if (isYearReport.value) return ''
      if (!props.data?.listenTimeDistributionBlock?.achievementTitle) return ''
      return props.data.listenTimeDistributionBlock.achievementTitle.mainTitle || ''
    })

    const totalDuration = computed(() => {
      if (isYearReport.value) {
        const duration = props.data.yearItems?.[yearIndex.value]?.playDuration || 0
        const hours = Math.floor(duration / 3600)
        return hours > 0 ? `${hours}小时` : '0小时'
      }
      if (!props.data?.listenTimeBlock) return ''
      const duration = props.data.listenTimeBlock.playDuration || 0
      const hours = Math.floor(duration / 60)
      const minutes = duration % 60
      return hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分钟`
    })

    const listenDays = computed(() => {
      if (isYearReport.value) {
        return props.data.yearItems?.[yearIndex.value]?.playNum || 0
      }
      return props.data?.listenTimeDistributionBlock?.listenDays || 0
    })

    const isSongCount = computed(() => isYearReport.value)

    const typeLabel = computed(() => {
      const map = { week: '本周', month: '本月', year: '年度' }
      return map[props.type] || ''
    })

    return {
      achievementTitle,
      totalDuration,
      listenDays,
      isSongCount,
      typeLabel,
    }
  },
}
</script>

<style lang="less" module>
.card {
  background: var(--color-primary);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 16px;
  color: var(--white);
}

.badge {
  text-align: center;
  margin-bottom: 16px;
}

.badgeText {
  display: inline-block;
  padding: 4px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  font-size: 12px;
}

.stats {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 12px;
}

.statRow {
  line-height: 1.4;
}

.statValue {
  font-size: 36px;
  font-weight: bold;
}

.statLabel {
  font-size: 12px;
  opacity: 0.8;
}

.statDays {
  font-size: 14px;
  opacity: 0.8;
}

.desc {
  text-align: center;
  font-size: 13px;
  opacity: 0.9;
}
</style>
