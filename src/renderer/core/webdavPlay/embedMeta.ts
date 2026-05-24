import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'

// 直接使用底层库实现「可 await」的标签内嵌(@common/utils/musicMeta 的实现是 fire-and-forget,
// 上传场景需要内嵌完成后再读回文件,故在此重写为可等待版本)。仅支持 mp3 / flac。
const NodeID3 = require('node-id3')
const getImgSize = require('image-size')
const FlacProcessor = require('@common/utils/musicMeta/flac-metadata/index')

const FLAC_VENDOR = 'reference libFLAC 1.2.1 20070917'

const fetchCover = async (picUrl: string): Promise<Buffer | null> => {
  try {
    let url = picUrl
    if (url.includes('music.126.net')) url += `${url.includes('?') ? '&' : '?'}param=500y500`
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

const isJpg = (buf: Buffer) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff

const embedMp3 = (
  filePath: string,
  meta: { title: string; artist: string; album: string },
  picBuf: Buffer | null,
  lrcText: string
) => {
  const tags: Record<string, any> = {
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
  }
  if (lrcText) tags.unsynchronisedLyrics = { language: 'zho', text: lrcText }
  if (picBuf) {
    tags.image = {
      mime: isJpg(picBuf) ? 'image/jpeg' : 'image/png',
      type: { id: 3 },
      description: '',
      imageBuffer: picBuf,
    }
  }
  NodeID3.write(tags, filePath)
}

const embedFlac = async (
  filePath: string,
  comments: Record<string, string>,
  picBuf: Buffer | null
) => {
  const data: Record<string, any> = {
    vorbis: {
      vendor: FLAC_VENDOR,
      comments: Object.keys(comments).map((key) => `${key.toUpperCase()}=${comments[key] || ''}`),
    },
  }
  if (picBuf) {
    const size = getImgSize(picBuf)
    data.picture = {
      pictureType: 3,
      mimeType: isJpg(picBuf) ? 'image/jpeg' : 'image/png',
      description: '',
      width: size.width,
      height: size.height,
      bitsPerPixel: isJpg(picBuf) ? 24 : 32,
      colors: 0,
      pictureData: picBuf,
    }
  }

  // 用 stream.pipeline 确保读/写流全部完成并关闭(Windows 上文件句柄释放后再替换),
  // 仅在新文件写好后才删除原文件并改名,避免「已删原文件但改名失败」导致文件丢失(ENOENT)。
  const tempPath = `${filePath}.lxmtemp`
  const processor = new FlacProcessor()
  processor.writeMeta(data)
  await pipeline(fs.createReadStream(filePath), processor, fs.createWriteStream(tempPath))
  await fs.promises.rm(filePath, { force: true })
  await fs.promises.rename(tempPath, filePath)
}

/**
 * 把标签 + 封面 + 歌词内嵌到本地音频文件(原地修改),返回是否内嵌成功。
 * 仅 mp3/flac 支持内嵌;其他格式返回 false(由调用方决定是否仅上传裸文件)。
 */
export const embedMeta = async (
  filePath: string,
  meta: { title: string; artist: string; album: string; picUrl?: string; lrcText?: string }
): Promise<boolean> => {
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== '.mp3' && ext !== '.flac') return false

  const picBuf = meta.picUrl ? await fetchCover(meta.picUrl) : null
  if (ext === '.mp3') {
    embedMp3(filePath, meta, picBuf, meta.lrcText ?? '')
  } else {
    await embedFlac(
      filePath,
      {
        TITLE: meta.title,
        ARTIST: meta.artist,
        ALBUM: meta.album,
        LYRICS: meta.lrcText ?? '',
      },
      picBuf
    )
  }
  return true
}
