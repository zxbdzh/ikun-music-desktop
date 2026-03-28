import BaseTipSearch from '../base/BaseTipSearch'
import { httpFetch } from '../../request'

class KwTipSearch extends BaseTipSearch {
  fetchTips(str) {
    this.cancelTipSearch()
    this.requestObj = httpFetch(
      `https://tips.kuwo.cn/t.s?corp=kuwo&newver=3&p2p=1&notrace=0&c=mbox&w=${encodeURIComponent(str)}&encoding=utf8&rformat=json`,
      {
        Referer: 'http://www.kuwo.cn/',
      }
    )
    return this.requestObj.promise.then(({ body, statusCode }) => {
      if (statusCode != 200 || !body.WORDITEMS) return Promise.reject(new Error('请求失败'))
      return body.WORDITEMS
    })
  }

  handleResult(rawData) {
    return rawData.map((item) => item.RELWORD)
  }
}

export default new KwTipSearch()
