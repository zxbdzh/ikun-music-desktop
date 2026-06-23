import { registerWinMainBeforeSendHeaders } from '../winMainSession'

// B 站音频 CDN(bilivideo.com)与封面图 CDN(hdslb.com)均校验 referer,否则 403。
// audio/img 标签默认带 Electron 自身 UA、无 referer,故在主进程为这些请求注入防盗链头。
const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63'

// 大小写不敏感地覆盖请求头,避免与已存在的同名头(大小写不同)重复
const setHeader = (headers: Record<string, string>, name: string, value: string) => {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key]
  }
  headers[name] = value
}

const isBilibiliCdn = (url: string): boolean => {
  try {
    const host = new URL(url).hostname
    return host.includes('bilivideo.com') || host.includes('hdslb.com')
  } catch {
    return false
  }
}

export default () => {
  registerWinMainBeforeSendHeaders((details) => {
    if (!isBilibiliCdn(details.url)) return
    setHeader(details.requestHeaders, 'Referer', 'https://www.bilibili.com')
    setHeader(details.requestHeaders, 'User-Agent', BILI_UA)
  })
}
