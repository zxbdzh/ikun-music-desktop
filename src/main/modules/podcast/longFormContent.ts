import { createHash } from 'node:crypto'
import { parseDocument } from 'htmlparser2'

export const MAX_LONG_FORM_CONTENT_BYTES = 1024 * 1024

interface HtmlNode {
  type: string
  name?: string
  data?: string
  children?: HtmlNode[]
}

interface LongFormSource {
  contentId: string
  title: string
  content: string
  originalUrl?: string
  audioUrl?: string
}

const ignoredTags = new Set([
  'head',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'math',
  'canvas',
  'iframe',
  'object',
])
const containerTags = new Set([
  'article',
  'aside',
  'body',
  'div',
  'footer',
  'header',
  'main',
  'nav',
  'section',
])

export const createLongFormContent = (
  source: LongFormSource
): LX.Podcast.LongFormContentDocument | null => {
  const content = capUtf8(source.content)
  if (!content.trim()) return null
  const blocks = extractBlocks(content)
  if (!blocks.length) return null
  const originalUrl = normalizeHttpUrl(source.originalUrl)
  const audioUrl = normalizeHttpUrl(source.audioUrl)
  const characterCount = blocks.reduce((total, block) => total + block.text.length, 0)
  const revision = stableRevision(JSON.stringify({ blocks, originalUrl, audioUrl }))

  return {
    protocolVersion: 1,
    contentId: source.contentId,
    revision,
    title: normalizeText(source.title) || source.contentId,
    blocks,
    blockCount: blocks.length,
    characterCount,
    originalUrl,
    audioUrl,
    shareUrl: originalUrl ?? audioUrl,
  }
}

export const longFormContentDescriptor = (
  document: LX.Podcast.LongFormContentDocument
): LX.Podcast.LongFormContentDescriptor => ({
  protocolVersion: 1,
  contentId: document.contentId,
  revision: document.revision,
  blockCount: document.blockCount,
  characterCount: document.characterCount,
})

export const parseLongFormContent = (
  value: unknown
): LX.Podcast.LongFormContentDocument | null => {
  let document: unknown = value
  if (typeof value === 'string') {
    try {
      document = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!document || typeof document !== 'object') return null
  const item = document as Partial<LX.Podcast.LongFormContentDocument>
  const revision = item.revision
  if (
    item.protocolVersion !== 1 ||
    typeof item.contentId !== 'string' ||
    !item.contentId ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    !Array.isArray(item.blocks)
  ) return null
  const blocks = item.blocks.filter(isLongFormBlock)
  if (!blocks.length || blocks.length !== item.blocks.length) return null
  const normalized = createLongFormContent({
    contentId: item.contentId,
    title: typeof item.title === 'string' ? item.title : item.contentId,
    content: blocks.map((block) => block.text).join('\n\n'),
    originalUrl: typeof item.originalUrl === 'string' ? item.originalUrl : undefined,
    audioUrl: typeof item.audioUrl === 'string' ? item.audioUrl : undefined,
  })
  if (!normalized) return null
  return {
    ...normalized,
    revision,
    blocks,
    blockCount: blocks.length,
    characterCount: blocks.reduce((total, block) => total + block.text.length, 0),
  }
}

export const longFormContentText = (
  document: LX.Podcast.LongFormContentDocument
): string => document.blocks.map((block) => block.text).join('\n\n')

export const summarizeLongFormContent = (content: string, maxCharacters = 400): string => {
  const blocks = extractBlocks(capUtf8(content))
  const summary = normalizeText(blocks.map((block) => block.text).join(' '))
  if (summary.length <= maxCharacters) return summary
  return `${summary.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`
}

const extractBlocks = (content: string): LX.Podcast.LongFormContentBlock[] => {
  if (!looksLikeHtml(content)) return plainTextBlocks(content)
  const root = parseDocument(content, { decodeEntities: true }) as unknown as HtmlNode
  const blocks: LX.Podcast.LongFormContentBlock[] = []
  let looseText = ''

  const addBlock = (
    kind: LX.Podcast.LongFormContentBlockKind,
    value: string,
    level?: number
  ) => {
    const text = normalizeText(value)
    if (!text || blocks.at(-1)?.text === text) return
    blocks.push({
      id: `block-${blocks.length + 1}`,
      kind,
      text,
      ...(level != null ? { level } : {}),
    })
  }
  const flushLooseText = () => {
    const value = looseText
    looseText = ''
    plainTextParagraphs(value).forEach((text) => addBlock('paragraph', text))
  }
  const visit = (node: HtmlNode) => {
    if (node.type === 'text') {
      looseText += node.data ?? ''
      return
    }
    const tag = node.name?.toLowerCase()
    if (tag && ignoredTags.has(tag)) return
    if (tag === 'br') {
      looseText += '\n'
      return
    }
    if (tag && /^h[1-6]$/.test(tag)) {
      flushLooseText()
      addBlock('heading', visibleText(node), Number(tag[1]))
      return
    }
    if (tag === 'p' || tag === 'pre') {
      flushLooseText()
      addBlock('paragraph', visibleText(node))
      return
    }
    if (tag === 'li') {
      flushLooseText()
      addBlock('list-item', visibleText(node, true))
      node.children
        ?.filter((child) => child.name === 'ul' || child.name === 'ol')
        .forEach(visit)
      return
    }
    if (tag === 'blockquote') {
      flushLooseText()
      addBlock('quote', visibleText(node))
      return
    }
    const isContainer = !!tag && containerTags.has(tag)
    if (isContainer) flushLooseText()
    node.children?.forEach(visit)
    if (isContainer) flushLooseText()
  }

  root.children?.forEach(visit)
  flushLooseText()
  return blocks
}

const visibleText = (node: HtmlNode, skipNestedLists = false): string => {
  if (node.type === 'text') return node.data ?? ''
  const tag = node.name?.toLowerCase()
  if (tag && ignoredTags.has(tag)) return ''
  if (skipNestedLists && (tag === 'ul' || tag === 'ol')) return ''
  if (tag === 'br') return '\n'
  return node.children?.map((child) => visibleText(child, skipNestedLists)).join('') ?? ''
}

const plainTextBlocks = (content: string): LX.Podcast.LongFormContentBlock[] =>
  plainTextParagraphs(content).map((text, index) => ({
    id: `block-${index + 1}`,
    kind: 'paragraph',
    text,
  }))

const plainTextParagraphs = (content: string): string[] => content
  .replace(/\r\n?/g, '\n')
  .split(/\n\s*\n+/)
  .map(normalizeText)
  .filter(Boolean)

const normalizeText = (value: string): string => value
  .replace(/\u00a0/g, ' ')
  .replace(/[\t\f\v ]+/g, ' ')
  .replace(/\s*\n\s*/g, ' ')
  .trim()

const looksLikeHtml = (value: string): boolean => /<\/?[a-z][^>]*>/i.test(value)
const normalizeHttpUrl = (value?: string): string | null => {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}
const stableRevision = (value: string): number =>
  Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 12), 16)
const capUtf8 = (value: string): string => {
  const buffer = Buffer.from(value, 'utf8')
  return buffer.length <= MAX_LONG_FORM_CONTENT_BYTES
    ? value
    : buffer.subarray(0, MAX_LONG_FORM_CONTENT_BYTES).toString('utf8')
}
const isLongFormBlock = (value: unknown): value is LX.Podcast.LongFormContentBlock => {
  if (!value || typeof value !== 'object') return false
  const block = value as Partial<LX.Podcast.LongFormContentBlock>
  return typeof block.id === 'string' &&
    ['heading', 'paragraph', 'list-item', 'quote'].includes(String(block.kind)) &&
    typeof block.text === 'string' &&
    !!normalizeText(block.text) &&
    (block.level == null || (Number.isInteger(block.level) && block.level >= 1 && block.level <= 6))
}
