import { ref } from '@common/utils/vueTools'

export const themeId = ref('green')
export const themeInfo: LX.ThemeInfo = {
  themes: [],
  userThemes: [],
  dataPath: '',
}
export const themeShouldUseDarkColors = ref(window.shouldUseDarkColors)
