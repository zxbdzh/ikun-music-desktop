import { rendererSend, rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

type RemoveListener = () => void

export const sendInited = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.inited)
}

export const setIgnoreMouseEvents = (ignore: boolean) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.set_ignore_mouse_events, ignore)
}

export const setWindowSize = (width: number, height: number) => {
  const params: Partial<Electron.Rectangle> = {
    width,
    height,
  }
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.set_window_size, params)
}

export const quitApp = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.quit)
}

export const closeWindow = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.close)
}

export const minWindow = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.min)
}

export const maxWindow = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.max)
}

export const minMaxWindowToggle = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.min_toggle)
}

export const showHideWindowToggle = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.hide_toggle)
}

export const focusWindow = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.focus)
}

export const setPowerSaveBlocker = (enabled: boolean) => {
  rendererSend<boolean>(WIN_MAIN_RENDERER_EVENT_NAME.set_power_save_blocker, enabled)
}

export const onFocus = (listener: LX.IpcRendererEventListener): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.focus, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.focus, listener)
  }
}

export const setFullScreen = async (isFullscreen: boolean): Promise<boolean> => {
  return rendererInvoke<boolean, boolean>(WIN_MAIN_RENDERER_EVENT_NAME.fullscreen, isFullscreen)
}

export const openDevTools = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.open_dev_tools)
}

export const showSelectDialog = async (options: Electron.OpenDialogOptions) => {
  return rendererInvoke<Electron.OpenDialogOptions, Electron.OpenDialogReturnValue>(
    WIN_MAIN_RENDERER_EVENT_NAME.show_select_dialog,
    options
  )
}

export const openSaveDir = async (options: Electron.SaveDialogOptions) => {
  return rendererInvoke<Electron.SaveDialogOptions, Electron.SaveDialogReturnValue>(
    WIN_MAIN_RENDERER_EVENT_NAME.show_save_dialog,
    options
  )
}

export const openDirInExplorer = async (path: string) => {
  return rendererSend<string>(WIN_MAIN_RENDERER_EVENT_NAME.open_dir_in_explorer, path)
}

export const getCacheSize = async () => {
  return rendererInvoke<number>(WIN_MAIN_RENDERER_EVENT_NAME.get_cache_size)
}

export const clearCache = async () => {
  await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.clear_cache)
}
