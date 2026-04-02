import Dialog from './Dialog.vue'
import { createApp } from 'vue'

const defaultOptions = {
  message: '',
  teleport: '#root',
  showCancel: false,
  cancelButtonText: '',
  confirmButtonText: '',
  selection: false,
}

export const dialog = function (options) {
  const { message, showCancel, cancelButtonText, confirmButtonText, teleport, selection } =
    Object.assign(
      {},
      defaultOptions,
      typeof options == 'string' ? { message: options } : options || {}
    )
  return new Promise((resolve, reject) => {
    const container = document.createElement('div')
    let app = createApp(Dialog, {
      afterLeave() {
        // 延迟卸载，确保 DOM 已完全清理
        setTimeout(() => {
          app?.unmount()
          app = null
          if (container.parentNode) {
            container.parentNode.removeChild(container)
          }
        }, 0)
      },
    })

    let instance = app.mount(container)

    // 属性设置
    instance.visible = true
    instance.message = message
    instance.showCancel = showCancel
    instance.cancelButtonText = cancelButtonText
    instance.confirmButtonText = confirmButtonText
    instance.teleport = teleport
    instance.selection = selection

    // 挂载
    document.getElementById('container').appendChild(container)

    instance.handleCancel = () => {
      instance.visible = false
      resolve(false)
    }

    instance.handleComfirm = () => {
      instance.visible = false
      resolve(true)
    }
  })
}

dialog.confirm = (options) =>
  dialog(
    typeof options == 'string'
      ? { message: options, showCancel: true }
      : { ...options, showCancel: true }
  )

const dialogPlugin = {
  install(Vue, options) {
    Vue.config.globalProperties.$dialog = dialog
  },
}

export default dialogPlugin
