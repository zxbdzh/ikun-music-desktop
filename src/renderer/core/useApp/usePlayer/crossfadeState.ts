import { ref } from '@common/utils/vueTools'

export const isCrossfading = ref(false)
export const isCrossfadeCompleting = ref(false)

// Song ID of the song that just completed crossfade (new active song)
export const crossfadeDoneMusicId = ref<string | null>(null)

// Timestamp when crossfade completed (for handleEnded guard)
export const lastCrossfadeEndTime = ref(0)

// Flag: new song started playing after crossfade (cleared by handleEnded guards)
export const isAfterCrossfade = ref(false)

let _cancelCrossfade: (() => void) | null = null

export const registerCancelCrossfade = (fn: () => void) => {
  _cancelCrossfade = fn
}

export const cancelCrossfade = () => {
  _cancelCrossfade?.()
}

// Called by crossfade completion to signal that old playback state should be discarded
export const onCrossfadeDone = () => {
  isCrossfading.value = false
  isCrossfadeCompleting.value = false
}
