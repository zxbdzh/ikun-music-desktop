import { reactive } from '@common/utils/vueTools'

export const userApi = reactive<{
  list: LX.UserApi.UserApiInfo[]
  status: boolean
  message?: string
  apis: Partial<LX.UserApi.UserApiSources>
}>({
  list: [],
  status: false,
  message: 'initing',
  apis: {},
})
