import { rendererSend, rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import {
  WIN_MAIN_RENDERER_EVENT_NAME,
  CMMON_EVENT_NAME,
} from '@common/ipcNames'

type RemoveListener = () => void

export const getEnvParams = async () => {
  return rendererInvoke<LX.EnvParams>(CMMON_EVENT_NAME.get_env_params)
}

export const clearEnvParamsDeeplink = () => {
  rendererSend(CMMON_EVENT_NAME.clear_env_params_deeplink)
}

export const onDeeplink = (listener: LX.IpcRendererEventListenerParams<string>): RemoveListener => {
  rendererOn(CMMON_EVENT_NAME.deeplink, listener)
  return () => {
    rendererOff(CMMON_EVENT_NAME.deeplink, listener)
  }
}

export const getSystemFonts = async () => {
  return rendererInvoke<string[]>(CMMON_EVENT_NAME.get_system_fonts).catch(() => {
    return []
  })
}
