import type { FileStat } from 'webdav'
import {
  deleteWebDAVFile,
  getClient,
  getWebDAVJsonFile,
  getWebDAVPlayConfig,
  moveWebDAVFile,
  saveWebDAVPlayConfig,
  uploadWebDAVFile,
  webdavExists,
} from './client'
import { filterFileName } from '@common/utils/common'

const PLAYLIST_MANIFEST = 'lx_playlist.json'

const audioExts = new Set([
  'mp3',
  'flac',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
])

const getExt = (name: string) => {
  const ext = name.split('.').pop()
  return ext && ext != name ? ext.toLowerCase() : ''
}

const parseFileName = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.')
  const rawName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  if (!rawName.includes('-')) return { name: rawName.trim(), singer: '' }
  const [left, ...rest] = rawName.split('-')
  return {
    name: left.trim(),
    singer: rest.join('-').trim(),
  }
}

const getDirectoryItems = async (path?: string | null): Promise<FileStat[]> => {
  const cli = getClient()
  if (!cli) throw new Error('WebDAV 未配置')
  const contents = await cli.getDirectoryContents(path || '/')
  return Array.isArray(contents) ? contents : (contents as { data: FileStat[] }).data
}

const toMusicInfo = (item: FileStat): LX.WebDAVPlay.MusicInfo => {
  const path = item.filename
  const ext = getExt(item.basename)
  const title = parseFileName(item.basename)
  const modifiedTime = item.lastmod ? new Date(item.lastmod).getTime() : 0
  return {
    id: `webdav_${path}`,
    name: title.name,
    singer: title.singer,
    source: 'local',
    interval: null,
    meta: {
      songId: path,
      albumName: '',
      webdav: true,
      filePath: path,
      fileName: item.basename,
      ext,
      size: item.size,
      picUrl: '',
      lastModifiedTime: modifiedTime,
    },
  }
}

export const listWebDAVFolders = async (
  folder?: LX.WebDAVPlay.DriveFolder | null
): Promise<LX.WebDAVPlay.DriveFolder[]> => {
  const items = await getDirectoryItems(folder?.path)
  return items
    .filter((item) => item.type === 'directory')
    .sort((a, b) => a.basename.localeCompare(b.basename))
    .map<LX.WebDAVPlay.DriveFolder>((item) => ({
      path: item.filename,
      name: item.basename,
    }))
}

export const saveWebDAVSelectedFolder = async (
  folder: LX.WebDAVPlay.DriveFolder | null
): Promise<LX.WebDAVPlay.Config> => {
  const config = await getWebDAVPlayConfig()
  config.selectedFolder = folder
  saveWebDAVPlayConfig(config)
  return config
}

const scanFolder = async (
  folder: LX.WebDAVPlay.DriveFolder | null,
  onProgress?: (count: number, folderPath: string) => void
): Promise<LX.WebDAVPlay.MusicInfo[]> => {
  const result: LX.WebDAVPlay.MusicInfo[] = []
  const items = await getDirectoryItems(folder?.path)
  for (const item of items) {
    if (item.type === 'directory') {
      result.push(...(await scanFolder({ path: item.filename, name: item.basename }, onProgress)))
      onProgress?.(result.length, item.filename)
      continue
    }
    if (item.type !== 'file') continue
    const ext = getExt(item.basename)
    if (!audioExts.has(ext)) continue
    result.push(toMusicInfo(item))
  }
  return result
}

export const scanWebDAVSongs = async (
  folder: LX.WebDAVPlay.DriveFolder | null,
  onProgress?: (count: number, folderPath: string) => void
): Promise<LX.WebDAVPlay.Config> => {
  const songs = await scanFolder(folder, onProgress)
  songs.sort((a, b) => b.meta.lastModifiedTime - a.meta.lastModifiedTime)

  const config = await getWebDAVPlayConfig()
  config.selectedFolder = folder
  config.songs = songs
  config.scannedAt = Date.now()
  saveWebDAVPlayConfig(config)
  return config
}

const joinPath = (dir: string, name: string) => `${dir.replace(/\/+$/, '')}/${name}`

// manifest 歌曲记录 → 可播放的 WebDAV MusicInfo(source 固定 local,靠 meta.webdav 路由)
const manifestSongToMusicInfo = (
  folder: LX.WebDAVPlay.DriveFolder,
  song: LX.WebDAVPlay.PlaylistManifestSong
): LX.WebDAVPlay.MusicInfo => {
  const filePath = joinPath(folder.path, song.fileName)
  return {
    id: `webdav_${filePath}`,
    name: song.name,
    singer: song.singer,
    source: 'local',
    interval: song.interval,
    meta: {
      songId: song.songId || filePath,
      albumName: song.albumName ?? '',
      webdav: true,
      filePath,
      fileName: song.fileName,
      ext: song.ext,
      picUrl: song.picUrl ?? '',
      lastModifiedTime: 0,
    },
  }
}

/**
 * 列出 root 下的子文件夹作为歌单;读取各自的 lx_playlist.json 判定 hasManifest 与曲目数。
 * 同时列各歌单目录,按音频文件实际大小求和得 totalSize(不依赖 manifest 是否记录)。
 */
export const listWebDAVPlaylists = async (
  root?: LX.WebDAVPlay.DriveFolder | null
): Promise<LX.WebDAVPlay.Playlist[]> => {
  const folders = await listWebDAVFolders(root)
  const playlists: LX.WebDAVPlay.Playlist[] = []
  for (const folder of folders) {
    const [manifest, items] = await Promise.all([
      getWebDAVJsonFile<LX.WebDAVPlay.PlaylistManifest>(joinPath(folder.path, PLAYLIST_MANIFEST)),
      getDirectoryItems(folder.path),
    ])
    const audioFiles = items.filter(
      (item) => item.type === 'file' && audioExts.has(getExt(item.basename))
    )
    const totalSize = audioFiles.reduce((sum, item) => sum + (item.size || 0), 0)
    playlists.push({
      folder,
      name: manifest?.name || folder.name,
      songCount: manifest?.songs.length ?? audioFiles.length,
      hasManifest: !!manifest,
      totalSize,
    })
  }
  return playlists
}

/**
 * 加载一个歌单的歌曲:优先用 manifest 重建;无 manifest 回退到该文件夹音频文件扫描(单层)。
 * 无论是否有 manifest,文件大小/修改时间都从实际目录 stat 按文件名补全(manifest 不记录这些字段),
 * 保证两种情况下都能显示文件大小。
 */
export const loadWebDAVPlaylist = async (
  folder: LX.WebDAVPlay.DriveFolder
): Promise<LX.WebDAVPlay.MusicInfo[]> => {
  const manifest = await getWebDAVJsonFile<LX.WebDAVPlay.PlaylistManifest>(
    joinPath(folder.path, PLAYLIST_MANIFEST)
  )
  const items = await getDirectoryItems(folder.path)

  if (manifest?.songs.length) {
    const statByName = new Map<string, FileStat>()
    for (const it of items) if (it.type === 'file') statByName.set(it.basename, it)
    return manifest.songs.map((song) => {
      const info = manifestSongToMusicInfo(folder, song)
      const stat = statByName.get(song.fileName)
      if (stat) {
        info.meta.size = stat.size
        info.meta.lastModifiedTime = stat.lastmod ? new Date(stat.lastmod).getTime() : 0
      }
      return info
    })
  }

  return items
    .filter((item) => item.type === 'file' && audioExts.has(getExt(item.basename)))
    .map(toMusicInfo)
    .sort((a, b) => b.meta.lastModifiedTime - a.meta.lastModifiedTime)
}

/**
 * 手动生成/刷新歌单清单 lx_playlist.json:扫描该文件夹音频文件重建 songs。
 * 已有 manifest 时按 fileName 保留原有富元数据(songId/albumName/picUrl/interval/source),
 * 仅补充新增文件、剔除已删除文件,并刷新 updateTime;createTime/name 沿用原值。
 * 返回写入后的曲目数。
 */
export const generateWebDAVPlaylistManifest = async (
  folder: LX.WebDAVPlay.DriveFolder
): Promise<number> => {
  const items = await getDirectoryItems(folder.path)
  const audioFiles = items.filter(
    (item) => item.type === 'file' && audioExts.has(getExt(item.basename))
  )

  const manifestPath = joinPath(folder.path, PLAYLIST_MANIFEST)
  const existing = await getWebDAVJsonFile<LX.WebDAVPlay.PlaylistManifest>(manifestPath)
  const existingByFileName = new Map<string, LX.WebDAVPlay.PlaylistManifestSong>()
  if (existing?.songs?.length) {
    for (const s of existing.songs) existingByFileName.set(s.fileName, s)
  }

  const now = Date.now()
  const songs: LX.WebDAVPlay.PlaylistManifestSong[] = audioFiles.map((item) => {
    const kept = existingByFileName.get(item.basename)
    if (kept) return kept
    const info = toMusicInfo(item)
    return {
      fileName: item.basename,
      name: info.name,
      singer: info.singer,
      albumName: '',
      interval: null,
      source: 'local',
      songId: String(info.meta.songId),
      ext: info.meta.ext,
      picUrl: '',
    }
  })

  const manifest: LX.WebDAVPlay.PlaylistManifest = {
    version: 1,
    name: existing?.name || folder.name,
    createTime: existing?.createTime || now,
    updateTime: now,
    songs,
  }
  await uploadWebDAVFile(manifestPath, JSON.stringify(manifest, null, 2))
  return songs.length
}

const getParentPath = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx > 0 ? trimmed.slice(0, idx) : ''
}

const stripExt = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * 删除整个歌单:递归删除该文件夹(含音频/.lrc/lx_playlist.json)。不可恢复。
 */
export const deleteWebDAVPlaylist = async (folder: LX.WebDAVPlay.DriveFolder): Promise<void> => {
  await deleteWebDAVFile(folder.path)
}

/**
 * 删除歌单内单曲:删音频文件 + 同名 .lrc(若存在),并重写 manifest 移除该条记录。
 */
export const deleteWebDAVPlaylistSong = async (
  folder: LX.WebDAVPlay.DriveFolder,
  song: LX.WebDAVPlay.MusicInfo
): Promise<void> => {
  const fileName = song.meta.fileName
  await deleteWebDAVFile(joinPath(folder.path, fileName))
  // 旁车歌词可能不存在,忽略其删除错误
  await deleteWebDAVFile(joinPath(folder.path, `${stripExt(fileName)}.lrc`)).catch(() => {})

  const manifestPath = joinPath(folder.path, PLAYLIST_MANIFEST)
  const manifest = await getWebDAVJsonFile<LX.WebDAVPlay.PlaylistManifest>(manifestPath)
  if (manifest) {
    manifest.songs = manifest.songs.filter((s) => s.fileName !== fileName)
    manifest.updateTime = Date.now()
    await uploadWebDAVFile(manifestPath, JSON.stringify(manifest, null, 2))
  }
}

/**
 * 重命名歌单:MOVE 整个文件夹到新名,并更新 manifest 的 name(保留用户原始输入)。
 * 文件夹名用 filterFileName 过滤非法字符;manifest.name 存原始展示名。
 */
export const renameWebDAVPlaylist = async (
  folder: LX.WebDAVPlay.DriveFolder,
  newName: string
): Promise<LX.WebDAVPlay.DriveFolder> => {
  const safeName = filterFileName(newName.trim())
  if (!safeName) throw new Error('名称无效')
  const parent = getParentPath(folder.path)
  const newPath = parent ? joinPath(parent, safeName) : `/${safeName}`

  if (newPath !== folder.path) {
    if (await webdavExists(newPath)) throw new Error('已存在同名歌单')
    await moveWebDAVFile(folder.path, newPath)
  }

  const manifestPath = joinPath(newPath, PLAYLIST_MANIFEST)
  const manifest = await getWebDAVJsonFile<LX.WebDAVPlay.PlaylistManifest>(manifestPath)
  if (manifest) {
    manifest.name = newName.trim()
    manifest.updateTime = Date.now()
    await uploadWebDAVFile(manifestPath, JSON.stringify(manifest, null, 2))
  }

  return { path: newPath, name: safeName }
}
