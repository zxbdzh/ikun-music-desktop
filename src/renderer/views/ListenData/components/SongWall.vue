<template>
  <div v-if="data?.items?.length" :class="$style.card">
    <div :class="$style.header">
      <span :class="$style.title">唱片墙</span>
      <span :class="$style.count">{{ data.songCount }}首</span>
    </div>
    <div :class="$style.grid" ref="gridRef">
      <img
        v-for="(item, index) in displayItems"
        :key="index"
        :class="[$style.cover, { [$style.visible]: visibleItems.has(index) }]"
        :src="item.picUrl"
        :alt="item.songName"
        :style="{ transitionDelay: (index % 20) * 30 + 'ms' }"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed } from '@common/utils/vueTools'
import { onMounted, onUnmounted } from 'vue'

export default {
  name: 'SongWall',
  props: {
    data: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const gridRef = ref(null)
    const visibleItems = ref(new Set())
    let observer = null

    const displayItems = computed(() => {
      const items = props.data?.items || []
      return items.slice(0, 20)
    })

    onMounted(() => {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // 触发所有图片的动画
              displayItems.value.forEach((_, index) => {
                setTimeout(() => {
                  visibleItems.value.add(index)
                }, index * 30)
              })
              observer.disconnect()
            }
          })
        },
        { threshold: 0.1 }
      )

      if (gridRef.value) {
        observer.observe(gridRef.value)
      }
    })

    onUnmounted(() => {
      if (observer) {
        observer.disconnect()
      }
    })

    return {
      gridRef,
      displayItems,
      visibleItems,
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

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.title {
  font-size: 14px;
  color: var(--color-secondary-text);
}

.count {
  font-size: 12px;
  color: var(--color-secondary-text);
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.cover {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.4s ease;

  &.visible {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
