import musicSdk from '@renderer/utils/musicSdk'
import { decodeName, toOldMusicInfo } from '@renderer/utils'

const getMeta = (musicInfo) => {
  return musicInfo?.meta ?? {}
}

const normalizeHttpUrl = (url) => {
  const normalizedUrl = decodeName(typeof url === 'string' ? url : '')?.trim() ?? ''
  if (!normalizedUrl) return ''
  try {
    const parsedUrl = new URL(normalizedUrl)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return ''
    if (parsedUrl.username || parsedUrl.password) return ''
    return parsedUrl.href
  } catch {
    return ''
  }
}

export const resolveMusicDetailWebUrl = (musicInfo) => {
  if (!musicInfo) return ''

  const meta = getMeta(musicInfo)
  if (meta.podcast) {
    const originalUrl = normalizeHttpUrl(meta.originalUrl)
    if (originalUrl) return originalUrl
    return normalizeHttpUrl(meta.audioUrl)
  }

  const oldMusicInfo = toOldMusicInfo(musicInfo)
  const sdkUrl = musicSdk[oldMusicInfo.source]?.getMusicDetailPageUrl?.(oldMusicInfo)
  const normalizedSdkUrl = normalizeHttpUrl(sdkUrl)
  if (normalizedSdkUrl) {
    if (musicInfo.source === 'wy') {
      if (meta.songId) return `https://project.zxbdwy.online/music?id=${meta.songId}`
    }
    return normalizedSdkUrl
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

  const displayLines = lines.flatMap((line) => splitOversizedLine(
    line,
    maxCharactersPerPage,
    includeTranslation
  ))
  const pages = []
  let currentPage = []
  let currentCharacterCount = 0

  for (const line of displayLines) {
    const characterCount = displayedCharacterCount(line, includeTranslation)
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

const graphemeSegmenter = typeof Intl?.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

const graphemes = (value) => {
  const text = String(value ?? '')
  return graphemeSegmenter
    ? [...graphemeSegmenter.segment(text)].map((item) => item.segment)
    : Array.from(text)
}

const displayedCharacterCount = (line, includeTranslation) => Math.max(
  1,
  graphemes(line?.text).length +
    (includeTranslation ? graphemes(line?.translation).length : 0)
)

const splitOversizedLine = (line, maxCharacters, includeTranslation) => {
  if (displayedCharacterCount(line, includeTranslation) <= maxCharacters) return [line]

  const text = graphemes(line?.text)
  const translation = includeTranslation ? graphemes(line?.translation) : []
  let textBudget = maxCharacters
  let translationBudget = 0

  if (text.length && translation.length && maxCharacters > 1) {
    const total = text.length + translation.length
    textBudget = Math.max(1, Math.floor(maxCharacters * text.length / total))
    translationBudget = Math.max(1, maxCharacters - textBudget)
    textBudget = maxCharacters - translationBudget
  } else if (!text.length && translation.length) {
    textBudget = 0
    translationBudget = maxCharacters
  }

  if (text.length && translation.length && maxCharacters === 1) {
    return [
      ...chunkGraphemes(text, 1).map((part, index, parts) => lineFragment(
        line,
        part,
        '',
        index,
        parts.length + translation.length
      )),
      ...chunkGraphemes(translation, 1).map((part, index) => lineFragment(
        line,
        '',
        part,
        text.length + index,
        text.length + translation.length
      )),
    ]
  }

  const textParts = textBudget ? chunkGraphemes(text, textBudget) : []
  const translationParts = translationBudget
    ? chunkGraphemes(translation, translationBudget)
    : []
  const partCount = Math.max(textParts.length, translationParts.length)

  return Array.from({ length: partCount }, (_, index) => lineFragment(
    line,
    textParts[index] ?? '',
    translationParts[index] ?? '',
    index,
    partCount
  ))
}

const chunkGraphemes = (values, size) => {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size).join(''))
  }
  return result
}

const lineFragment = (line, text, translation, index, count) => ({
  ...line,
  key: `${line?.key ?? 'line'}:part-${index + 1}`,
  text,
  translation,
  continuation: index > 0,
  continues: index + 1 < count,
})
