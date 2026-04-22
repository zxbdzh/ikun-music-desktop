/**
 * 听歌识曲弹窗管理
 */
import { ref } from '@common/utils/vueTools'

const _isVisible = ref(false)

export const isAudioMatchVisible = _isVisible

export const showAudioMatch = () => {
  _isVisible.value = true
}

export const hideAudioMatch = () => {
  _isVisible.value = false
}

export const useAudioMatch = () => {
  return {
    isAudioMatchVisible: _isVisible,
    showAudioMatch,
    hideAudioMatch,
  }
}