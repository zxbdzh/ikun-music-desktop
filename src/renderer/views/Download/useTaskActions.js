import { useRouter } from '@common/utils/vueRouter'
import musicSdk from '@renderer/utils/musicSdk'
import { openUrl, clipboardWriteText } from '@common/utils/electron'
import { checkPath } from '@common/utils/nodejs'
import { toOldMusicInfo } from '@renderer/utils/index'
import {
  startDownloadTasks,
  pauseDownloadTasks,
  removeDownloadTasks,
} from '@renderer/store/download/action'
import { openDirInExplorer } from '@renderer/utils/ipc'
import { openShareMusicCard } from '@renderer/store/shareMusicCard'

export default ({ list, selectedList, removeAllSelect }) => {
  const router = useRouter()

  const handleSearch = (index) => {
    const info = list.value[index].metadata.musicInfo
    router.push({
      path: '/search',
      query: {
        text: `${info.name} ${info.singer}`,
      },
    })
  }

  const handleOpenMusicDetail = (index) => {
    const task = list.value[index]
    const mInfo = toOldMusicInfo(task.metadata.musicInfo)
    const url = musicSdk[mInfo.source]?.getMusicDetailPageUrl?.(mInfo)
    if (!url) return
    openUrl(url)
  }

  const handleCopyMusicLink = (index) => {
    const task = list.value[index]
    const mInfo = toOldMusicInfo(task.metadata.musicInfo)
    const url = musicSdk[mInfo.source]?.getMusicDetailPageUrl?.(mInfo)
    if (!url) return
    clipboardWriteText(`${mInfo.name} (${mInfo.singer}) ${url}`)
  }

  const handleShareCard = (index) => {
    const task = list.value[index]
    const mInfo = task?.metadata?.musicInfo
    if (!mInfo) return
    openShareMusicCard(mInfo)
  }

  const handleStartTask = async (index, single) => {
    if (selectedList.value.length && !single) {
      startDownloadTasks([...selectedList.value])
      removeAllSelect()
    } else {
      startDownloadTasks([list.value[index]])
    }
  }

  const handlePauseTask = async (index, single) => {
    if (selectedList.value.length && !single) {
      pauseDownloadTasks([...selectedList.value])
      removeAllSelect()
    } else {
      pauseDownloadTasks([list.value[index]])
    }
  }

  const handleRemoveTask = async (index, single) => {
    if (selectedList.value.length && !single) {
      removeDownloadTasks(selectedList.value.map((m) => m.id))
      removeAllSelect()
    } else {
      removeDownloadTasks([list.value[index].id])
    }
  }

  const handleOpenFile = async (index) => {
    const task = list.value[index]
    if (!checkPath(task.metadata.filePath)) return
    openDirInExplorer(task.metadata.filePath)
  }

  return {
    handleSearch,
    handleOpenMusicDetail,
    handleCopyMusicLink,
    handleShareCard,
    handleStartTask,
    handlePauseTask,
    handleRemoveTask,
    handleOpenFile,
  }
}
