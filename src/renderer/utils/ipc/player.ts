import { rendererSend, rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

type RemoveListener = () => void

export const sendPlayerStatus = (status: Partial<LX.Player.Status>) => {
  rendererSend<Partial<LX.Player.Status>>(WIN_MAIN_RENDERER_EVENT_NAME.player_status, status)
}

export const onPlayerAction = (listener: LX.IpcRendererEventListenerParams<{
  action: LX.Player.StatusButtonActions
  data?: unknown
}>): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.player_action_on_button_click, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.player_action_on_button_click, listener)
  }
}

export const setPlayerAction = (buttons: LX.TaskBarButtonFlags) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.player_action_set_buttons, buttons)
}

export const getPlayerLyric = async (musicInfo: LX.Music.MusicInfo) => {
  return rendererInvoke<string, LX.Player.LyricInfo>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_palyer_lyric,
    musicInfo.id
  )
}

export const onNewDesktopLyricProcess = (listener: LX.IpcRendererEventListener): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.process_new_desktop_lyric_client, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.process_new_desktop_lyric_client, listener)
  }
}

export const sendOpenAPIAction = async (action: LX.OpenAPI.Actions) => {
  return rendererInvoke<LX.OpenAPI.Actions, LX.OpenAPI.Status>(
    WIN_MAIN_RENDERER_EVENT_NAME.open_api_action,
    action
  )
}
