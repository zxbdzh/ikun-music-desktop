<template>
  <span :class="$style.artwork">
    <img
      v-if="showImage"
      :src="src || undefined"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @error="markFailed"
    />
    <span
      v-else
      data-podcast-artwork-fallback
      :class="$style.fallback"
      :role="alt ? 'img' : undefined"
      :aria-label="alt || undefined"
      :aria-hidden="alt ? undefined : 'true'"
    >
      <svg-icon name="music" aria-hidden="true" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { toRef } from '@common/utils/vueTools'
import { usePodcastArtworkFallback } from './podcastArtwork'

const props = withDefaults(defineProps<{
  src?: string
  alt?: string
}>(), {
  src: '',
  alt: '',
})

const { showImage, markFailed } = usePodcastArtworkFallback(toRef(props, 'src'))
</script>

<style lang="less" module>
.artwork {
  display: inline-grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  background: var(--color-primary-light-400-alpha-400);
  color: var(--color-primary-dark-400);
}

.artwork > img,
.fallback {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
}

.artwork > img {
  display: block;
  object-fit: cover;
}

.fallback {
  display: grid;
  place-items: center;
}

.fallback svg {
  width: 48%;
  height: 48%;
}
</style>
