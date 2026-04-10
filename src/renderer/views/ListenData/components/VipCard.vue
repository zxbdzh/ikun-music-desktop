<template>
  <div v-if="data?.sections?.length" :class="$style.card">
    <div :class="$style.title">会员专享</div>
    <div :class="$style.list">
      <div
        v-for="(item, index) in data.sections"
        :key="index"
        :class="$style.item"
      >
        <span :class="$style.field">{{ item.field }}</span>
        <div :class="$style.stats">
          <span :class="$style.mainText">{{ item.mainText }}</span>
          <span :class="$style.subText">{{ item.subText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'VipCard',
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
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: var(--color-secondary-background);
  border-radius: 8px;
}

.field {
  font-size: 13px;
  color: var(--color-secondary-text);
}

.stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.mainText {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
}

.subText {
  font-size: 11px;
  color: var(--color-secondary-text);
}
</style>
