import { httpFetch } from '../../request'

// 哔哩哔哩搜索：视频 → 歌曲。桌面端 httpFetch(needle) 不支持 params，需手动拼接 query。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
const headers: Record<string, string> = {
  'user-agent': UA,
  accept: '*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
}

const searchHeaders: Record<string, string> = {
  'user-agent': UA,
  accept: 'application/json, text/plain, */*',
  origin: 'https://search.bilibili.com',
  'sec-fetch-site': 'same-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
  referer: 'https://search.bilibili.com/',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
}

// 多P拆分开关：暂固定开启（后续可接设置项 common.bilibili_multi_page）
const ENABLE_MULTI_PAGE = true

const buildUrl = (base: string, params: Record<string, any>): string => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${base}?${qs}` : base
}

const parseBody = (body: any): any => (typeof body === 'string' ? JSON.parse(body) : body)

// B 站封面统一升级为 https,避免混合内容被拦;防盗链 referer 由主进程注入
const normalizePicUrl = (pic?: string): string => {
  if (!pic) return ''
  if (pic.startsWith('//')) return `https:${pic}`
  return pic.replace(/^http:\/\//, 'https://')
}

let cookie: { b_3?: string; b_4?: string } | null = null
async function getCookie(): Promise<{ b_3?: string; b_4?: string }> {
  if (!cookie) {
    try {
      const requestObj = httpFetch('https://api.bilibili.com/x/frontend/finger/spi', {
        headers: { 'User-Agent': UA },
      })
      const { body } = await requestObj.promise
      cookie = parseBody(body)?.data ?? { b_3: '', b_4: '' }
    } catch (error) {
      cookie = { b_3: '', b_4: '' }
    }
  }
  return cookie!
}

function getCookieString(): string {
  if (!cookie) return ''
  return `buvid3=${cookie.b_3};buvid4=${cookie.b_4}`
}

function durationToSec(duration: any): number {
  if (typeof duration === 'number') return duration
  if (typeof duration === 'string') {
    return duration.split(':').reduce((prev: number, curr: string) => 60 * prev + +curr, 0)
  }
  return 0
}

function formatPlayTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function generateSongId(bvid: string, aid: string | number): string {
  const hash = bvid ? bvid : aid
  return `bilibili_${hash}`
}

function generateAlbumId(album: string | number): string {
  if (!album) return ''
  return `album_bilibili_${album}`
}

function decodeHtmlEntities(str: string): string {
  if (!str) return str
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
  }
  return str.replace(/&[#\w]+;/g, (match) => entities[match] || match)
}

function formatMedia(result: any): any {
  const title = decodeHtmlEntities(result.title?.replace(/(<em(.*?)>)|(<\/em>)/g, '') || '')
  return {
    id: result.cid ?? result.bvid ?? result.aid,
    aid: result.aid,
    bvid: result.bvid,
    cid: result.cid,
    artist: result.author ?? result.owner?.name,
    title,
    album: result.bvid ?? result.aid,
    pic: normalizePicUrl(result.pic),
    duration: durationToSec(result.duration),
    tags: result.tag?.split(','),
    play: result.play,
    view: result.view,
    like: result.like,
    pubdate: result.pubdate,
  }
}

async function getVideoDetail(bvid: string, aid: string | number): Promise<any> {
  const url = buildUrl('https://api.bilibili.com/x/web-interface/view', bvid ? { bvid } : { aid })
  try {
    const requestObj = httpFetch(url, { headers })
    const { body } = await requestObj.promise
    return parseBody(body)
  } catch (err) {
    return null
  }
}

const musicSearchModule = {
  limit: 30,
  total: 0,
  page: 0,
  allPage: 1,

  async handleResult(
    searchResults: any[],
    page: number,
    limit: number,
    total = 0,
    numPages = 0
  ): Promise<any[]> {
    const sortedResults = [...searchResults]

    this.total = total || sortedResults.length
    this.allPage = numPages || Math.ceil(this.total / limit)
    this.page = page

    const enableMultiPage = ENABLE_MULTI_PAGE

    // 并行获取所有视频详情，提高搜索速度
    const videoDetails = await Promise.all(
      sortedResults.map((item) => {
        const bvid = item.bvid
        const aid = item.aid
        if (bvid || aid) return getVideoDetail(bvid, aid).catch(() => null)
        return Promise.resolve(null)
      })
    )

    const list: any[] = []
    for (let i = 0; i < sortedResults.length; i++) {
      const item = sortedResults[i]
      const videoDetail = videoDetails[i]

      const bvid = item.bvid
      const aid = item.aid
      const pages = videoDetail?.data?.pages

      const firstPageDuration = pages?.[0]?.duration || videoDetail?.data?.duration || item.duration
      const firstPageCid = videoDetail?.data?.cid || pages?.[0]?.cid || item.cid

      const isMultiPage = enableMultiPage && pages && Array.isArray(pages) && pages.length > 1

      if (isMultiPage) {
        let partIndex = 1
        for (const bpage of pages) {
          list.push({
            name: (bpage.part || `P${partIndex}`) + ' - ' + item.title,
            singer: item.artist || '未知歌手',
            source: 'bilibili',
            songmid: generateSongId(bvid, aid) + '_' + bpage.cid,
            albumId: generateAlbumId(item.bvid || item.aid),
            interval: formatPlayTime(bpage.duration || 0),
            albumName: item.album || '未知专辑',
            lrc: null,
            img: item.pic,
            otherSource: null,
            types: [{ type: '192k', size: 'UNKNOWN' }],
            _types: { '192k': { size: 'UNKNOWN' } },
            typeUrl: {},
            _bilibiliData: {
              bvid: item.bvid,
              aid: item.aid,
              cid: bpage.cid,
            },
          })
          partIndex++
        }
      } else {
        list.push({
          name: item.title || '未知歌曲',
          singer: item.artist || '未知歌手',
          source: 'bilibili',
          songmid: generateSongId(item.bvid, item.aid),
          albumId: generateAlbumId(item.bvid || item.aid),
          interval: formatPlayTime(firstPageDuration || 0),
          albumName: item.album || '未知专辑',
          lrc: null,
          img: item.pic,
          otherSource: null,
          types: [{ type: '192k', size: 'UNKNOWN' }],
          _types: { '192k': { size: 'UNKNOWN' } },
          typeUrl: {},
          _bilibiliData: {
            bvid: item.bvid,
            aid: item.aid,
            cid: firstPageCid,
          },
        })
      }
    }

    return list
  },

  async search(keyword: string, page = 1, limit?: number, retryNum = 0): Promise<any> {
    if (retryNum > 2) return Promise.reject(new Error('搜索失败，请稍后重试'))
    if (limit == null) limit = this.limit

    const emptyResult = { list: [], allPage: 0, total: 0, limit, source: 'bilibili' }

    try {
      await getCookie()

      const url = buildUrl('https://api.bilibili.com/x/web-interface/search/type', {
        context: '',
        page,
        order: '',
        page_size: limit,
        keyword,
        duration: '',
        tids_1: '',
        tids_2: '',
        __refresh__: true,
        _extra: '',
        highlight: 1,
        single_column: 0,
        platform: 'pc',
        from_source: '',
        search_type: 'video',
        dynamic_offset: 0,
      })

      const requestObj = httpFetch(url, {
        headers: { ...searchHeaders, cookie: getCookieString() },
      })
      const response = await requestObj.promise
      const data = parseBody(response.body)

      if (data?.code !== 0 && data?.code !== undefined) return Promise.resolve(emptyResult)
      if (!data?.data?.result) return Promise.resolve(emptyResult)

      const searchResults = data.data.result.map(formatMedia)
      const list = await this.handleResult(
        searchResults,
        page,
        limit,
        data.data.numResults,
        data.data.numPages
      )

      return Promise.resolve({
        list,
        allPage: this.allPage,
        total: this.total,
        limit,
        source: 'bilibili',
      })
    } catch (error: any) {
      const msg = error?.message ?? ''
      if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('Network')) {
        return this.search(keyword, page, limit, retryNum + 1)
      }
      return Promise.resolve(emptyResult)
    }
  },
}

export default musicSearchModule
