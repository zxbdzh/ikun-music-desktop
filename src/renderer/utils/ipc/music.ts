import { rendererInvoke } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

export const getLyricRaw = async (musicInfo: LX.Music.MusicInfo): Promise<LX.Music.LyricInfo> => {
  return rendererInvoke<string, LX.Music.LyricInfo>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_raw,
    musicInfo.id
  )
}

export const clearLyricRaw = async () => {
  await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.clear_lyric_raw)
}

export const getLyricRawCount = async () => {
  return rendererInvoke<number>(WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_raw_count)
}

export const getLyricEdited = async (
  musicInfo: LX.Music.MusicInfo
): Promise<LX.Music.LyricInfo> => {
  return rendererInvoke<string, LX.Music.LyricInfo>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_edited,
    musicInfo.id
  )
}

export const saveLyric = async (
  musicInfo: LX.Music.MusicInfo,
  lyricInfo: LX.Music.LyricInfo | LX.Player.LyricInfo
) => {
  if ('rawlrcInfo' in lyricInfo) {
    const { rawlrcInfo, ...info } = lyricInfo
    const tasks = [
      rendererInvoke<LX.Music.LyricInfoSave>(WIN_MAIN_RENDERER_EVENT_NAME.save_lyric_raw, {
        id: musicInfo.id,
        lyrics: rawlrcInfo,
      }),
    ]
    if (info.lyric != rawlrcInfo.lyric) {
      tasks.push(
        rendererInvoke<LX.Music.LyricInfoSave>(WIN_MAIN_RENDERER_EVENT_NAME.save_lyric_edited, {
          id: musicInfo.id,
          lyrics: info,
        })
      )
    }
    console.log(tasks)
    await Promise.all(tasks)
  } else {
    await rendererInvoke<LX.Music.LyricInfoSave>(WIN_MAIN_RENDERER_EVENT_NAME.save_lyric_raw, {
      id: musicInfo.id,
      lyrics: lyricInfo,
    })
  }
}
export const saveLyricEdited = async (
  musicInfo: LX.Music.MusicInfo,
  lyricInfo: LX.Music.LyricInfo
) => {
  await rendererInvoke<LX.Music.LyricInfoSave>(WIN_MAIN_RENDERER_EVENT_NAME.save_lyric_edited, {
    id: musicInfo.id,
    lyrics: lyricInfo,
  })
}
export const removeLyricEdited = async (musicInfo: LX.Music.MusicInfo) => {
  await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.remove_lyric_edited, musicInfo.id)
}

export const clearLyric = async () => {
  await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.clear_lyric_raw)
}

export const clearLyricEdited = async () => {
  await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.clear_lyric_edited)
}

export const getLyricEditedCount = async () => {
  return rendererInvoke<number>(WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_edited_count)
}

export const getMusicUrl = async (
  musicInfo: LX.Music.MusicInfo,
  type: LX.Quality
): Promise<{ url: string; ekey: string | null } | null> => {
  const result = await rendererInvoke<string, { url: string; ekey: string | null } | ''>(
    WIN_MAIN_RENDERER_EVENT_NAME.get_music_url,
    `${musicInfo.id}_${type}`
  )
  return result || null
}

export const saveMusicUrl = async (
  musicInfo: LX.Music.MusicInfo,
  type: LX.Quality,
  url: string,
  ekey?: string | null
) => {
  await rendererInvoke<LX.Music.MusicUrlInfo>(WIN_MAIN_RENDERER_EVENT_NAME.save_music_url, {
    id: `${musicInfo.id}_${type}`,
    url,
    ekey: ekey ?? null,
  })
}

export const clearMusicUrl = async () => {
  await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.clear_music_url)
}

export const getMusicUrlCount = async () => {
  return rendererInvoke<number>(WIN_MAIN_RENDERER_EVENT_NAME.get_music_url_count)
}

export const registerDecryptRequest = async (url: string, ekey: string): Promise<string> => {
  return rendererInvoke<{ url: string; ekey: string }, string>(
    WIN_MAIN_RENDERER_EVENT_NAME.register_decrypt_request,
    { url, ekey }
  )
}

export const decryptFile = async (filePath: string, ekey: string): Promise<void> => {
  await rendererInvoke<{ filePath: string; ekey: string }>(
    WIN_MAIN_RENDERER_EVENT_NAME.decrypt_file,
    { filePath, ekey }
  )
}
