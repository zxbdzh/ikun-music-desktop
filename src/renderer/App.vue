<template>
  <div id="container" class="view-container" :class="{ 'bg-cover-enabled': bgCover && enableBgCover }">
    <!-- 封面背景层 -->
    <div
      v-if="bgCover && enableBgCover"
      class="bg-cover"
      :style="{
        backgroundImage: `url(${bgCover})`,
        filter: `blur(${bgCoverBlur}px) brightness(${isDark ? 0.6 : 0.4})`,
        opacity: bgCoverOpacity / 100,
      }"
    />
    <!-- 遮罩层 -->
    <div
      v-if="bgCover && enableBgCover"
      class="bg-cover-overlay"
      :class="{ 'is-dark': isDark }"
    />
    <layout-aside id="left" />
    <div id="right">
      <layout-toolbar id="toolbar" />
      <layout-view id="view" />
      <layout-play-bar id="player" />
    </div>
    <layout-icons />
    <layout-change-log-modal />
    <layout-update-modal />
    <layout-pact-modal />
    <layout-sync-mode-modal />
    <layout-sync-auth-code-modal />
    <layout-play-detail />
    <SongMemory />
    <layout-share-music-card-modal />
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { onMounted } from '@common/utils/vueTools'
// import BubbleCursor from '@common/utils/effects/cursor-effects/bubbleCursor'
// import '@common/utils/effects/snow.min'
import useApp from '@renderer/core/useApp'
import useBgCover from '@renderer/core/useApp/useBgCover'
import { themeShouldUseDarkColors } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import SongMemory from '@renderer/components/layout/SongMemory/index.vue'

useApp()

const { bgCover } = useBgCover()
const enableBgCover = computed(() => appSetting['theme.enableBgCover'])
const bgCoverBlur = computed(() => appSetting['theme.bgCoverBlur'])
const bgCoverOpacity = computed(() => appSetting['theme.bgCoverOpacity'])
const isDark = computed(() => themeShouldUseDarkColors.value)
const isBgCoverActive = computed(() => bgCover.value && enableBgCover.value)

// 监听封面背景开关，控制 html 类的添加/移除
watch(isBgCoverActive, (active) => {
  if (active) {
    document.documentElement.classList.add('bg-cover-mode')
  } else {
    document.documentElement.classList.remove('bg-cover-mode')
  }
}, { immediate: true })

onMounted(() => {
  document.getElementById('root').style.display = 'block'

  // const styles = getComputedStyle(document.documentElement)
  // window.lxData.bubbleCursor = new BubbleCursor({
  //   fillStyle: styles.getPropertyValue('--color-primary-alpha-900'),
  //   strokeStyle: styles.getPropertyValue('--color-primary-alpha-700'),
  // })
})

// onBeforeUnmount(() => {
//   window.lxData.bubbleCursor?.destroy()
// })
</script>

<style lang="less">
@import './assets/styles/index.less';
@import './assets/styles/layout.less';

html {
  height: 100vh;
}
html,
body {
  // overflow: hidden;
  box-sizing: border-box;
}

body {
  user-select: none;
  height: 100%;
}
#root {
  height: 100%;
  position: relative;
  overflow: hidden;
  color: var(--color-font);
  background: var(--background-image) var(--background-image-position) no-repeat;
  background-size: var(--background-image-size);
  transition: background-color @transition-normal;
  background-color: var(--color-content-background);
  box-sizing: border-box;
}

html.bg-cover-mode {
  --background-image: none !important;
}

.disableAnimation * {
  transition: none !important;
  animation: none !important;
}

.transparent {
  background: transparent;
  padding: @shadow-app;
  // #waiting-mask {
  //   border-radius: @radius-border;
  //   left: @shadow-app;
  //   right: @shadow-app;
  //   top: @shadow-app;
  //   bottom: @shadow-app;
  // }
  #body {
    border-radius: @radius-border;
  }
  #root {
    box-shadow: 0 0 @shadow-app rgba(0, 0, 0, 0.5);
    border-radius: @radius-border;
  }
  // #container {
  // border-radius: @radius-border;
  // background-color: transparent;
  // }
}
.disableTransparent {
  background-color: var(--color-content-background);

  #body {
    border: 1px solid var(--color-primary-light-500);
  }

  #right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  // #view { // 偏移5px距离解决非透明模式下右侧滚动条无法拖动的问题
  //   margin-right: 5Px;
  // }
}
.fullscreen {
  background-color: var(--color-content-background);

  #right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
}

#container {
  position: relative;
  display: flex;
  height: 100%;
  background-color: var(--color-app-background);
}

#left {
  flex: none;
  width: @width-app-left;
}
#right {
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  transition: background-color @transition-normal;
  background-color: var(--color-main-background);

  border-top-left-radius: @radius-border;
  border-bottom-left-radius: @radius-border;
  overflow: hidden;
  box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.1);
}
#toolbar,
#player {
  flex: none;
}
#view {
  position: relative;
  flex: auto;
  // display: flex;
  min-height: 0;
}

.view-container {
  transition: opacity @transition-normal;
}
#root.show-modal > .view-container {
  opacity: 0.9;
}
#view.show-modal > .view-container {
  opacity: 0.2;
}

// 封面背景层
.bg-cover {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
  pointer-events: none;
  transition: opacity @transition-normal;
}

// 封面背景遮罩层
.bg-cover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  pointer-events: none;
  background-color: var(--color-content-background);
  opacity: 0.5;

  &.is-dark {
    background-color: rgba(0, 0, 0, 0.6);
    opacity: 0.6;
  }
}
</style>
