import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, cp, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { assertPublicHttpUrl } from './aurioClubClient'
import { formatPodcastNetworkError, podcastFetch } from './network'

export class PodcastStorage {
  async downloadEpisode(
    episode: LX.Podcast.Episode,
    target: 'download' | 'cache',
    signal?: AbortSignal
  ) {
    assertPublicHttpUrl(episode.audioUrl)
    const root = this.root(target)
    await mkdir(root, { recursive: true })
    const finalPath = this.episodePath(episode, target)
    if (await exists(finalPath)) return finalPath

    const partialPath = `${finalPath}.part`
    const downloaded = await fileSize(partialPath)
    const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : undefined
    let response
    try {
      response = await podcastFetch(episode.audioUrl, { headers, redirect: 'follow', signal })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new Error(`音频下载连接失败：${formatPodcastNetworkError(error)}`)
    }
    if (!response.ok || !response.body) throw new Error(`音频下载失败 (${response.status})`)
    const append = downloaded > 0 && response.status === 206
    if (!append && downloaded > 0) await unlink(partialPath).catch(() => undefined)
    await pipeline(
      Readable.fromWeb(response.body as any),
      createWriteStream(partialPath, { flags: append ? 'a' : 'w' }),
      { signal }
    )
    await rename(partialPath, finalPath)
    return finalPath
  }

  async downloadState(episode: LX.Podcast.Episode): Promise<LX.Podcast.DownloadState> {
    try {
      assertPublicHttpUrl(episode.audioUrl)
      return {
        episodeId: episode.id,
        isDownloaded: await exists(this.episodePath(episode, 'download')),
      }
    } catch {
      return { episodeId: episode.id, isDownloaded: false }
    }
  }

  async migrate(kind: 'download' | 'cache', targetPath: string) {
    const sourcePath = this.root(kind)
    const target = path.resolve(targetPath)
    if (!path.isAbsolute(target) || target === path.parse(target).root) {
      throw new Error('请选择具体的播客存储目录')
    }
    if (path.resolve(sourcePath) === target) return target
    await mkdir(target, { recursive: true })
    if (await exists(sourcePath)) {
      await cp(sourcePath, target, { recursive: true, force: false, errorOnExist: false })
      await verifyTree(sourcePath, target)
    }
    return target
  }

  private root(kind: 'download' | 'cache') {
    return global.lx.appSetting[kind === 'download' ? 'podcast.downloadPath' : 'podcast.cachePath']
  }

  private episodePath(episode: LX.Podcast.Episode, target: 'download' | 'cache') {
    const extension = path.extname(new URL(episode.audioUrl).pathname).slice(0, 8) || '.audio'
    return path.join(this.root(target), `${episode.id}${extension}`)
  }
}

const exists = async (value: string) => access(value).then(() => true).catch(() => false)
const fileSize = async (value: string) => stat(value).then((info) => info.size).catch(() => 0)

const verifyTree = async (source: string, target: string) => {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name)
    const targetEntry = path.join(target, entry.name)
    if (entry.isDirectory()) {
      await verifyTree(sourceEntry, targetEntry)
      continue
    }
    const [sourceDigest, targetDigest] = await Promise.all([digest(sourceEntry), digest(targetEntry)])
    if (sourceDigest !== targetDigest) throw new Error(`迁移校验失败：${entry.name}`)
  }
}

const digest = async (filePath: string) => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}
