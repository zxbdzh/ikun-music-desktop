<template>
  <div :class="$style.main">
    <div :class="$style.header">
      <div :class="$style.headerLeft" @click="goBack">
        <span>&lt;</span>
      </div>
      <div :class="$style.headerTitle">{{ $t('listen_data_title') }}</div>
      <div :class="$style.headerRight"></div>
    </div>

    <div :class="$style.periodNav">
      <div :class="$style.tabs">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          :class="[$style.tab, { [$style.active]: activeTab === tab.id }]"
          @click="switchTab(tab.id)"
        >
          {{ tab.name }}
        </div>
      </div>
      <div :class="$style.arrows">
        <span :class="$style.arrow" @click="prevPeriod">&lt;</span>
        <span :class="$style.periodLabel">{{ periodLabel }}</span>
        <span :class="[$style.arrow, { [$style.disabled]: isCurrentPeriod }]" @click="nextPeriod">&gt;</span>
      </div>
    </div>

    <div class="scroll" :class="$style.content">
      <div v-if="isLoading" :class="$style.loading">{{ $t('loading') }}</div>
      <template v-else-if="reportData">
        <ListenProgress :key="activeTab + '-' + periodOffset" :data="reportData" :type="activeTab" :periodOffset="periodOffset" />
        <template v-if="activeTab !== 'year'">
          <ListenTimeChart :data="reportData.listenTimeDistributionBlock" />
          <TopArtists :data="reportData.topArtistBlock" />
          <TopSongs :data="reportData.topSongBlock" />
          <SongWall :data="reportData.wallpaperBlock" />
          <StyleDistribution :data="reportData.topStyleBlock" />
          <AgeDistribution :data="reportData.topAgeBlock" />
          <LanguageDistribution :data="reportData.topLanguageBlock" />
          <FriendsActivity :data="reportData.friendsListenWeekBlock" />
        </template>
      </template>
      <div v-else :class="$style.empty">{{ $t('listen_data_no_data') }}</div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { appSetting } from '@renderer/store/setting'
import wyUtil from '@renderer/utils/musicSdk/wy/wyUtil'
import ListenProgress from './components/ListenProgress.vue'
import ListenTimeChart from './components/ListenTimeChart.vue'
import TopArtists from './components/TopArtists.vue'
import TopSongs from './components/TopSongs.vue'
import SongWall from './components/SongWall.vue'
import StyleDistribution from './components/StyleDistribution.vue'
import AgeDistribution from './components/AgeDistribution.vue'
import LanguageDistribution from './components/LanguageDistribution.vue'
import FriendsActivity from './components/FriendsActivity.vue'

const tabs = [
  { id: 'week', name: '周' },
  { id: 'month', name: '月' },
  { id: 'year', name: '年' },
]

// 计算指定类型的结束时间戳
const getEndTime = (type, offset = 0) => {
  const now = new Date()
  let targetDate = new Date(now)

  if (type === 'week') {
    // 本周六 0点 (周期是 周日0点 -> 周六24点)
    const dayOfWeek = now.getDay() // 0=周日, 1=周一, ..., 6=周六
    const daysToSaturday = (6 - dayOfWeek + 7) % 7 // 到本周六的天数
    targetDate.setDate(now.getDate() + daysToSaturday + (offset * 7))
    targetDate.setHours(0, 0, 0, 0)
  } else if (type === 'month') {
    // 本月最后一天 0点，然后偏移月份
    const targetMonth = now.getMonth() + offset
    const lastDay = new Date(now.getFullYear(), targetMonth + 1, 0)
    lastDay.setHours(0, 0, 0, 0)
    targetDate = lastDay
  } else if (type === 'year') {
    // 今年12月31日 0点，然后偏移年份
    const targetYear = now.getFullYear() + offset
    targetDate = new Date(targetYear, 11, 31, 0, 0, 0, 0)
  }

  return targetDate.getTime()
}

// 判断是否是当前周期
const isCurrentPeriod = (type, endTime) => {
  const currentEndTime = getEndTime(type, 0)
  return endTime >= currentEndTime
}

// 获取周期显示标签
const getPeriodLabel = (type, offset) => {
  const now = new Date()
  if (type === 'week') {
    const endDate = new Date(getEndTime(type, offset))
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - 6)
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${fmt(startDate)}-${fmt(endDate)}`
  } else if (type === 'month') {
    const endDate = new Date(getEndTime(type, offset))
    return `${endDate.getFullYear()}/${endDate.getMonth() + 1}`
  } else if (type === 'year') {
    // 年报显示：当前选中的年份
    return `${now.getFullYear() + offset}年`
  }
  return ''
}

export default {
  name: 'ListenData',
  components: {
    ListenProgress,
    ListenTimeChart,
    TopArtists,
    TopSongs,
    SongWall,
    StyleDistribution,
    AgeDistribution,
    LanguageDistribution,
    FriendsActivity,
  },
  setup() {
    const router = useRouter()
    const activeTab = ref('week')
    const periodOffset = ref(-1) // 默认显示上一个完成周期
    const isLoading = ref(false)
    const reportData = ref(null)

    const currentEndTime = computed(() => getEndTime(activeTab.value, periodOffset.value))
    const periodLabel = computed(() => {
      if (activeTab.value === 'year' && reportData.value?.yearItems) {
        // 年报：从已获取的 yearItems 中取对应偏移的年份
        const index = Math.abs(periodOffset.value) - 1
        return `${reportData.value.yearItems[index]?.year || ''}年`
      }
      return getPeriodLabel(activeTab.value, periodOffset.value)
    })
    const isCurrentPeriodFlag = computed(() => periodOffset.value >= 0)

    const loadData = async() => {
      console.log('[ListenData] loadData 被调用, activeTab:', activeTab.value)
      const cookie = appSetting['common.wy_cookie']
      if (!cookie) {
        console.log('[ListenData] 无 cookie')
        reportData.value = null
        return
      }
      isLoading.value = true
      try {
        console.log('[ListenData] 请求参数:', { type: activeTab.value, endTime: currentEndTime.value })
        let data
        if (activeTab.value === 'year') {
          console.log('[ListenData] 调用年报 API')
          data = await wyUtil.getListenDataYearReport(cookie)
        } else {
          data = await wyUtil.getListenDataReport(activeTab.value, cookie, currentEndTime.value)
        }
        console.log('[ListenData] 返回数据:', JSON.stringify(data, null, 2))
        reportData.value = data
        console.log('[ListenData] reportData 已设置:', !!reportData.value, reportData.value?.yearItems?.length)
      } catch (e) {
        console.error('获取听歌报告失败:', e)
        reportData.value = null
      } finally {
        isLoading.value = false
      }
    }

    const switchTab = (tabId) => {
      console.log('[switchTab] 切换到:', tabId)
      activeTab.value = tabId
      periodOffset.value = -1 // 切换 Tab 时默认显示上一个完成周期
      void loadData()
    }

    const prevPeriod = () => {
      periodOffset.value -= 1
      if (activeTab.value !== 'year') {
        void loadData()
      }
    }

    const nextPeriod = () => {
      if (periodOffset.value >= -1) return // 最远到当前周期
      periodOffset.value += 1
      if (activeTab.value !== 'year') {
        void loadData()
      }
    }

    const goBack = () => {
      router.back()
    }

    void loadData()

    return {
      tabs,
      activeTab,
      periodOffset,
      isLoading,
      reportData,
      periodLabel,
      isCurrentPeriod: isCurrentPeriodFlag,
      switchTab,
      prevPeriod,
      nextPeriod,
      goBack,
    }
  },
}
</script>

<style lang="less" module>
.main {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-main-background);
}

.header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  flex-shrink: 0;
}

.headerLeft {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-primary);
}

.headerTitle {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.headerRight {
  width: 32px;
}

.periodNav {
  padding: 0 16px 12px;
}

.tabs {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.tab {
  flex: 1;
  padding: 8px 0;
  text-align: center;
  border-radius: 20px;
  background: var(--color-secondary-background);
  color: var(--color-secondary-text);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;

  &.active {
    background: var(--color-primary);
    color: var(--white);
  }
}

.arrows {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.arrow {
  width: 20px;
  height: 20px;
  color: var(--color-primary);
  cursor: pointer;

  &.disabled {
    color: var(--color-secondary-text);
    cursor: not-allowed;
  }
}

.periodLabel {
  font-size: 13px;
  color: var(--color-text);
  min-width: 80px;
  text-align: center;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 20px;
}

.loading {
  text-align: center;
  padding: 40px 0;
  color: var(--color-secondary-text);
}

.empty {
  text-align: center;
  padding: 40px 0;
  color: var(--color-secondary-text);
}
</style>
