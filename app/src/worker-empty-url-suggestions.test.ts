// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import {
  EMPTY_URL_LIVE_QUERY_SHOWN,
  buildEmptyUrlLiveQuerySuggestions,
  emptyUrlLiveQuerySuggestionPool,
} from './worker-empty-url-suggestions'

function queryLens(suggestions: { query?: string; label: string }[]) {
  return suggestions.map((s) => (s.query ?? s.label).length)
}

describe('buildEmptyUrlLiveQuerySuggestions', () => {
  it('returns a fixed count from the pool', () => {
    const pool = emptyUrlLiveQuerySuggestionPool()
    expect(pool.length).toBeGreaterThan(EMPTY_URL_LIVE_QUERY_SHOWN)
    const out = buildEmptyUrlLiveQuerySuggestions(42_001)
    expect(out).toHaveLength(EMPTY_URL_LIVE_QUERY_SHOWN)
  })

  it('is deterministic for the same sessionSalt', () => {
    const a = buildEmptyUrlLiveQuerySuggestions(999_111)
    const b = buildEmptyUrlLiveQuerySuggestions(999_111)
    expect(a.map((s) => s.query)).toEqual(b.map((s) => s.query))
  })

  it('only returns queries from the pool', () => {
    const allowed = new Set(emptyUrlLiveQuerySuggestionPool().map((s) => s.query))
    const out = buildEmptyUrlLiveQuerySuggestions(77_777)
    for (const s of out) {
      expect(allowed.has(s.query)).toBe(true)
    }
  })

  it('orders picks by query length ascending (ties by label)', () => {
    const out = buildEmptyUrlLiveQuerySuggestions(123_456)
    const lens = queryLens(out)
    for (let i = 1; i < lens.length; i++) {
      expect(lens[i]!).toBeGreaterThanOrEqual(lens[i - 1]!)
    }
    const sortedCopy = [...out].sort((a, b) => {
      const la = (a.query ?? a.label).length
      const lb = (b.query ?? b.label).length
      return la - lb || a.label.localeCompare(b.label)
    })
    expect(out.map((s) => s.query)).toEqual(sortedCopy.map((s) => s.query))
  })

  it('assigns priority 0..n-1 for SuggestionList ordering', () => {
    const out = buildEmptyUrlLiveQuerySuggestions(555)
    expect(out.map((s) => s.priority)).toEqual([0, 1, 2])
  })
})
