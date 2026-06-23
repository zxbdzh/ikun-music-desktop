import { httpFetch } from '../../request'
import musicSearch from './musicSearch'

// 哔哩哔哩音源：把视频当歌曲，取 DASH 音频流并附带防盗链 headers。
// 桌面端 httpFetch(needle) 不支持 params，需手动拼接 query。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36'
const headers: Record<string, string> = {
  'user-agent': UA,
  accept: '*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
}

const buildUrl = (base: string, params: Record<string, any>): string => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${base}?${qs}` : base
}

const parseBody = (body: any): any => (typeof body === 'string' ? JSON.parse(body) : body)

async function getCid(bvid: string, aid: string | number): Promise<any> {
  const url = buildUrl('https://api.bilibili.com/x/web-interface/view', bvid ? { bvid } : { aid })
  const requestObj = httpFetch(url, { headers })
  const { body } = await requestObj.promise
  return parseBody(body)
}

async function getBilibiliMusicUrl(musicInfo: any, type: string): Promise<{ url: string; headers: Record<string, string> }> {
  const bilibiliData = musicInfo?._bilibiliData
  let bvid = musicInfo?.bvid || bilibiliData?.bvid
  let aid = musicInfo?.aid || bilibiliData?.aid
  let cid = bilibiliData?.cid

  // 兜底：从 songmid（bilibili_<bvid>）反解
  if (!bvid && !aid) {
    const songmid = musicInfo?.songmid || musicInfo?.id
    if (songmid) {
      const match = String(songmid).match(/^bilibili[_]?(.*)$/)
      if (match) {
        const id = match[1].split('_')[0]
        if (id.startsWith('BV')) bvid = id
        else aid = id
      }
    }
  }

  let cidRes: any = null
  if (!cid) {
    cidRes = await getCid(bvid, aid)
    cid = cidRes?.data?.cid
  }
  if (!cidRes) {
    try {
      cidRes = await getCid(bvid, aid)
    } catch (_) {}
  }

  // 多P视频修正当前 P 时长
  const pages = cidRes?.data?.pages
  if (pages && Array.isArray(pages) && pages.length > 1) {
    const currentPage = pages.find((p: any) => p.cid === cid)
    if (currentPage && musicInfo && currentPage.duration) musicInfo.interval = currentPage.duration
  }

  const playUrl = buildUrl('https://api.bilibili.com/x/player/playurl', {
    ...(bvid ? { bvid } : { aid }),
    cid,
    fnval: 16,
  })

  const requestObj = httpFetch(playUrl, { headers })
  const response = await requestObj.promise
  const data = parseBody(response.body)

  if (!data) throw new Error('响应数据为空')
  if (data.code !== undefined && data.code !== 0) {
    throw new Error('API错误: ' + (data.message || '未知错误'))
  }
  if (!data.data) throw new Error('无数据返回')

  let url = ''
  if (Array.isArray(data.data?.dash?.audio) && data.data.dash.audio.length > 0) {
    const audios = [...data.data.dash.audio]
    audios.sort((a: any, b: any) => a.bandwidth - b.bandwidth)
    const len = audios.length

    // 优先 mcdn 域名，否则取第一个可用
    const findBestUrl = (audioList: any[]): string | null => {
      for (const audio of audioList) {
        const candidateUrl = audio?.baseUrl || audio?.base_url
        if (candidateUrl && candidateUrl.includes('mcdn.bilivideo')) return candidateUrl
      }
      for (const audio of audioList) {
        const candidateUrl = audio?.baseUrl || audio?.base_url
        if (candidateUrl) return candidateUrl
      }
      return null
    }

    // 哔哩哔哩音质 ID: 30216=64K, 30232=132K, 30280=192K
    let selectedAudios: any[] = []
    switch (type) {
      case '64k':
        selectedAudios = audios.filter((a: any) => a.id === 30216)
        if (selectedAudios.length === 0) selectedAudios = [audios[0]]
        break
      case '132k':
        selectedAudios = audios.filter((a: any) => a.id === 30232)
        if (selectedAudios.length === 0) selectedAudios = [audios[Math.min(1, len - 1)]]
        break
      case '192k':
        selectedAudios = audios.filter((a: any) => a.id === 30280)
        if (selectedAudios.length === 0) selectedAudios = [audios[len - 1]]
        break
      default:
        selectedAudios = [audios[len - 1]]
    }

    url = findBestUrl(selectedAudios) || findBestUrl(audios) || ''
  } else if (Array.isArray(data.data?.durl) && data.data.durl.length > 0) {
    url = data.data.durl[0].url
  }

  if (!url) throw new Error('无法获取音频链接')

  const _headers: Record<string, string> = {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63',
    accept: '*/*',
    referer: `https://www.bilibili.com/video/${bvid || bilibiliData?.bvid || aid || bilibiliData?.aid || ''}`,
  }

  return { url, headers: _headers }
}

const bilibili = {
  musicSearch,

  // 安全的 songList 占位实现，防止 UI 调用报错
  songList: {
    sortList: [],
    getTags() {
      return Promise.resolve({ tags: [], hotTag: [] })
    },
    getList() {
      return Promise.resolve({ list: [], total: 0, page: 1, limit: 30, maxPage: 0, key: null })
    },
    getListDetail() {
      return Promise.resolve({
        list: [],
        total: 0,
        page: 1,
        limit: 30,
        maxPage: 0,
        key: null,
        info: {},
      })
    },
    search() {
      return Promise.resolve({ list: [], total: 0, limit: 30, source: 'bilibili' })
    },
  },

  getMusicUrl(songInfo: any, type: string): any {
    // 哔哩哔哩音源固定使用 192K 音质
    const bilibiliType = '192k'
    const requestObj: any = {}
    requestObj.promise = getBilibiliMusicUrl(songInfo, bilibiliType).then((result) => {
      // 透传 headers 供下载使用；主进程会为播放请求注入防盗链头
      return { url: result?.url, headers: result?.headers, type }
    })
    return requestObj
  },

  getPic(songInfo: any): any {
    const requestObj: any = {}
    requestObj.promise = Promise.resolve(songInfo?.img || '')
    return requestObj
  },

  getLyric(songInfo: any): any {
    const requestObj: any = {}
    requestObj.promise = Promise.resolve({ lyric: '[00:00.00] 哔哩哔哩 (゜-゜)つロ 干杯~' })
    return requestObj
  },

  getMusicDetailPageUrl(songInfo: any): string {
    const bvid = songInfo?.bvid || songInfo?._bilibiliData?.bvid || ''
    if (bvid) return `https://www.bilibili.com/video/${bvid}`
    const aid = songInfo?.aid || songInfo?._bilibiliData?.aid || ''
    if (aid) return `https://www.bilibili.com/video/av${aid}`
    return ''
  },
}

export default bilibili
