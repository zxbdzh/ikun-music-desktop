import BaseHotSearch from '../base/BaseHotSearch'
import { eapiRequest } from './utils/index'

class WyHotSearch extends BaseHotSearch {
  constructor() {
    super('wy')
  }

  async fetchList() {
    this._requestObj = eapiRequest('/api/search/chart/detail', {
      id: 'HOT_SEARCH_SONG#@#',
    })
    const { body, statusCode } = await this._requestObj.promise
    if (statusCode != 200 || body.code !== 200) throw new Error('获取热搜词失败')
    return body.data.itemList
  }

  filterList(rawList) {
    return rawList.map((item) => item.searchWord)
  }
}

export default new WyHotSearch()
