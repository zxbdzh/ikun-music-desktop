import BaseHotSearch from '../base/BaseHotSearch'
import { httpFetch } from '../../request'

class MgHotSearch extends BaseHotSearch {
  constructor() {
    super('mg')
  }

  async fetchList() {
    this._requestObj = httpFetch('http://jadeite.migu.cn:7090/music_search/v3/search/hotword')
    const { body, statusCode } = await this._requestObj.promise
    if (statusCode != 200 || body.code !== '000000') throw new Error('获取热搜词失败')
    return body.data.hotwords[0].hotwordList
  }

  filterList(rawList) {
    return rawList.filter((item) => item.resourceType == 'song').map((item) => item.word)
  }
}

export default new MgHotSearch()
