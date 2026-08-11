import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { usePodcastArtworkFallback } from './podcastArtwork'

describe('podcast artwork fallback', () => {
  it('replaces a failed image and retries when the source changes', () => {
    const source = ref<string | null>('https://cdn.example/failed.jpg')
    const { showImage, markFailed } = usePodcastArtworkFallback(source)

    expect(showImage.value).toBe(true)
    markFailed()
    expect(showImage.value).toBe(false)

    source.value = 'https://cdn.example/replacement.jpg'
    expect(showImage.value).toBe(true)
  })

  it('shows the fallback immediately when no artwork URL exists', () => {
    const source = ref<string | null>(null)
    const { showImage } = usePodcastArtworkFallback(source)

    expect(showImage.value).toBe(false)
  })
})
