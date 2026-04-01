import { ref, shallowRef } from '@common/utils/vueTools'

export const isShowShareMusicCard = ref(false)
export const shareMusicInfo = shallowRef(null)

export const openShareMusicCard = (musicInfo) => {
  shareMusicInfo.value = musicInfo ?? null
  isShowShareMusicCard.value = true
}

export const closeShareMusicCard = () => {
  isShowShareMusicCard.value = false
}
