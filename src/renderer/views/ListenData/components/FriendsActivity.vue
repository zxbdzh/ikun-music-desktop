<template>
  <div v-if="data?.items?.length" :class="$style.card">
    <div :class="$style.title">好友在听</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in data.items"
        :key="index"
        :class="$style.item"
      >
        <img :class="$style.avatar" :src="item.userAvatar" :alt="item.username" />
        <div :class="$style.info">
          <span :class="$style.username">{{ item.username }}</span>
          <span :class="$style.song" :data-full="item.songName" :title="item.songName">{{ item.songName }}</span>
        </div>
        <span :class="$style.playCount">{{ item.playCount }}次</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FriendsActivity',
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

.playCount {
  font-size: 12px;
  color: var(--color-secondary-text);
  flex-shrink: 0;
}
</style>
