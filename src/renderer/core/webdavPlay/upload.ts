import fs from 'fs'
import os from 'os'
import path from 'path'
import { getMusicUrl, getPicPath, getLyricInfo } from '@renderer/core/music'
import { getListMusics } from '@renderer/store/list/action'
import { appSetting } from '@renderer/store/setting'
import { filterFileName } from '@common/utils/common'
import { ensureWebDAVDirectory, getWebDAVJsonFile, getWebDAVPlayConfig, uploadWebDAVFile, uploadWebDAVFileFromPath, webdavExists } from './client'
import { embedMeta } from './embedMeta'

const joinPath = (dir: string, name: string) => `${dir.replace(/\/+$/, '')}/${name}`

const losslessRxp = /flac|hires|master|atmos/i
const resolveExt = (musicInfo: LX.Music.MusicInfo, quality: LX.Quality): string => {
  if (musicInfo.source === 'local') return (musicInfo.meta as LX.Music.MusicInfoMeta_local).ext || 'mp3'
  return losslessRxp.test(quality) ? 'flac' : 'mp3'
}

// 取音频字节:http(s) 走 fetch;本地源(getMusicUrl 返回 encodeURI 后的文件路径)直接读盘
const fetchAudioBuffer = async (url: string): Promise<Buffer> => {
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  return fs.promises.readFile(decodeURI(url))
}

interface UploadResult {
  uploaded: number
  skipped: number
  failed: number
  folderPath: string
}

interface DownloadParams {
  listId: string
  playlistName: string
  quality?: LX.Quality
  onProgress?: (done: number, total: number, current: string) => void
}

// 转存互斥锁:全局一次只允许转存一个歌单,避免重复点击导致并发下载/上传
let transferring = false
export const isWebDAVTransferring = (): boolean => transferring

/**
 * 把一个本地歌单下载并转存为 WebDAV 歌单(带互斥锁)。
 * 逐首解析直链 → 拉流到临时文件 → 内嵌封面/歌词(mp3/flac)→ 上传音频 + .lrc → 写 lx_playlist.json。
 * manifest 仅存业务元数据(相对文件名),不含凭证/绝对 URL。
 */
export const downloadListToWebDAV = async (params: DownloadParams): Promise<UploadResult> => {
  if (transferring) throw new Error('TRANSFER_IN_PROGRESS')
  transferring = true
  try {
    return await runDownloadListToWebDAV(params)
  } finally {
    transferring = false
  }
}

const runDownloadListToWebDAV = async ({
  listId,
  playlistName,
  quality,
  onProgress,
}: DownloadParams): Promise<UploadResult> => {
  const config = await getWebDAVPlayConfig()
  const root = config.selectedFolder
  if (!root) throw new Error('请先在 WebDAV 页选择一个目录')

  const songs = await getListMusics(listId)
  if (!songs.length) throw new Error('歌单为空')

  const targetQuality = quality ?? appSetting['player.playQuality']
  const folderName = filterFileName(playlistName)
  const folderPath = joinPath(root.path, folderName)
  await ensureWebDAVDirectory(folderPath)

  // 读现有 manifest,按 songId 建索引,用于跳过已存在歌曲
  const existingManifest = await getWebDAVJsonFile<LX.WebDAVPlay.PlaylistManifest>(
    joinPath(folderPath, 'lx_playlist.json')
  )
  const existingBySongId = new Map<string, LX.WebDAVPlay.PlaylistManifestSong>()
  if (existingManifest?.songs?.length) {
    for (const s of existingManifest.songs) {
      if (s.songId) existingBySongId.set(s.songId, s)
    }
  }

  const manifestSongs: LX.WebDAVPlay.PlaylistManifestSong[] = []
  let uploaded = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < songs.length; i++) {
    const musicInfo = songs[i]
    onProgress?.(i, songs.length, musicInfo.name)

    // 稳妥跳过:songId 已在现有 manifest 且服务器上文件仍在,则复用旧条目不重传
    const songId = String(musicInfo.meta.songId ?? musicInfo.id)
    const existing = existingBySongId.get(songId)
    if (existing) {
      const fileOnServer = await webdavExists(joinPath(folderPath, existing.fileName)).catch(
        () => false
      )
      if (fileOnServer) {
        manifestSongs.push(existing)
        skipped++
        continue
      }
    }

    const ext = resolveExt(musicInfo, targetQuality)
    const baseName = filterFileName(
      musicInfo.singer ? `${musicInfo.name} - ${musicInfo.singer}` : musicInfo.name
    )
    const audioFileName = `${baseName}.${ext}`
    const tmpAudio = path.join(os.tmpdir(), `webdav_up_${Date.now()}_${i}.${ext}`)
    let picUrlForManifest = ''

    try {
      // 1. 解析直链 + 拉流到临时文件
      const url = await getMusicUrl({ musicInfo, quality: targetQuality, isRefresh: true })
      if (!url) throw new Error('未取到播放地址')
      const audioBuf = await fetchAudioBuffer(url)
      await fs.promises.writeFile(tmpAudio, audioBuf)

      // 2. 取封面 / 歌词
      try {
        picUrlForManifest = (await getPicPath({ musicInfo, isRefresh: false })) || ''
      } catch {}
      let lrcContent = ''
      try {
        const lyricInfo = await getLyricInfo({ musicInfo, isRefresh: false })
        lrcContent = lyricInfo.lyric || ''
      } catch {}

      // 3. 内嵌标签 + 封面 + 歌词(仅 mp3/flac;其他格式跳过)
      try {
        await embedMeta(tmpAudio, {
          title: musicInfo.name,
          artist: musicInfo.singer?.replaceAll('、', ';') ?? '',
          album: musicInfo.meta.albumName ?? '',
          picUrl: picUrlForManifest || undefined,
          lrcText: lrcContent,
        })
      } catch (e) {
        console.warn(`[webdav upload] 内嵌标签失败: ${musicInfo.name}`, e)
      }

      // 4. 流式上传音频(直接从文件路径 PUT,避免整文件读入内存导致 OOM)+ 旁车 .lrc
      await uploadWebDAVFileFromPath(joinPath(folderPath, audioFileName), tmpAudio)
      if (lrcContent) {
        await uploadWebDAVFile(joinPath(folderPath, `${baseName}.lrc`), lrcContent)
      }

      manifestSongs.push({
        fileName: audioFileName,
        name: musicInfo.name,
        singer: musicInfo.singer,
        albumName: musicInfo.meta.albumName ?? '',
        interval: musicInfo.interval ?? null,
        source: musicInfo.source,
        songId,
        ext,
        picUrl: picUrlForManifest || undefined,
      })
      uploaded++
    } catch (e: any) {
      failed++
      console.error(`[webdav upload] 上传失败 ${musicInfo.name}: ${e?.message ?? e}`)
    } finally {
      void fs.promises.unlink(tmpAudio).catch(() => {})
    }
  }

  // 5. 写 manifest
  const now = Date.now()
  const manifest: LX.WebDAVPlay.PlaylistManifest = {
    version: 1,
    name: playlistName,
    createTime: now,
    updateTime: now,
    songs: manifestSongs,
  }
  await uploadWebDAVFile(joinPath(folderPath, 'lx_playlist.json'), JSON.stringify(manifest, null, 2))

  onProgress?.(songs.length, songs.length, '')
  return { uploaded, skipped, failed, folderPath }
}
