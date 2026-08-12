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

/**
 * @param {any} musicInfo
 * @param {{ originalUrl?: string | null, audioUrl?: string | null } | null} [longFormContent]
 */
export const resolveMusicDetailWebUrl = (musicInfo, longFormContent = null) => {
  if (!musicInfo) return ''

  const meta = getMeta(musicInfo)
  if (meta.podcast) {
    const candidates = [
      longFormContent?.originalUrl,
      meta.originalUrl,
      longFormContent?.audioUrl,
      meta.audioUrl,
    ]
    for (const candidate of candidates) {
      const url = normalizeHttpUrl(candidate)
      if (url) return url
    }
    return ''
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

export const buildTranscriptSelectableLines = (transcript) => {
  if (!transcript || !Array.isArray(transcript.upsertLines)) return []
  const speakers = new Map(
    Array.isArray(transcript.speakers)
      ? transcript.speakers.map((speaker) => [speaker.id, speaker.name])
      : []
  )

  return [...transcript.upsertLines]
    .sort((left, right) => (
      Number(left.startMs) - Number(right.startMs) || String(left.id).localeCompare(String(right.id))
    ))
    .flatMap((line) => {
      const text = typeof line.displayText === 'string' ? line.displayText.trim() : ''
      if (!text) return []
      const speaker = line.speakerId ? speakers.get(line.speakerId) : ''
      return [{
        key: String(line.id),
        text: speaker ? `${speaker}: ${text}` : text,
        time: Number.isFinite(line.startMs) ? String(line.startMs) : '',
        translation: '',
        sourceKind: 'transcript',
      }]
    })
}

export const buildLongFormSelectableLines = (document) => {
  if (document?.protocolVersion !== 1 || !Array.isArray(document.blocks)) return []

  return document.blocks.flatMap((block, index) => {
    const text = typeof block?.text === 'string' ? block.text.trim() : ''
    if (!text) return []
    return [{
      key: String(block.id || `block-${index + 1}`),
      text,
      time: '',
      translation: '',
      sourceKind: 'long-form',
      blockKind: block.kind,
      level: block.level,
    }]
  })
}

/**
 * @param {{
 *   transcriptLines?: any[],
 *   longFormLines?: any[],
 *   longFormFailed?: boolean,
 *   audioUrl?: string,
 * }} [options]
 */
export const resolvePodcastShareContentSource = ({
  transcriptLines = [],
  longFormLines = [],
  longFormFailed = false,
  audioUrl = '',
} = {}) => {
  if (longFormLines.length && (!String(audioUrl).trim() || !transcriptLines.length)) {
    return 'long-form'
  }
  if (transcriptLines.length) return 'transcript'
  if (longFormLines.length || longFormFailed) return 'long-form'
  return 'transcript'
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

const normalizePageValue = (value, fallback, totalPages) => {
  const missing = value == null || (typeof value === 'string' && !value.trim())
  const parsed = missing ? Number.NaN : Math.trunc(Number(value))
  const page = Number.isFinite(parsed) ? parsed : fallback
  return Math.min(totalPages, Math.max(1, page))
}

export const normalizeShareCardPageRange = (startPage, endPage, totalPages) => {
  const parsedTotal = Math.trunc(Number(totalPages))
  const normalizedTotal = Number.isFinite(parsedTotal) ? Math.max(0, parsedTotal) : 0
  if (!normalizedTotal) return { startIndex: 0, endIndex: -1 }

  const normalizedStart = normalizePageValue(startPage, 1, normalizedTotal)
  const normalizedEnd = normalizePageValue(endPage, normalizedTotal, normalizedTotal)
  return {
    startIndex: Math.min(normalizedStart, normalizedEnd) - 1,
    endIndex: Math.max(normalizedStart, normalizedEnd) - 1,
  }
}

export const buildShareCardPageIndexes = (startIndex, endIndex) => {
  const parsedStart = Math.trunc(Number(startIndex))
  const parsedEnd = Math.trunc(Number(endIndex))
  if (
    !Number.isFinite(parsedStart) ||
    !Number.isFinite(parsedEnd) ||
    parsedStart < 0 ||
    parsedEnd < parsedStart
  ) return []

  return Array.from(
    { length: parsedEnd - parsedStart + 1 },
    (_, offset) => parsedStart + offset
  )
}

export const buildShareCardRetryPageIndexes = (
  failedPageIndex,
  endPageIndex,
  strategy = 'remaining'
) => {
  const parsedFailedPage = Math.trunc(Number(failedPageIndex))
  const parsedEndPage = Math.trunc(Number(endPageIndex))
  if (
    !Number.isFinite(parsedFailedPage) ||
    !Number.isFinite(parsedEndPage) ||
    parsedFailedPage < 0 ||
    parsedEndPage < parsedFailedPage
  ) return []

  if (strategy === 'failed') return [parsedFailedPage]
  if (strategy === 'remaining') {
    return buildShareCardPageIndexes(parsedFailedPage, parsedEndPage)
  }
  throw new RangeError('strategy must be "remaining" or "failed"')
}

const windowsReservedFileStem = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const windowsFileNameCodeUnitLimit = 255

const clipByCodeUnits = (value, maxCodeUnits) => {
  let result = ''
  for (const grapheme of graphemes(value)) {
    if (result.length + grapheme.length > maxCodeUnits) break
    result += grapheme
  }
  return result
}

const sanitizeFileNamePart = (value, fallback, maxCodeUnits = 120) => {
  const sanitized = String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  let clipped = clipByCodeUnits(sanitized, maxCodeUnits) || fallback
  if (windowsReservedFileStem.test(clipped)) clipped = `_${clipped}`
  return clipByCodeUnits(clipped, maxCodeUnits) || '_'
}

export const buildShareCardBatchId = (date = new Date()) => {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) throw new RangeError('date must be valid')
  const pad = (number, width = 2) => String(number).padStart(width, '0')
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
    '-',
    pad(value.getHours()),
    pad(value.getMinutes()),
    pad(value.getSeconds()),
    '-',
    pad(value.getMilliseconds(), 3),
  ].join('')
}

export const buildShareCardPageFileName = (title, page, total, batchId = '') => {
  const fallback = 'music-share-card'
  const parsedTotal = Math.trunc(Number(total))
  const normalizedTotal = Number.isFinite(parsedTotal) ? Math.max(1, parsedTotal) : 1
  const parsedPage = Math.trunc(Number(page))
  const normalizedPage = Math.min(
    normalizedTotal,
    Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1
  )
  const pageWidth = String(normalizedTotal).length
  const runSuffix = batchId ? `_${sanitizeFileNamePart(batchId, 'batch', 64)}` : ''
  const pageSuffix = normalizedTotal > 1
    ? `_p${String(normalizedPage).padStart(pageWidth, '0')}-of-${normalizedTotal}`
    : ''
  const extension = '.png'
  const maxStemCodeUnits = Math.max(
    1,
    windowsFileNameCodeUnitLimit - runSuffix.length - pageSuffix.length - extension.length
  )
  const stem = sanitizeFileNamePart(title, fallback, maxStemCodeUnits)
  return `${stem}${runSuffix}${pageSuffix}${extension}`
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
