import { reactive } from '@common/utils/vueTools'
import { type ProgressInfo } from 'electron-updater'
import pkg from '../../../package.json'

export const versionInfo = (window.lxData.versionInfo = reactive<{
  version: string
  newVersion: {
    version: string
    desc: string
    history?: LX.VersionInfo[]
  } | null
  showModal: boolean
  isUnknown: boolean
  isLatest: boolean
  reCheck: boolean
  status: LX.UpdateStatus
  downloadProgress: ProgressInfo | null
}>({
  version: pkg.version,
  newVersion: null,
  showModal: false,
  reCheck: false,
  isUnknown: false,
  isLatest: false,
  status: 'checking',
  downloadProgress: null,
}))
