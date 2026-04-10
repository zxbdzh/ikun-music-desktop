<template>
  <div v-if="data?.sections?.length" :class="$style.card">
    <div :class="$style.title">歌手排行</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in data.sections"
        :key="index"
        :class="$style.item"
        @click="goArtist(item.artistId)"
      >
        <img :class="$style.avatar" :src="item.picUrl" :alt="item.artistName" />
        <div :class="$style.info">
          <span :class="$style.name" :title="item.artistName">{{ item.artistName }}</span>
          <div :class="$style.progress">
            <div
              :class="$style.progressFill"
              :style="{ width: getPercent(item.text) + '%' }"
            />
          </div>
        </div>
        <span :class="$style.count">{{ item.text }}</span>
        <svg-icon :class="$style.arrow" name="right" />
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'

export default {
  name: 'TopArtists',
  props: {
    data: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const router = useRouter()

    const maxCount = computed(() => {
      const sections = props.data?.sections || []
      if (!sections.length) return 1
      // 从 "194次" 这样的字符串中提取数字
      return Math.max(...sections.map(s => {
        const num = parseInt(s.text) || 0
        return num
      }), 1)
    })

    const getPercent = (text) => {
      const num = parseInt(text) || 0
      return Math.round((num / maxCount.value) * 100)
    }

    const goArtist = (artistId) => {
      if (!artistId) return
      router.push({ path: '/artist', query: { id: artistId, from: 'listen-data' } })
    }

    return {
      maxCount,
      getPercent,
      goArtist,
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
  gap: 12px;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--color-secondary-background);
  }
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.name {
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress {
  height: 4px;
  background: var(--color-secondary-background);
  border-radius: 2px;
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: width 0.3s;
}

.count {
  font-size: 12px;
  color: var(--color-secondary-text);
  flex-shrink: 0;
}

.arrow {
  color: var(--color-secondary-text);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
