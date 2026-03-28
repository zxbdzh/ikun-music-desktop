import { ref, shallowRef, computed } from '@common/utils/vueTools'
import { appSetting } from './setting'
import music from '@renderer/utils/musicSdk'

export const apiSource = ref<string | null>(null)

export const getSourceI18nPrefix = () => {
  return appSetting['common.sourceNameType'] == 'real' ? 'source_' : 'source_alias_'
}

export const sourceNames = computed(() => {
  const prefix = getSourceI18nPrefix()
  const sourceNames: Record<LX.OnlineSource | 'all', string> = {
    kw: 'kw',
    tx: 'tx',
    kg: 'kg',
    mg: 'mg',
    wy: 'wy',
    git: 'git',
    all: window.i18n.t((prefix + 'all') as any),
  }
  for (const { id } of music.sources) {
    sourceNames[id as LX.OnlineSource] = window.i18n.t((prefix + id) as any)
  }

  return sourceNames
})

export const qualityList = shallowRef<LX.QualityList>({})
export const setQualityList = (_qualityList: LX.QualityList) => {
  qualityList.value = _qualityList
}
