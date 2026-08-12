import { describe, expect, it } from 'vitest'
import {
  createLongFormContent,
  longFormContentDescriptor,
  parseLongFormContent,
} from './longFormContent'

describe('podcast long-form content', () => {
  it('extracts semantic plain-text blocks and drops executable markup', () => {
    const document = createLongFormContent({
      contentId: 'article-1',
      title: 'A long article',
      content: `
        <article>
          <h2>第一章</h2>
          <p>正文 <strong>重点</strong> &amp; 说明</p>
          <script>steal()</script>
          <ul><li>第一项</li><li>第二项<ul><li>嵌套项</li></ul></li></ul>
          <blockquote>一段引用</blockquote>
        </article>
      `,
      originalUrl: 'https://example.com/articles/1',
      audioUrl: 'https://cdn.example.com/articles/1.mp3',
    })

    expect(document).toMatchObject({
      protocolVersion: 1,
      contentId: 'article-1',
      blockCount: 6,
      originalUrl: 'https://example.com/articles/1',
      shareUrl: 'https://example.com/articles/1',
    })
    expect(document?.blocks).toEqual([
      { id: 'block-1', kind: 'heading', level: 2, text: '第一章' },
      { id: 'block-2', kind: 'paragraph', text: '正文 重点 & 说明' },
      { id: 'block-3', kind: 'list-item', text: '第一项' },
      { id: 'block-4', kind: 'list-item', text: '第二项' },
      { id: 'block-5', kind: 'list-item', text: '嵌套项' },
      { id: 'block-6', kind: 'quote', text: '一段引用' },
    ])
    expect(JSON.stringify(document)).not.toContain('steal')
  })

  it('keeps plain-text paragraphs and falls back to a safe audio URL', () => {
    const document = createLongFormContent({
      contentId: 'article-2',
      title: 'Plain text',
      content: '第一段\n仍是第一段\n\n第二段',
      originalUrl: 'https://user:secret@example.com/article',
      audioUrl: 'https://cdn.example.com/article.mp3',
    })!

    expect(document.blocks.map((block) => block.text)).toEqual(['第一段 仍是第一段', '第二段'])
    expect(document.originalUrl).toBeNull()
    expect(document.shareUrl).toBe('https://cdn.example.com/article.mp3')
    expect(longFormContentDescriptor(document)).toEqual({
      protocolVersion: 1,
      contentId: 'article-2',
      revision: document.revision,
      blockCount: 2,
      characterCount: document.characterCount,
    })
  })

  it('rejects malformed persisted documents', () => {
    expect(parseLongFormContent('{broken')).toBeNull()
    expect(parseLongFormContent(JSON.stringify({ protocolVersion: 1, blocks: [] }))).toBeNull()
  })
})
