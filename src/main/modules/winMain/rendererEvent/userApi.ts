import { createHash } from 'node:crypto'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { mainHandle } from '@common/mainIpc'
import {
  getApiList,
  importApi,
  removeApi,
  setApi,
  getStatus,
  request,
  cancelRequest,
  setAllowShowUpdateAlert,
} from '@main/modules/userApi'
import { getScript } from '@main/modules/userApi/utils'
import { sendEvent } from '@main/modules/winMain/main'

export default () => {
  mainHandle<string, LX.UserApi.ImportUserApi>(
    WIN_MAIN_RENDERER_EVENT_NAME.import_user_api,
    async ({ params: script }) => {
      return importApi(script)
    }
  )

  mainHandle<string[], LX.UserApi.UserApiInfo[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.remove_user_api,
    async ({ params: apiIds }) => {
      return removeApi(apiIds)
    }
  )

  mainHandle<LX.UserApi.UserApiSetApiParams>(
    WIN_MAIN_RENDERER_EVENT_NAME.set_user_api,
    async ({ params: apiId }) => {
      await setApi(apiId)
    }
  )

  mainHandle<LX.UserApi.UserApiInfo[]>(WIN_MAIN_RENDERER_EVENT_NAME.get_user_api_list, async () => {
    return getApiList()
  })

  // 取指定用户 API 插件的原始脚本及其 md5 指纹(用于分享时上传插件)
  mainHandle<string, { code: string; md5: string } | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_user_api_fingerprint,
    async ({ params: apiId }) => {
      const code = await getScript(apiId)
      if (!code) return null
      const md5 = createHash('md5').update(code, 'utf8').digest('hex')
      return { code, md5 }
    }
  )

  mainHandle<LX.UserApi.UserApiStatus>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_user_api_status,
    async () => {
      return getStatus()
    }
  )

  mainHandle<LX.UserApi.UserApiSetAllowUpdateAlertParams>(
    WIN_MAIN_RENDERER_EVENT_NAME.user_api_set_allow_update_alert,
    async ({ params: { id, enable } }) => {
      setAllowShowUpdateAlert(id, enable)
    }
  )

  mainHandle<LX.UserApi.UserApiRequestParams>(
    WIN_MAIN_RENDERER_EVENT_NAME.request_user_api,
    async ({ params }) => {
      return request(params)
    }
  )
  mainHandle<LX.UserApi.UserApiRequestCancelParams>(
    WIN_MAIN_RENDERER_EVENT_NAME.request_user_api_cancel,
    async ({ params: requestKey }) => {
      cancelRequest(requestKey)
    }
  )
}

export const sendStatusChange = (status: LX.UserApi.UserApiStatus) => {
  sendEvent(WIN_MAIN_RENDERER_EVENT_NAME.user_api_status, status)
}
export const sendShowUpdateAlert = (info: LX.UserApi.UserApiUpdateInfo) => {
  sendEvent(WIN_MAIN_RENDERER_EVENT_NAME.user_api_show_update_alert, info)
}
