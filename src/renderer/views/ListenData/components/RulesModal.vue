<template>
  <div v-if="visible" :class="$style.mask" @click.self="close">
    <div :class="$style.modal">
      <div :class="$style.header">
        <span :class="$style.title">规则说明</span>
        <svg-icon :class="$style.close" name="close" @click="close" />
      </div>
      <div :class="$style.content">
        <p>听歌足迹数据基于您的网易云音乐播放记录统计。</p>
        <p>统计周期：</p>
        <ul>
          <li>周报：每周一0点至周日24点</li>
          <li>月报：每月1日0点至月末最后一天24点</li>
          <li>年报：每年1月1日0点至12月31日24点</li>
        </ul>
        <p>数据更新可能会有延迟，请以实际播放记录为准。</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RulesModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const visible = computed(() => props.modelValue)

    const close = () => {
      emit('update:modelValue', false)
    }

    return {
      visible,
      close,
    }
  },
}
</script>

<script setup>
import { computed } from '@common/utils/vueTools'
</script>

<style lang="less" module>
.mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 80%;
  max-width: 360px;
  background: var(--color-main-background);
  border-radius: 12px;
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-secondary-background);
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.close {
  width: 20px;
  height: 20px;
  color: var(--color-secondary-text);
  cursor: pointer;
}

.content {
  padding: 16px;
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;

  p {
    margin-bottom: 8px;
  }

  ul {
    padding-left: 20px;
    margin-bottom: 8px;

    li {
      margin-bottom: 4px;
    }
  }
}
</style>
