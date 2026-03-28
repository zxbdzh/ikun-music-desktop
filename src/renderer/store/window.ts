import { ref, computed, markRaw, watch } from '@common/utils/vueTools'
import { windowSizeList as configWindowSizeList } from '@common/config'
import { appSetting } from './setting'

export const windowSizeList = markRaw(configWindowSizeList)

export const windowSizeActive = computed(() => {
  return (
    windowSizeList.find((i: { id: any }) => i.id === appSetting['common.windowSizeId']) ??
    windowSizeList[0]
  )
})

export const isFullscreen = ref(false)
watch(
  isFullscreen,
  (isFullscreen: any) => {
    window.lx.rootOffset = window.dt || isFullscreen ? 0 : 8
  },
  { immediate: true }
)
