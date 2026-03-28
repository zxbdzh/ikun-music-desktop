import { reactive } from '@common/utils/vueTools'

export const sync: {
  enable: boolean
  mode: LX.AppSetting['sync.mode']
  isShowSyncMode: boolean
  isShowAuthCodeModal: boolean
  deviceName: string
  type: keyof LX.Sync.ModeTypes
  server: {
    port: string
    status: {
      status: boolean
      message: string
      address: string[]
      code: string
      devices: LX.Sync.ServerKeyInfo[]
    }
  }
  client: {
    host: string
    status: {
      status: boolean
      message: string
      address: string[]
    }
  }
} = reactive({
  enable: false,
  mode: 'server',
  isShowSyncMode: false,
  isShowAuthCodeModal: false,
  deviceName: '',
  type: 'list',
  server: {
    port: '',
    status: {
      status: false,
      message: '',
      address: [],
      code: '',
      devices: [],
    },
  },
  client: {
    host: '',
    status: {
      status: false,
      message: '',
      address: [],
    },
  },
})
