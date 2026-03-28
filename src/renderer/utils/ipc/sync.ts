import { rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

type RemoveListener = () => void

export const onSyncAction = (
  listener: LX.IpcRendererEventListenerParams<LX.Sync.SyncMainWindowActions>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.sync_action, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.sync_action, listener)
  }
}

export const sendSyncAction = async (action: LX.Sync.SyncServiceActions) => {
  return rendererInvoke<LX.Sync.SyncServiceActions>(
    WIN_MAIN_RENDERER_EVENT_NAME.sync_action,
    action
  )
}

export const getSyncServerDevices = () => {
  return rendererInvoke<LX.Sync.ServerDevices>(WIN_MAIN_RENDERER_EVENT_NAME.sync_get_server_devices)
}

export const removeSyncServerDevice = (clientId: string) => {
  return rendererInvoke<string>(WIN_MAIN_RENDERER_EVENT_NAME.sync_remove_server_device, clientId)
}
