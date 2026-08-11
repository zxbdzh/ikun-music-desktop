import musicSdk from '@renderer/utils/musicSdk'
import { toOldMusicInfo } from '@renderer/utils'

const getMeta = (musicInfo) => {
  return musicInfo?.meta ?? {}
}

const isHttpUrl = (url) => /^https?:\/\//i.test(url || '')

export const resolveMusicDetailWebUrl = (musicInfo) => {
  if (!musicInfo) return ''

  const meta = getMeta(musicInfo)
  if (meta.podcast) {
    if (isHttpUrl(meta.originalUrl)) return meta.originalUrl
    return isHttpUrl(meta.audioUrl) ? meta.audioUrl : ''
  }

  const oldMusicInfo = toOldMusicInfo(musicInfo)
  const sdkUrl = musicSdk[oldMusicInfo.source]?.getMusicDetailPageUrl?.(oldMusicInfo)
  if (isHttpUrl(sdkUrl)) {
    if (musicInfo.source === 'wy') {
      if (meta.songId) return `https://project.zxbdwy.online/music?id=${meta.songId}`
    }
    return sdkUrl
  }

  switch (musicInfo.source) {
    case 'wy':
      if (meta.songId) return `https://project.zxbdwy.online/music?id=${meta.songId}`
      break
    case 'tx':
      if (meta.strMediaMid) return `https://y.qq.com/n/ryqq/songDetail/${meta.strMediaMid}`
      break
    case 'kg':
      if (meta.hash) {
        const albumId = meta.albumId ?? ''
        return `https://www.kugou.com/song/#hash=${meta.hash}&album_id=${albumId}`
      }
      break
    case 'kw':
      if (meta.songId) return `https://www.kuwo.cn/play_detail/${meta.songId}`
      break
    case 'mg':
      if (meta.copyrightId) return `https://music.migu.cn/v3/music/song/${meta.copyrightId}`
      break
    default:
      break
  }

  const searchText = encodeURIComponent(`${musicInfo.name} ${musicInfo.singer}`.trim())
  return `https://music.163.com/#/search/m/?s=${searchText}`
}

const timeFieldExp = /^(?:\[[\d:.]+\])+/g
const timeExp = /\d{1,3}(?::\d{1,3}){0,2}(?:\.\d{1,3})/g

const formatTimeLabel = (label) => {
  return label
    .replace(/^0+(\d+)/, '$1')
    .replace(/:0+(\d+)/g, ':$1')
    .replace(/\.0+(\d+)/, '.$1')
}

const parseLyricLines = (lyric = '') => {
  if (!lyric) return []

  const linesMap = new Map()
  const rows = lyric.split(/\r\n|\n|\r/)

  for (const row of rows) {
    const line = row.trim()
    const timeField = line.match(timeFieldExp)?.[0]
    if (!timeField) continue
    const text = line
      .replace(timeFieldExp, '')
      .replace(/<\d+(?:,\d+)?>/g, '')
      .trim()
    if (!text || text == '//') continue
    const times = timeField.match(timeExp)
    if (!times) continue

    for (const label of times) {
      const key = formatTimeLabel(label)
      if (!linesMap.has(key)) {
        linesMap.set(key, {
          key,
          text,
          time: key,
        })
      }
    }
  }

  return Array.from(linesMap.values())
}

export const buildLyricSelectableLines = (lyric = '', tlyric = '', max = 9999) => {
  const baseLines = parseLyricLines(lyric)
  const transMap = new Map(parseLyricLines(tlyric).map((line) => [line.key, line.text]))

  const result = baseLines
    .map((line) => ({
      ...line,
      translation: transMap.get(line.key) || '',
    }))
    .filter((line) => line.text)

  return result.slice(0, max)
}

export const paginateLyricLines = (
  lines = [],
  {
    maxLinesPerPage = 6,
    maxCharactersPerPage = 240,
    includeTranslation = true,
  } = {}
) => {
  if (!Number.isInteger(maxLinesPerPage) || maxLinesPerPage < 1) {
    throw new RangeError('maxLinesPerPage must be a positive integer')
  }
  if (!Number.isInteger(maxCharactersPerPage) || maxCharactersPerPage < 1) {
    throw new RangeError('maxCharactersPerPage must be a positive integer')
  }

  const pages = []
  let currentPage = []
  let currentCharacterCount = 0

  for (const line of lines) {
    const characterCount = Math.max(
      1,
      String(line?.text ?? '').length +
        (includeTranslation ? String(line?.translation ?? '').length : 0)
    )
    const pageIsFull =
      currentPage.length >= maxLinesPerPage ||
      currentCharacterCount + characterCount > maxCharactersPerPage

    if (currentPage.length && pageIsFull) {
      pages.push(currentPage)
      currentPage = []
      currentCharacterCount = 0
    }

    currentPage.push(line)
    currentCharacterCount += characterCount
  }

  if (currentPage.length) pages.push(currentPage)
  return pages
}
