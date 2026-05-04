/**
 * 花再音响模块入口
 */

import rendererEvent from './rendererEvent'

export default () => {
  // 注册 IPC 事件
  rendererEvent()

  console.log('[HaloPixel] Module registered')
}
