declare namespace LX {
  namespace WebDAVPlay {
    interface DriveFolder {
      path: string // 服务器绝对路径(原始未编码),作为唯一标识
      name: string
    }
    interface Config {
      selectedFolder?: DriveFolder | null
      songs: MusicInfo[]
      scannedAt?: number
    }
    interface MusicInfo extends LX.Music.MusicInfoLocal {
      meta: LX.Music.MusicInfoMeta_local & {
        webdav: true // ← 源判别标记
        filePath: string // 服务器绝对路径(原始未编码)
        fileName: string
        ext: string
        size?: number
        picUrl?: string // WebDAV 无缩略图,通常为空,由在线源补
        lastModifiedTime: number
      }
    }

    // 歌单清单文件,写入歌单文件夹内的 lx_playlist.json
    // 只存歌曲业务元数据,绝不含凭证/绝对 URL(仅相对文件名,播放时现拼)
    interface PlaylistManifestSong {
      fileName: string // 相对本文件夹的文件名(含扩展名),如 "晴天 - 周杰伦.mp3"
      name: string
      singer: string
      albumName: string
      interval: string | null
      source: string // 原始来源(便于在线补歌词/封面),不影响播放
      songId: string
      ext: string
      picUrl?: string // 在线封面 URL(可选,加速列表展示;无则空)
    }
    interface PlaylistManifest {
      version: 1
      name: string
      createTime: number
      updateTime: number
      songs: PlaylistManifestSong[]
    }

    // 浏览态歌单(由子文件夹 + manifest 推导)
    interface Playlist {
      folder: DriveFolder // 歌单文件夹(path 为服务器绝对路径)
      name: string
      songCount: number
      hasManifest: boolean
      totalSize?: number // 文件夹内音频文件大小之和(字节),由实时目录 stat 求得
    }
  }
}
