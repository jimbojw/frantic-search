// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { NodeCache, index, printingIndex } from '@frantic-search/shared'
import { runSearch } from './worker-search'

const cache = new NodeCache(index, printingIndex)
const sessionSalt = 12345

describe('runSearch pinned lip counts (issue #52)', () => {
  it('pinned-only face query returns pinnedIndicesCount and forwards hasPrintingConditions/uniquePrints', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 'f:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    expect(result.pinnedIndicesCount).toBe(9) // all 9 cards in fixture are commander-legal
    expect(result.pinnedPrintingCount).toBeUndefined() // face-only query, no printing count
    expect(result.hasPrintingConditions).toBe(false)
    expect(result.uniquePrints).toBe(false)
  })

  it('pinned-only printing query returns pinnedIndicesCount and pinnedPrintingCount', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 'set:mh2' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    expect(result.pinnedIndicesCount).toBe(1) // Lightning Bolt
    expect(result.pinnedPrintingCount).toBe(2) // MH2 has 2 printings (rare nonfoil, rare foil)
    expect(result.hasPrintingConditions).toBe(true)
    expect(result.uniquePrints).toBe(false)
  })

  it('pinned-only unique:prints returns pinnedPrintingCount', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 't:instant unique:prints' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    expect(result.pinnedIndicesCount).toBe(4) // Bolt, Counterspell, Azorius Charm, Dismember
    expect(result.pinnedPrintingCount).toBe(4) // Bolt has 4 printings in fixture (0,1,2,5), others have none
    expect(result.uniquePrints).toBe(true)
  })

  it('both non-empty returns pinnedIndicesCount and pinnedPrintingCount when pinned has printing terms', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'c:r', pinnedQuery: 'set:mh2' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    expect(result.pinnedIndicesCount).toBe(1) // pinned: Lightning Bolt only
    expect(result.pinnedPrintingCount).toBe(2) // MH2 printings of Bolt
    expect(result.indices.length).toBe(1) // intersection: red + Bolt = 1
    expect(result.printingIndices?.length).toBe(2) // intersection of printings
  })

  it('both non-empty face-only pinned returns pinnedIndicesCount, no pinnedPrintingCount', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature', pinnedQuery: 'f:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    expect(result.pinnedIndicesCount).toBe(9)
    expect(result.pinnedPrintingCount).toBeUndefined()
    expect(result.indices.length).toBe(4) // commander-legal creatures
  })
})
