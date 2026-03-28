import { rendererSend, rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

type RemoveListener = () => void

export const importUserApi = async (fileText: string) => {
  return rendererInvoke<string, LX.UserApi.ImportUserApi>(
    WIN_MAIN_RENDERER_EVENT_NAME.import_user_api,
    fileText
  )
}
export const setUserApi = async (source: LX.UserApi.UserApiSetApiParams): Promise<void> => {
  return rendererInvoke<LX.UserApi.UserApiSetApiParams>(
    WIN_MAIN_RENDERER_EVENT_NAME.set_user_api,
    source
  )
}
export const removeUserApi = async (ids: string[]) => {
  return rendererInvoke<string[], LX.UserApi.UserApiInfo[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.remove_user_api,
    ids
  )
}
export const onShowUserApiUpdateAlert = (
  listener: LX.IpcRendererEventListenerParams<LX.UserApi.UserApiUpdateInfo>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.user_api_show_update_alert, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.user_api_show_update_alert, listener)
  }
}
export const setAllowShowUserApiUpdateAlert = async (
  id: string,
  enable: boolean
): Promise<void> => {
  return rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.user_api_set_allow_update_alert, {
    id,
    enable,
  })
}
export const onUserApiStatus = (
  listener: LX.IpcRendererEventListenerParams<LX.UserApi.UserApiStatus>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.user_api_status, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.user_api_status, listener)
  }
}
export const getUserApiList = async () => {
  return rendererInvoke<LX.UserApi.UserApiInfo[]>(WIN_MAIN_RENDERER_EVENT_NAME.get_user_api_list)
}
export const sendUserApiRequest = async ({
  requestKey,
  data,
}: LX.UserApi.UserApiRequestParams): Promise<any> => {
  return rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.request_user_api, {
    requestKey,
    data,
  })
}
export const userApiRequestCancel = (requestKey: LX.UserApi.UserApiRequestCancelParams) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.request_user_api_cancel, requestKey)
}
