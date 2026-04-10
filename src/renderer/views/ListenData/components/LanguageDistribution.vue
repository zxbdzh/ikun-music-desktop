<template>
  <div v-if="data?.sections?.length" :class="$style.card">
    <div :class="$style.title">语言分布</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in data.sections"
        :key="index"
        :class="$style.item"
      >
        <div :class="$style.info">
          <span :class="$style.lang">{{ item.language }}</span>
          <span :class="$style.songName" :title="item.songName">{{ item.songName }}</span>
        </div>
        <div :class="$style.barWrapper">
          <div
            :class="$style.bar"
            :style="{ width: item.percent + '%' }"
          />
        </div>
        <span :class="$style.percent">{{ item.percent }}%</span>
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
export default {
  name: 'LanguageDistribution',
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
  gap: 12px;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.info {
  width: 50px;
  flex-shrink: 0;
}

.lang {
  display: block;
  font-size: 13px;
  color: var(--color-text);
  font-weight: 500;
}

.songName {
  display: block;
  font-size: 11px;
  color: var(--color-secondary-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.barWrapper {
  flex: 1;
  height: 8px;
  background: var(--color-secondary-background);
  border-radius: 4px;
  overflow: hidden;
}

.bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s;
}

.percent {
  width: 36px;
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
