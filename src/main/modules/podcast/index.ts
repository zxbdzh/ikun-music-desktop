import { app } from 'electron'
import { mainHandle } from '@common/mainIpc'
import { PODCAST_EVENT_NAME } from '@common/ipcNames'
import { PodcastModule } from './module'

export const podcastModule = new PodcastModule()

export default () => {
  mainHandle<LX.Podcast.Command, unknown>(PODCAST_EVENT_NAME.action, async ({ params }) => {
    return podcastModule.execute(params)
  })
  app.once('before-quit', () => podcastModule.shutdown())
  void podcastModule.init()
}
