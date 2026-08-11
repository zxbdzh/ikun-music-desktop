import { init } from './db'
import { exposeWorker } from '../utils/worker'
import { list, lyric, music_url, music_other_source, download, dislike_list, podcast } from './modules/index'

const common = {
  init,
}

exposeWorker(
  Object.assign(common, list, lyric, music_url, music_other_source, download, dislike_list, podcast)
)

export type workerDBSeriveTypes = typeof common &
  typeof list &
  typeof lyric &
  typeof music_url &
  typeof music_other_source &
  typeof download &
  typeof dislike_list &
  typeof podcast
