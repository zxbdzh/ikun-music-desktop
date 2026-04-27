import { watch } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { SeamlessPlaybackManager } from '@renderer/plugins/seamless'

export default () => {
  const seamlessManager = SeamlessPlaybackManager.getInstance()

  watch(
    () => appSetting['player.seamlessPlayback.enable'],
    (enabled) => {
      seamlessManager.setEnabled(enabled)
    }
  )

  watch(
    () => appSetting['player.seamlessPlayback.mode'],
    (mode) => {
      seamlessManager.setMode(mode)
    }
  )
}
