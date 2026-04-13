import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'

const WEBLOG_API = 'https://music.163.com/weapi/feedback/weblog'

export const sendWeblog = async (
  songId: string | number,
  sourceId: string | number | undefined,
  duration: number,
  cookie: string
): Promise<boolean> => {
  try {
    const logs = JSON.stringify([{
      action: 'play',
      json: {
        id: songId,
        download: 0,
        type: 'song',
        sourceId: String(sourceId ?? ''),
        time: Math.floor(duration),
        end: 'playend',
        wifi: 0,
      },
    }])

    const data = weapi({ logs })

    const response: any = httpFetch(WEBLOG_API, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
      },
      body: `params=${encodeURIComponent(data.params)}&encSecKey=${data.encSecKey}`,
    })

    const { statusCode } = await response.promise
    return statusCode === 200
  } catch (e) {
    console.error('[Weblog] Send failed:', e)
    return false
  }
}