import { rendererInvoke, rendererOn, rendererOff } from '@common/rendererIpc'
import {
  HOTKEY_RENDERER_EVENT_NAME,
  WIN_MAIN_RENDERER_EVENT_NAME,
} from '@common/ipcNames'
import { markRaw } from '@common/utils/vueTools'
import * as hotKeys from '@common/hotKey'
import { APP_EVENT_NAMES } from '@common/constants'

type RemoveListener = () => void

export const getHotKeyConfig = async () => {
  return rendererInvoke<LX.HotKeyConfigAll>(WIN_MAIN_RENDERER_EVENT_NAME.get_hot_key)
}

export const allHotKeys = markRaw({
  local: [
    {
      name: hotKeys.HOTKEY_PLAYER.toggle_play.name,
      action: hotKeys.HOTKEY_PLAYER.toggle_play.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.prev.name,
      action: hotKeys.HOTKEY_PLAYER.prev.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.next.name,
      action: hotKeys.HOTKEY_PLAYER.next.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.seekbackward.name,
      action: hotKeys.HOTKEY_PLAYER.seekbackward.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.seekforward.name,
      action: hotKeys.HOTKEY_PLAYER.seekforward.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.music_dislike.name,
      action: hotKeys.HOTKEY_PLAYER.music_dislike.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_COMMON.focusSearchInput.name,
      action: hotKeys.HOTKEY_COMMON.focusSearchInput.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_COMMON.min.name,
      action: hotKeys.HOTKEY_COMMON.min.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_COMMON.close.name,
      action: hotKeys.HOTKEY_COMMON.close.action,
      type: APP_EVENT_NAMES.winMainName,
    },
  ],
  global: [
    {
      name: hotKeys.HOTKEY_COMMON.min_toggle.name,
      action: hotKeys.HOTKEY_COMMON.min_toggle.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_COMMON.hide_toggle.name,
      action: hotKeys.HOTKEY_COMMON.hide_toggle.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_COMMON.close.name,
      action: hotKeys.HOTKEY_COMMON.close.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.toggle_play.name,
      action: hotKeys.HOTKEY_PLAYER.toggle_play.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.prev.name,
      action: hotKeys.HOTKEY_PLAYER.prev.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.next.name,
      action: hotKeys.HOTKEY_PLAYER.next.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.seekbackward.name,
      action: hotKeys.HOTKEY_PLAYER.seekbackward.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.seekforward.name,
      action: hotKeys.HOTKEY_PLAYER.seekforward.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.volume_up.name,
      action: hotKeys.HOTKEY_PLAYER.volume_up.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.volume_down.name,
      action: hotKeys.HOTKEY_PLAYER.volume_down.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.volume_mute.name,
      action: hotKeys.HOTKEY_PLAYER.volume_mute.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.music_love.name,
      action: hotKeys.HOTKEY_PLAYER.music_love.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.music_unlove.name,
      action: hotKeys.HOTKEY_PLAYER.music_unlove.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_PLAYER.music_dislike.name,
      action: hotKeys.HOTKEY_PLAYER.music_dislike.action,
      type: APP_EVENT_NAMES.winMainName,
    },
    {
      name: hotKeys.HOTKEY_DESKTOP_LYRIC.toggle_visible.name,
      action: hotKeys.HOTKEY_DESKTOP_LYRIC.toggle_visible.action,
      type: APP_EVENT_NAMES.winLyricName,
    },
    {
      name: hotKeys.HOTKEY_DESKTOP_LYRIC.toggle_lock.name,
      action: hotKeys.HOTKEY_DESKTOP_LYRIC.toggle_lock.action,
      type: APP_EVENT_NAMES.winLyricName,
    },
    {
      name: hotKeys.HOTKEY_DESKTOP_LYRIC.toggle_always_top.name,
      action: hotKeys.HOTKEY_DESKTOP_LYRIC.toggle_always_top.action,
      type: APP_EVENT_NAMES.winLyricName,
    },
  ],
})

export const hotKeySetEnable = async (enable: boolean) => {
  return rendererInvoke(HOTKEY_RENDERER_EVENT_NAME.enable, enable)
}

export const hotKeySetConfig = async (config: LX.HotKeyActions) => {
  return rendererInvoke(HOTKEY_RENDERER_EVENT_NAME.set_config, config)
}

export const hotKeyGetStatus = async () => {
  return rendererInvoke<LX.HotKeyState>(HOTKEY_RENDERER_EVENT_NAME.status)
}

export const onKeyDown = (
  listener: LX.IpcRendererEventListenerParams<LX.HotKeyEvent>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.key_down, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.key_down, listener)
  }
}

export const onUpdateHotkey = (
  listener: LX.IpcRendererEventListenerParams<LX.HotKeyConfigAll>
): RemoveListener => {
  rendererOn(WIN_MAIN_RENDERER_EVENT_NAME.set_hot_key_config, listener)
  return () => {
    rendererOff(WIN_MAIN_RENDERER_EVENT_NAME.set_hot_key_config, listener)
  }
}
