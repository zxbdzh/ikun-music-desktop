/**
 * 网易云音乐模块主入口
 * 支持：音乐搜索、榜单、歌单、热搜、歌词、评论、用户操作、专辑、歌手、MV等
 */

// @ts-ignore
import leaderboard from './leaderboard'
// @ts-ignore
import { apis } from '../api-source'
// @ts-ignore
import getLyric from './lyric'
// @ts-ignore
import getMusicInfo from './musicInfo'
// @ts-ignore
import musicSearch from './musicSearch'
// @ts-ignore
import songList from './songList'
// @ts-ignore
import hotSearch from './hotSearch'
// @ts-ignore
import comment from './comment'

// 新增模块
// @ts-ignore
import user from './user'
// @ts-ignore
import album from './album'
// @ts-ignore
import singer from './singer'
// @ts-ignore
import mv from './mv'
// @ts-ignore
import dailyRec from './dailyRec'
// @ts-ignore
import scrobble from './scrobble'

const wy = {
  // 现有模块
  leaderboard,
  musicSearch,
  songList,
  hotSearch,
  comment,

  // 新增模块
  user,
  album,
  singer,
  mv,
  dailyRec,
  scrobble,

  // 核心方法
  getMusicUrl(songInfo: any, type?: any) {
    return apis('wy').getMusicUrl(songInfo, type)
  },

  getLyric(songInfo: any) {
    return getLyric(songInfo.songmid)
  },

  getPic(songInfo: any) {
    const requestObj: any = getMusicInfo(songInfo.songmid)
    return requestObj.promise.then((info: any) => info.al.picUrl)
  },

  getMusicDetailPageUrl(songInfo: any) {
    return `https://music.163.com/#/song?id=${songInfo.songmid}`
  },
}

export default wy
