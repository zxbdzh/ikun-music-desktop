import { computed, ref, type ComputedRef, type Ref } from '@common/utils/vueTools'

export const usePodcastArtworkFallback = (
  source: Readonly<Ref<string | null | undefined>>
): { showImage: ComputedRef<boolean>; markFailed: () => void } => {
  const failedSource = ref<string | null>(null)
  const showImage = computed(() => Boolean(source.value) && source.value !== failedSource.value)

  const markFailed = () => {
    failedSource.value = source.value || null
  }

  return { showImage, markFailed }
}
