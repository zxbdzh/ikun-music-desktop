import { watch } from '@common/utils/vueTools'
import { rendererInvoke, rendererOn } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { setDuckingGain } from '@renderer/plugins/player'
import { appSetting } from '@renderer/store/setting'

let isExternalMediaPlaying = false

const getDuration = (): number => {
  return Math.min(Math.max(appSetting['player.externalMediaDuckingDuration'], 200), 3000)
}

const syncDuckingGain = (): void => {
  const gain =
    appSetting['player.externalMediaDuckingEnabled'] && isExternalMediaPlaying
      ? appSetting['player.externalMediaDuckingVolume'] / 100
      : 1
  setDuckingGain(gain, getDuration())
}

export default () => {
  rendererOn<boolean>(WIN_MAIN_RENDERER_EVENT_NAME.external_media_playing, ({ params }) => {
    isExternalMediaPlaying = params
    syncDuckingGain()
  })

  void rendererInvoke<boolean>(WIN_MAIN_RENDERER_EVENT_NAME.external_media_playing)
    .then((isPlaying) => {
      isExternalMediaPlaying = isPlaying
      syncDuckingGain()
    })
    .catch(() => {
      // Non-Windows and unavailable SMTC monitoring both gracefully retain normal volume.
      isExternalMediaPlaying = false
      syncDuckingGain()
    })

  watch(
    () => [
      appSetting['player.externalMediaDuckingEnabled'],
      appSetting['player.externalMediaDuckingVolume'],
    ],
    syncDuckingGain
  )
}
