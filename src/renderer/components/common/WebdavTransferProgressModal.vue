<template>
  <material-modal :show="show" :bg-close="false" :teleport="teleport">
    <main :class="$style.main">
      <h2 :class="$style.title">{{ $t('lists__webdav_transfer_progress_title') }}</h2>
      <div :class="$style.track">
        <div :class="$style.fill" :style="{ width: percent + '%' }" />
      </div>
      <p :class="$style.count">{{ done }} / {{ total }} ({{ percent }}%)</p>
      <p :class="$style.current">{{ current || '...' }}</p>
    </main>
  </material-modal>
</template>

<script>
export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    done: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    current: {
      type: String,
      default: '',
    },
    teleport: {
      type: String,
      default: '#root',
    },
  },
  computed: {
    percent() {
      if (!this.total) return 0
      return Math.min(100, Math.floor((this.done / this.total) * 100))
    },
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 18px;
  width: 320px;
  max-width: 100%;
  display: flex;
  flex-flow: column nowrap;
}
.title {
  font-size: 14px;
  color: var(--color-font);
  margin-bottom: 14px;
}
.track {
  height: 8px;
  border-radius: 4px;
  background: var(--color-secondary-background);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 4px;
  background: var(--color-primary);
  transition: width 0.2s ease;
}
.count {
  font-size: 12px;
  color: var(--color-font-label);
  margin-top: 10px;
}
.current {
  font-size: 13px;
  color: var(--color-font);
  margin-top: 4px;
  .mixin-ellipsis-1();
}
</style>
