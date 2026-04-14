import { ref, watch } from '@common/utils/vueTools'
import { musicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'

export default () => {
  const bgCover = ref<string | null>(null)

  // 监听封面更新事件
  const handlePicUpdated = () => {
    console.log('[BgCover] picUpdated event, pic:', musicInfo.pic)
    if (!appSetting['theme.enableBgCover']) return
    const pic = musicInfo.pic
    if (pic) {
      bgCover.value = pic
    }
  }

  window.app_event.on('picUpdated', handlePicUpdated)

  // 直接监听 musicInfo.pic 变化
  watch(
    () => musicInfo.pic,
    (pic) => {
      console.log('[BgCover] musicInfo.pic changed:', pic)
      if (!appSetting['theme.enableBgCover']) return
      if (pic) {
        bgCover.value = pic
      }
    },
    { immediate: true }
  )

  // 监听设置项变化
  watch(
    () => appSetting['theme.enableBgCover'],
    (enabled) => {
      console.log('[BgCover] enableBgCover changed:', enabled)
      if (enabled && musicInfo.pic) {
        bgCover.value = musicInfo.pic
      } else if (!enabled) {
        bgCover.value = null
      }
    },
    { immediate: true }
  )

  return { bgCover }
}