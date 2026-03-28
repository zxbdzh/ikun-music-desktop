import pkg from '../../../package.json'
process.versions.app = pkg.version

export { proxy } from './proxy'
export { sync } from './syncState'
export { versionInfo } from './version'
export { userApi } from './userApiState'
export { windowSizeList, windowSizeActive, isFullscreen } from './window'
export { apiSource, sourceNames, getSourceI18nPrefix, qualityList, setQualityList } from './source'
export { openAPI } from './openAPI'
export { themeId, themeInfo, themeShouldUseDarkColors } from './themeState'
export { isShowPact, isShowChangeLog } from './ui'
