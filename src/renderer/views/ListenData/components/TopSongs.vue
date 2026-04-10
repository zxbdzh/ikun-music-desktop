<template>
  <div v-if="data?.sections?.length" :class="$style.card">
    <div :class="$style.title">单曲排行</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in data.sections"
        :key="index"
        :class="$style.item"
      >
        <img :class="$style.cover" :src="item.picUrl" :alt="item.songName" />
        <div :class="$style.info">
          <span :class="$style.name" :data-full="item.songName" :title="item.songName">{{ item.songName }}</span>
          <span :class="$style.count">{{ item.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TopSongs',
  props: {
    data: {
      type: Object,
      default: null,
    },
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
</style>
