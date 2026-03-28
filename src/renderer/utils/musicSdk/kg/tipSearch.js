import BaseTipSearch from '../base/BaseTipSearch'
import { createHttpFetch } from './util'

class KgTipSearch extends BaseTipSearch {
  fetchTips(str) {
    this.cancelTipSearch()
    this.requestObj = createHttpFetch(
      `https://searchtip.kugou.com/getSearchTip?MusicTipCount=10&keyword=${encodeURIComponent(str)}`,
      {
        headers: {
          referer: 'https://www.kugou.com/',
        },
      }
    )
    return this.requestObj.then((body) => body[0].RecordDatas)
  }

  handleResult(rawData) {
    return rawData.map((info) => info.HintInfo)
  }
}

export default new KgTipSearch()
