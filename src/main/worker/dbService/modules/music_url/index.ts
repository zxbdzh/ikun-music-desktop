import {
  queryMusicUrl,
  insertMusicUrl,
  deleteMusicUrl,
  clearMusicUrl,
  countMusicUrl,
} from './dbHelper'

/**
 * 获取歌曲url
 * @param id 歌曲id
 * @returns 歌曲url
 */
export const getMusicUrl = (id: string): { url: string; ekey: string | null } | null => {
  return queryMusicUrl(id)
}

/**
 * 保存歌曲url
 * @param urlInfos url信息
 */
export const musicUrlSave = (urlInfos: LX.Music.MusicUrlInfo[]) => {
  insertMusicUrl(urlInfos)
}

/**
 * 删除歌曲url
 * @param ids 歌曲id
 */
export const musicUrlRemove = (ids: string[]) => {
  deleteMusicUrl(ids)
}

/**
 * 清空歌曲url
 */
export const musicUrlClear = () => {
  clearMusicUrl()
}

/**
 * 统计歌曲url数量
 */
export const musicUrlCount = () => {
  return countMusicUrl()
}
