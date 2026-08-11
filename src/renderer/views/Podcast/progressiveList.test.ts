import { describe, expect, it } from 'vitest'
import { nextVisibleItemCount, visibleListItems } from './progressiveList'

describe('podcast progressive list', () => {
  it('renders only the current window without mutating the source list', () => {
    const items = Array.from({ length: 120 }, (_, index) => index + 1)

    expect(visibleListItems(items, 50)).toEqual(items.slice(0, 50))
    expect(items).toHaveLength(120)
  })

  it('advances in fixed batches and clamps the final batch', () => {
    expect(nextVisibleItemCount(50, 120, 50)).toBe(100)
    expect(nextVisibleItemCount(100, 120, 50)).toBe(120)
    expect(nextVisibleItemCount(120, 120, 50)).toBe(120)
  })
})
