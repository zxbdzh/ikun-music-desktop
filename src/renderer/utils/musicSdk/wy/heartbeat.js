import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'

// 心动模式
export default {
  /**
   * 获取心动模式歌曲列表
   * @param {string} cookie - 用户cookie
   * @param {string|number} playlistId - 歌单ID
   * @param {string|number} songId - 歌曲ID
   * @param {number} retryNum - 重试次数
   * @returns {Promise<{list: Array, source: string}>}
   */
  async getHeartbeatModeList(cookie, playlistId, songId, retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('获取心动模式列表失败'))

    try {
      // 从cookie提取csrf token
      const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1]

      console.log('[heartbeat] 请求参数:', {
        url: `https://music.163.com/weapi/playmode/intelligence/list?csrf_token=${csrfToken || ''}`,
        playlistId,
        songId,
        type: 'fromPlayOne',
        startMusicId: songId,
        count: '150',
      })

      const requestObj = httpFetch(
        `https://music.163.com/weapi/playmode/intelligence/list?csrf_token=${csrfToken || ''}`,
        {
          method: 'post',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54',
            origin: 'https://music.163.com',
            Referer: 'https://music.163.com',
            cookie,
          },
          form: weapi({
            playlistId,
            songId,
            type: 'fromPlayOne',
            startMusicId: songId,
            count: '150',
            csrf_token: csrfToken || '',
          }),
        }
      )

      const { body, statusCode } = await requestObj.promise

      console.log('[heartbeat] 响应状态:', statusCode, body.code)

      if (statusCode !== 200 || body.code !== 200) {
        throw new Error(body.message || '获取心动模式列表失败')
      }

      // 从返回数据中提取歌曲信息
      const list = (body.data || []).map((item) => {
        // 优先使用songInfo，否则使用item本身
        const song = item.songInfo || item
        return {
          id: song.id,
          name: song.name || '',
          ar: song.ar || [],
          al: song.al || { id: 0, name: '', picUrl: '' },
          dt: song.dt || 0,
          fee: song.fee || 0,
        }
      }).filter((song) => song.id)

      console.log('[heartbeat] 提取的歌曲数:', list.length)
      if (!list.length) return { list: [], source: 'wy' }

      return { list, source: 'wy' }
    } catch (error) {
      console.log(`获取心动模式列表失败，正在进行第 ${retryNum + 1} 次重试...`, error.message)
      console.log('[heartbeat] 错误详情:', error)
      return this.getHeartbeatModeList(cookie, playlistId, songId, retryNum + 1)
    }
  },
}
