import BaseTipSearch from '../base/BaseTipSearch'
import { createHttpFetch } from './utils'

class MgTipSearch extends BaseTipSearch {
  fetchTips(str) {
    this.cancelTipSearch()
    this.requestObj = createHttpFetch(
      `https://music.migu.cn/v3/api/search/suggest?keyword=${encodeURIComponent(str)}`,
      {
        headers: {
          referer: 'https://music.migu.cn/v3',
        },
      }
    )
    return this.requestObj.then((body) => body.songs)
  }

  handleResult(rawData) {
    return rawData.map((info) => `${info.name} - ${info.singerName}`)
  }
}

export default new MgTipSearch()
