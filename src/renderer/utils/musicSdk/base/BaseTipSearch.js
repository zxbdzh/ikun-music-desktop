/**
 * 搜索提示基类 - 各音乐源的 tipSearch 模块继承此类
 *
 * 子类需要实现:
 * - fetchTips(str): 发起 HTTP 请求并返回原始提示数据
 * - handleResult(rawData): 将原始数据转换为提示列表
 */
export default class BaseTipSearch {
  constructor() {
    this.requestObj = null
  }

  cancelTipSearch() {
    if (this.requestObj && this.requestObj.cancelHttp) this.requestObj.cancelHttp()
  }

  // 子类必须实现: 发起搜索提示请求
  async fetchTips(_str) {
    throw new Error('fetchTips() must be implemented by subclass')
  }

  // 子类必须实现: 转换原始数据
  handleResult(_rawData) {
    throw new Error('handleResult() must be implemented by subclass')
  }

  async search(str) {
    return this.fetchTips(str).then((result) => this.handleResult(result))
  }
}
