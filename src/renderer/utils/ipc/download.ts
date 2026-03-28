import { rendererInvoke } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

export const downloadTasksGet = async () => {
  return rendererInvoke<LX.Download.ListItem[]>(WIN_MAIN_RENDERER_EVENT_NAME.download_list_get)
}
export const downloadTasksCreate = async (
  list: LX.Download.ListItem[],
  addMusicLocationType: LX.AddMusicLocationType
) => {
  return rendererInvoke<LX.Download.saveDownloadMusicInfo>(
    WIN_MAIN_RENDERER_EVENT_NAME.download_list_add,
    {
      list,
      addMusicLocationType,
    }
  )
}
export const downloadTasksUpdate = async (list: LX.Download.ListItem[]) => {
  return rendererInvoke<LX.Download.ListItem[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.download_list_update,
    list
  )
}
export const downloadTasksRemove = async (ids: string[]) => {
  return rendererInvoke<string[]>(WIN_MAIN_RENDERER_EVENT_NAME.download_list_remove, ids)
}
export const downloadListClear = async () => {
  return rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.download_list_clear)
}
