// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { NodeCache, index, printingIndex } from '@frantic-search/shared'
import { runSearch } from './worker-search'

const cache = new NodeCache(index, printingIndex)
const sessionSalt = 12345

describe('runSearch pinned lip counts (issue #52)', () => {
  it('pinned-only format query returns pinnedIndicesCount with printing-level filtering', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 'f:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    // f:commander is now a printing-domain field: only cards with tournament-usable
    // printings match. Only Bolt and Sol Ring have printings in the fixture.
    expect(result.pinnedIndicesCount).toBe(2)
    expect(result.pinnedPrintingCount).toBe(6) // 6 tournament-usable printing rows
    expect(result.hasPrintingConditions).toBe(true)
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
    expect(result.pinnedPrintingCount).toBe(5) // Bolt has 5 printings in fixture (0,1,2,5,6), others have none
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

  it('both non-empty pinned format query filters by printing legality', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature', pinnedQuery: 'f:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    // f:commander is printing-domain: only Bolt and Sol Ring have tournament-usable printings.
    expect(result.pinnedIndicesCount).toBe(2)
    expect(result.pinnedPrintingCount).toBe(6) // 6 tournament-usable printing rows
    // Intersection: creatures ∩ cards-with-commander-printings = 0 (Bolt/Sol Ring aren't creatures)
    expect(result.indices.length).toBe(0)
  })
})
