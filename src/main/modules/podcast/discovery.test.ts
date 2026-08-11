import { describe, expect, it } from 'vitest'
import { normalizePopularSources } from './discovery'

describe('podcast discovery data', () => {
  it('normalizes the popular source response', () => {
    expect(normalizePopularSources([
      { source: '节目 A', total_duration: 3600, view_count: 12 },
      { source: '节目 B', total_duration: '120', view_count: '3' },
    ])).toEqual([
      { source: '节目 A', totalDuration: 3600, viewCount: 12 },
      { source: '节目 B', totalDuration: 120, viewCount: 3 },
    ])
  })

  it('drops unnamed rows and clamps invalid metrics', () => {
    expect(normalizePopularSources([
      { source: '', total_duration: 20, view_count: 1 },
      { source: '节目', total_duration: -1, view_count: 'invalid' },
    ])).toEqual([{ source: '节目', totalDuration: 0, viewCount: 0 }])
  })
})
