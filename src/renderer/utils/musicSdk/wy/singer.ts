/**
 * 网易云音乐歌手模块
 * 支持：歌手信息、歌手热门歌曲、歌手专辑
 */

// @ts-ignore
import { httpFetch } from '../../request'
// @ts-ignore
import { weapi } from './utils/crypto'

// 歌手模块
export default {
  /**
   * 获取歌手信息
   * @param artistId 歌手ID
   */
  async getSingerInfo(artistId: string | number): Promise<any> {
    const response: any = httpFetch(`https://music.163.com/weapi/v1/artist/${artistId}`, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({}),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取歌手信息失败')
    }

    return {
      artist: {
        id: body.artist.id,
        name: body.artist.name,
        picUrl: body.artist.picUrl || body.artist.img1v1Url,
        alias: body.artist.alias || [],
        fansSize: body.artist.fansSize || 0,
        followed: body.artist.followed || false,
        briefDesc: body.artist.briefDesc || '',
        albumSize: body.artist.albumSize || 0,
        musicSize: body.artist.musicSize || 0,
        mvSize: body.artist.mvSize || 0,
      },
    }
  },

  /**
   * 获取歌手热门歌曲
   * @param artistId 歌手ID
   */
  async getSingerTopSong(artistId: string | number): Promise<any> {
    const response: any = httpFetch('https://music.163.com/weapi/artist/top/song', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        id: artistId,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取歌手热门歌曲失败')
    }

    return {
      songs: (body.songs || []).map((song: any) => ({
        id: song.id,
        name: song.name,
        ar: song.ar || [],
        al: {
          id: song.al?.id || 0,
          name: song.al?.name || '',
          picUrl: song.al?.picUrl || '',
        },
        dt: song.dt || 0,
        fee: song.fee || 0,
      })),
    }
  },

  /**
   * 获取歌手专辑列表
   * @param artistId 歌手ID
   * @param limit 每页数量
   * @param offset 偏移量
   */
  async getSingerAlbums(
    artistId: string | number,
    limit: number = 30,
    offset: number = 0
  ): Promise<any> {
    const response: any = httpFetch(`https://music.163.com/weapi/artist/albums/${artistId}`, {
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
      hotAlbums: (body.hotAlbums || []).map((album: any) => ({
        id: album.id,
        name: album.name,
        picUrl: album.picUrl,
        publishTime: album.publishTime,
        size: album.size,
      })),
      artist: {
        albumSize: body.artist?.albumSize || 0,
      },
    }
  },

  /**
   * 获取歌手描述
   * @param artistId 歌手ID
   */
  async getSingerDesc(artistId: string | number): Promise<any> {
    const response: any = httpFetch('https://music.163.com/weapi/artist/introduction', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        id: artistId,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('获取歌手描述失败')
    }

    return body
  },

  /**
   * 获取相似歌手
   * @param artistId 歌手ID
   */
  async getSimiArtist(artistId: string | number): Promise<any[]> {
    const response: any = httpFetch('https://music.163.com/weapi/discovery/simiArtist', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        artistid: artistId,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return []
    }

    return body.artists || []
  },

  /**
   * 歌手搜索
   * @param keyword 搜索关键词
   * @param page 页码
   * @param limit 每页数量
   */
  async searchSinger(
    keyword: string,
    page: number = 1,
    limit: number = 30
  ): Promise<{ singers: any[]; total: number }> {
    const response: any = httpFetch('https://music.163.com/api/search/get', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        s: keyword,
        type: 100, // 歌手类型
        limit,
        total: page === 1,
        offset: limit * (page - 1),
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      throw new Error('搜索歌手失败')
    }

    const result = body.result || {}

    return {
      singers: (result.artists || []).map((artist: any) => ({
        id: artist.id,
        name: artist.name,
        picUrl: artist.picUrl,
        alias: artist.alias || [],
        albumSize: artist.albumSize || 0,
        musicSize: artist.musicSize || 0,
        mvSize: artist.mvSize || 0,
      })),
      total: result.artistCount || 0,
    }
  },

  /**
   * 获取歌手mv列表
   * @param artistId 歌手ID
   * @param limit 每页数量
   * @param offset 偏移量
   */
  async getSingerMv(
    artistId: string | number,
    limit: number = 30,
    offset: number = 0
  ): Promise<{ mvs: any[]; total: number }> {
    const response: any = httpFetch(`https://music.163.com/weapi/artist/mvs`, {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: 'https://music.163.com',
        Referer: 'https://music.163.com/',
      },
      form: weapi({
        artistId,
        limit,
        offset,
        total: true,
      }),
    })

    const { body, statusCode } = await response.promise

    if (statusCode !== 200 || body.code !== 200) {
      return { mvs: [], total: 0 }
    }

    return {
      mvs: body.mvs || [],
      total: body.total || 0,
    }
  },
}
