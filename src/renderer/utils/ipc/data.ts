import { rendererSend, rendererInvoke } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { DATA_KEYS, DEFAULT_SETTING } from '@common/constants'

export const getOtherSource = async (id: string): Promise<LX.Music.MusicInfoOnline[]> => {
  return rendererInvoke<string, LX.Music.MusicInfoOnline[]>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_other_source,
    id
  )
}
export const saveOtherSource = async (id: string, sourceInfo: LX.Music.MusicInfoOnline[]) => {
  await rendererInvoke<LX.Music.MusicInfoOtherSourceSave>(
    WIN_MAIN_RENDERER_EVENT_NAME.save_other_source,
    {
      id,
      list: sourceInfo,
    }
  )
}
export const clearOtherSource = async () => {
  await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.clear_other_source)
}
export const getOtherSourceCount = async () => {
  return rendererInvoke<number>(WIN_MAIN_RENDERER_EVENT_NAME.get_other_source_count)
}

export const saveLastStartInfo = (version: string) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.lastStartInfo,
    data: version,
  })
}
export const getLastStartInfo = async () => {
  return rendererInvoke<string, string | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_data,
    DATA_KEYS.lastStartInfo
  )
}

export const savePlayInfo = (playInfo: LX.Player.SavedPlayInfo) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.playInfo,
    data: playInfo,
  })
}
export const getPlayInfo = async () => {
  return rendererInvoke<string, LX.Player.SavedPlayInfo | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_data,
    DATA_KEYS.playInfo
  )
}

export const saveSearchHistoryList = (list: LX.List.SearchHistoryList) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.searchHistoryList,
    data: list,
  })
}
export const getSearchHistoryList = async () => {
  return rendererInvoke<string, string[] | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_data,
    DATA_KEYS.searchHistoryList
  )
}

export const saveListPositionInfo = (listPosition: LX.List.ListPositionInfo) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.listScrollPosition,
    data: listPosition,
  })
}
export const getListPositionInfo = async () => {
  return rendererInvoke<string, LX.List.ListPositionInfo | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_data,
    DATA_KEYS.listScrollPosition
  )
}

export const saveListPrevSelectId = (listPosition: string | null) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.listPrevSelectId,
    data: listPosition,
  })
}
export const getListPrevSelectId = async () => {
  return rendererInvoke<string, string | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_data,
    DATA_KEYS.listPrevSelectId
  )
}

export const saveListUpdateInfo = (listPosition: LX.List.ListUpdateInfo) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.listUpdateInfo,
    data: listPosition,
  })
}
export const getListUpdateInfo = async () => {
  return rendererInvoke<string, LX.List.ListUpdateInfo | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_data,
    DATA_KEYS.listUpdateInfo
  )
}

export const saveIgnoreVersion = (version: string) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.ignoreVersion,
    data: version,
  })
}
export const getIgnoreVersion = async () => {
  return rendererInvoke<string, string | null>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_data,
    DATA_KEYS.ignoreVersion
  )
}

export const saveLeaderboardSetting = (source: (typeof DEFAULT_SETTING)['leaderboard']) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.leaderboardSetting,
    data: source,
  })
}
export const getLeaderboardSetting = async () => {
  return (
    (await rendererInvoke<string, (typeof DEFAULT_SETTING)['leaderboard']>(
      WIN_MAIN_RENDERER_EVENT_NAME.get_data,
      DATA_KEYS.leaderboardSetting
    )) ?? { ...DEFAULT_SETTING.leaderboard }
  )
}
export const saveSongListSetting = (setting: (typeof DEFAULT_SETTING)['songList']) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.songListSetting,
    data: setting,
  })
}
export const getSongListSetting = async () => {
  return (
    (await rendererInvoke<string, (typeof DEFAULT_SETTING)['songList']>(
      WIN_MAIN_RENDERER_EVENT_NAME.get_data,
      DATA_KEYS.songListSetting
    )) ?? { ...DEFAULT_SETTING.songList }
  )
}
export const saveSearchSetting = (setting: (typeof DEFAULT_SETTING)['search']) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.searchSetting,
    data: setting,
  })
}
export const getSearchSetting = async () => {
  return (
    (await rendererInvoke<string, (typeof DEFAULT_SETTING)['search']>(
      WIN_MAIN_RENDERER_EVENT_NAME.get_data,
      DATA_KEYS.searchSetting
    )) ?? { ...DEFAULT_SETTING.search }
  )
}
export const saveViewPrevState = (state: (typeof DEFAULT_SETTING)['viewPrevState']) => {
  rendererSend(WIN_MAIN_RENDERER_EVENT_NAME.save_data, {
    path: DATA_KEYS.viewPrevState,
    data: state,
  })
}
export const getViewPrevState = async () => {
  return (
    (await rendererInvoke<string, (typeof DEFAULT_SETTING)['viewPrevState']>(
      WIN_MAIN_RENDERER_EVENT_NAME.get_data,
      DATA_KEYS.viewPrevState
    )) ?? { ...DEFAULT_SETTING.viewPrevState }
  )
}
