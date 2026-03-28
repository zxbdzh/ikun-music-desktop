import { rendererSend, rendererOn, rendererOff } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { type ProgressInfo, type UpdateDownloadedEvent, type UpdateInfo } from 'electron-updater'

type RemoveListener = () => void

export const checkUpdate = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.update_check)
}

export const downloadUpdate = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.update_download_update)
}

export const quitUpdate = () => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.quit_update)
}

export const onUpdateAvailable = (
  listener: LX.IpcRendererEventListenerParams<UpdateInfo>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.update_available, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.update_available, listener)
  }
}

export const onUpdateError = (
  listener: LX.IpcRendererEventListenerParams<string>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.update_error, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.update_error, listener)
  }
}

export const onUpdateProgress = (
  listener: LX.IpcRendererEventListenerParams<ProgressInfo>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.update_progress, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.update_progress, listener)
  }
}

export const onUpdateDownloaded = (
  listener: LX.IpcRendererEventListenerParams<UpdateDownloadedEvent>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.update_downloaded, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.update_downloaded, listener)
  }
}

export const onUpdateNotAvailable = (
  listener: LX.IpcRendererEventListenerParams<UpdateInfo>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.update_not_available, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.update_not_available, listener)
  }
}
