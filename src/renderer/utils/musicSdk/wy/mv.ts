/**
 * 网易云音乐MV模块
 * 支持：MV详情、MV播放URL、MV评论
 */

// @ts-ignore
import { httpFetch } from '../../request'
// @ts-ignore
import { weapi } from './utils/crypto'

// MV模块
export default {
  /**
   * 获取MV详情
   * @param mvid MV ID
   */
  async getMvDetail(mvid: string | number): Promise<any> {
    const response: any = httpFetch(`https://music.163.com/api/mv/detail?id=${mvid}`, {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取MV详情失败')
    }

    const data = body.data || {}

    return {
      id: data.id,
      name: data.name || '',
      artistId: data.artistId || 0,
      artistName: data.artistName || '',
      coverUrl: data.coverUrl || '',
      cover: data.cover || '',
      desc: data.desc || '',
      publishTime: data.publishTime || '',
      playCount: data.playCount || 0,
      subCount: data.subCount || 0,
      shareCount: data.shareCount || 0,
      commentCount: data.commentCount || 0,
      duration: data.duration || 0,
      liked: data.liked || false,
      videoGroup: data.videoGroup || [],
    }
  },

  /**
   * 获取MV播放URL
   * @param mvid MV ID
   * @param quality 画质等级 (480, 720, 1080, 2k, 4k)
   */
  async getMvUrl(mvid: string | number, quality: string = '1080'): Promise<any> {
    const response: any = httpFetch('https://music.163.com/weapi/song/enhance/getMv-url', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        id: mvid,
        r: quality,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取MV播放地址失败')
    }

    const data = body.data || {}
    const mvData = data[mvid] || {}

    const qualityMap: Record<string, string> = {
      '4k': '4k',
      '2k': '2k',
      '1080': '1080p',
      '720': '720p',
      '480': '480p',
      '360': '360p',
      '240': '240p',
    }

    const qualityKey = qualityMap[quality] || '1080p'

    return {
      id: Number(mvid),
      url: mvData[qualityKey] || mvData.url || '',
      size: mvData.size || 0,
      md5: mvData.md5 || '',
    }
  },

  /**
   * 获取MV所有可用画质
   * @param mvid MV ID
   */
  async getMvUrlAll(mvid: string | number): Promise<Record<string, any>> {
    const qualities = ['4k', '2k', '1080', '720', '480', '360', '240']
    const result: Record<string, any> = {}

    for (const quality of qualities) {
      try {
        const url = await this.getMvUrl(mvid, quality)
        if (url.url) {
          result[quality] = url
        }
      } catch (e) {
        // 忽略不支持的画质
      }
    }

    return result
  },

  /**
   * 获取MV评论
   * @param mvid MV ID
   * @param page 页码
   * @param limit 每页数量
   */
  async getMvComment(
    mvid: string | number,
    page: number = 1,
    limit: number = 20
  ): Promise<{ comments: any[]; total: number; hotComments: any[] }> {
    const id = 'R_MV_5_' + mvid

    const response: any = httpFetch('https://music.163.com/weapi/v1/resource/comments/R_MV_5_' + mvid, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        rid: id,
        limit,
        offset: limit * (page - 1),
        beforeTime: Date.now().toString(),
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取MV评论失败')
    }

    return {
      comments: body.comments || [],
      hotComments: body.hotComments || [],
      total: body.total || 0,
    }
  },

  /**
   * 收藏/取消收藏MV
   * @param mvid MV ID
   * @param isSubscribe true=收藏, false=取消收藏
   * @param cookie 网易云Cookie
   */
  async subscribeMv(mvid: string | number, isSubscribe: boolean, cookie: string): Promise<boolean> {
    const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

    const response: any = httpFetch('https://music.163.com/weapi/mv/sub', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
        cookie,
      },
      form: weapi({
        mvId: mvid,
        mvIds: `[${mvid}]`,
        t: isSubscribe ? 1 : 0,
        csrf_token: csrfToken,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error(isSubscribe ? '收藏MV失败' : '取消收藏MV失败')
    }

    return true
  },

  /**
   * 获取相似MV
   * @param mvid MV ID
   */
  async getSimiMv(mvid: string | number): Promise<any[]> {
    const response: any = httpFetch('https://music.163.com/api/discovery/simiMv', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        mvid,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return body.mvs || []
  },

  /**
   * MV搜索
   * @param keyword 搜索关键词
   * @param page 页码
   * @param limit 每页数量
   */
  async searchMv(
    keyword: string,
    page: number = 1,
    limit: number = 30
  ): Promise<{ mvs: any[]; total: number }> {
    const response: any = httpFetch('https://music.163.com/api/search/get', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        s: keyword,
        type: 1004, // MV类型
        limit,
        total: page === 1,
        offset: limit * (page - 1),
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('搜索MV失败')
    }

    const result = body.result || {}

    return {
      mvs: (result.mvs || []).map((mv: any) => ({
        id: mv.id,
        name: mv.name,
        artistId: mv.artistId,
        artistName: mv.artistName,
        coverUrl: mv.coverUrl,
        duration: mv.duration,
        playCount: mv.playCount,
      })),
      total: result.mvCount || 0,
    }
  },

  /**
   * 获取最新MV
   * @param limit 每页数量
   */
  async getLatestMv(limit: number = 30): Promise<any[]> {
    const response: any = httpFetch('https://music.163.com/api/mv/first', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        limit,
        area: 'ALL',
        type: 'ALL',
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取最新MV失败')
    }

    return body.data || []
  },

  /**
   * 获取推荐MV
   */
  async getRecommendMv(): Promise<any[]> {
    const response: any = httpFetch('https://music.163.com/api/personalized/mv', {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return body.result || []
  },
}
