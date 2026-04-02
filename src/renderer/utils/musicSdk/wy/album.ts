/**
 * 网易云音乐专辑模块
 * 支持：专辑详情获取、专辑搜索
 */

// @ts-ignore
import { httpFetch } from '../../request'
// @ts-ignore
import { weapi } from './utils/crypto'

// 专辑歌曲信息接口
export interface AlbumSong {
  id: number
  name: string
  ar: Array<{ id: number; name: string }>
  al: { id: number; name: string; picUrl: string }
  dt: number // 时长(毫秒)
  fee: number // 0=免费, 1=VIP, 4=需购买, 8=VIP专享
}

// 专辑详情接口
export interface AlbumDetail {
  album: {
    id: number
    name: string
    artist: {
      id: number
      name: string
      picUrl: string
    }
    publishTime: number
    size: number
    description: string
    picUrl: string
  }
  songs: AlbumSong[]
}

// 专辑搜索结果接口
export interface AlbumSearchResult {
  albums: Array<{
    id: number
    name: string
    artist: {
      id: number
      name: string
    }
    publishTime: number
    size: number
    picUrl: string
  }>
  total: number
}

// 专辑模块
export default {
  /**
   * 获取专辑内容
   * @param albumId 专辑ID
   */
  async getAlbumDetail(albumId: string | number): Promise<AlbumDetail> {
    const response: any = httpFetch(`https://music.163.com/api/album/${albumId}`, {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取专辑详情失败')
    }

    return {
      album: {
        id: body.album.id,
        name: body.album.name,
        artist: {
          id: body.album.artist?.id || 0,
          name: body.album.artist?.name || '',
          picUrl: body.album.artist?.picUrl || '',
        },
        publishTime: body.album.publishTime,
        size: body.album.size,
        description: body.album.description || '',
        picUrl: body.album.picUrl,
      },
      songs: (body.songs || []).map((song: any) => ({
        id: song.id,
        name: song.name,
        ar: song.ar || [],
        al: {
          id: song.al?.id || albumId,
          name: song.al?.name || body.album.name,
          picUrl: song.al?.picUrl || body.album.picUrl,
        },
        dt: song.dt || 0,
        fee: song.fee || 0,
      })),
    }
  },

  /**
   * 获取专辑动态信息（收藏数、评论数等）
   * @param albumId 专辑ID
   */
  async getAlbumDetailDynamic(albumId: string | number): Promise<any> {
    const response: any = httpFetch('https://music.163.com/api/album/detail/dynamic', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({ id: albumId }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取专辑动态信息失败')
    }

    return {
      collectCount: body.collectCount || 0,
      shareCount: body.shareCount || 0,
      commentCount: body.commentCount || 0,
      subcribed: body.subcribed || false,
      isSub: body.isSub || false,
    }
  },

  /**
   * 专辑搜索
   * @param keyword 搜索关键词
   * @param page 页码
   * @param limit 每页数量
   */
  async searchAlbum(
    keyword: string,
    page: number = 1,
    limit: number = 30
  ): Promise<AlbumSearchResult> {
    const response: any = httpFetch('https://music.163.com/api/search/get', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        s: keyword,
        type: 10, // 专辑类型
        limit,
        total: page === 1,
        offset: limit * (page - 1),
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('搜索专辑失败')
    }

    const result = body.result || {}

    return {
      albums: (result.albums || []).map((album: any) => ({
        id: album.id,
        name: album.name,
        artist: {
          id: album.artist?.id || 0,
          name: album.artist?.name || '',
        },
        publishTime: album.publishTime,
        size: album.size,
        picUrl: album.picUrl,
      })),
      total: result.albumCount || 0,
    }
  },

  /**
   * 获取专辑评论
   * @param albumId 专辑ID
   * @param page 页码
   * @param limit 每页数量
   */
  async getAlbumComment(
    albumId: string | number,
    page: number = 1,
    limit: number = 20
  ): Promise<{ comments: any[]; total: number; hotComments: any[] }> {
    const id = 'R_AL_3_' + albumId

    const response: any = httpFetch('https://music.163.com/weapi/v1/resource/comments/R_AL_3_' + albumId, {
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
      throw new Error('获取专辑评论失败')
    }

    return {
      comments: body.comments || [],
      hotComments: body.hotComments || [],
      total: body.total || 0,
    }
  },

  /**
   * 获取歌手专辑列表
   * @param artistId 歌手ID
   * @param limit 每页数量
   * @param offset 偏移量
   */
  async getArtistAlbums(
    artistId: string | number,
    limit: number = 30,
    offset: number = 0
  ): Promise<{ albums: any[]; total: number }> {
    const response: any = httpFetch('https://music.163.com/weapi/artist/albums/' + artistId, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        limit,
        offset,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取歌手专辑列表失败')
    }

    return {
      albums: body.hotAlbums || [],
      total: body.artist?.albumSize || 0,
    }
  },
}
