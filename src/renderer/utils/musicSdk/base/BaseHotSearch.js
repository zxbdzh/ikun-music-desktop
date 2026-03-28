/**
 * 热搜基类 - 各音乐源的 hotSearch 模块继承此类
 *
 * 子类需要实现:
 * - source: 数据源标识 (如 'kg', 'kw', 'wy', 'mg')
 * - fetchList(): 发起 HTTP 请求并返回原始列表数据
 * - filterList(rawList): 将原始数据转换为字符串数组
 */
export default class BaseHotSearch {
  constructor(source) {
    this.source = source
    this._requestObj = null
  }

  async getList(retryNum = 0) {
    if (this._requestObj) this._requestObj.cancelHttp()
    if (retryNum > 2) return Promise.reject(new Error('try max num'))

    const rawList = await this.fetchList()
    return { source: this.source, list: this.filterList(rawList) }
  }

  // 子类必须实现: 发起请求并返回原始数据
  async fetchList() {
    throw new Error('fetchList() must be implemented by subclass')
  }

  // 子类必须实现: 过滤/转换原始数据为字符串数组
  filterList(_rawList) {
    throw new Error('filterList() must be implemented by subclass')
  }
}
