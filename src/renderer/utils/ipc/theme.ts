import { rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import {
  WIN_MAIN_RENDERER_EVENT_NAME,
  CMMON_EVENT_NAME,
} from '@common/ipcNames'

type RemoveListener = () => void

export const saveTheme = async (theme: LX.Theme) => {
  return rendererInvoke<LX.Theme>(WIN_MAIN_RENDERER_EVENT_NAME.save_theme, theme)
}
export const removeTheme = async (id: string) => {
  return rendererInvoke<string>(WIN_MAIN_RENDERER_EVENT_NAME.remove_theme, id)
}
export const getThemes = async () => {
  return rendererInvoke<{ themes: LX.Theme[]; userThemes: LX.Theme[]; dataPath: string }>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_themes
  )
}

export const onThemeChange = (
  listener: LX.IpcRendererEventListenerParams<LX.ThemeSetting>
): RemoveListener => {
  rendererOn(CMMON_EVENT_NAME.theme_change, listener)
  return () => {
    rendererOff(CMMON_EVENT_NAME.theme_change, listener)
  }
}
