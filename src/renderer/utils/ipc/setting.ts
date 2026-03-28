import { rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import {
  WIN_MAIN_RENDERER_EVENT_NAME,
  CMMON_EVENT_NAME,
} from '@common/ipcNames'

type RemoveListener = () => void

export const getSetting = async () => {
  return rendererInvoke<LX.AppSetting>(CMMON_EVENT_NAME.get_app_setting)
}
export const updateSetting = async (setting: Partial<LX.AppSetting>) => {
  await rendererInvoke(CMMON_EVENT_NAME.set_app_setting, setting)
}
export const onSettingChanged = (
  listener: LX.IpcRendererEventListenerParams<Partial<LX.AppSetting>>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.on_config_change, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.on_config_change, listener)
  }
}
