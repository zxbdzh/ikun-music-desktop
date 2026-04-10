import { ref, shallowRef } from '@common/utils/vueTools'

export const isShowSongMemory = ref(false)
export const songMemoryInfo = shallowRef(null)

export const openSongMemory = (musicInfo) => {
  songMemoryInfo.value = musicInfo ?? null
  isShowSongMemory.value = true
}

export const closeSongMemory = () => {
  isShowSongMemory.value = false
}
