// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { NodeCache, index, printingIndex, TEST_DATA, TEST_PRINTING_DATA, CardFlag, Format } from '@frantic-search/shared'
import { CardIndex } from '@frantic-search/shared'
import { PrintingIndex } from '@frantic-search/shared'
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
    expect(result.pinnedPrintingCount).toBe(9) // 9 tournament-usable printing rows (Bolt: 7, Sol: 2)
    expect(result.hasPrintingConditions).toBe(true)
    expect(result.uniqueMode).toBe('cards')
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
    expect(result.pinnedPrintingCount).toBe(3) // MH2 has 3 printings (rows 0,1,9)
    expect(result.hasPrintingConditions).toBe(true)
    expect(result.uniqueMode).toBe('cards')
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
    expect(result.pinnedPrintingCount).toBe(8) // Bolt has 8 printings in fixture (0,1,2,5,6,8,9,10), others have none
    expect(result.uniqueMode).toBe('prints')
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
    expect(result.pinnedPrintingCount).toBe(3) // MH2 printings of Bolt (rows 0,1,9)
    expect(result.indices.length).toBe(1) // intersection: red + Bolt = 1
    expect(result.printingIndices?.length).toBe(3) // intersection of printings
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
    expect(result.pinnedPrintingCount).toBe(9) // 9 tournament-usable printing rows (Bolt: 7, Sol: 2)
    // Intersection: creatures ∩ cards-with-commander-printings = 0 (Bolt/Sol Ring aren't creatures)
    expect(result.indices.length).toBe(0)
  })

  it('pinned-only view:images returns pinnedPrintingCount when viewMode is images', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 'view:images', viewMode: 'images' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    // view:images is display-only; no printing conditions. But viewMode triggers printing count for display.
    expect(result.pinnedIndicesCount).toBeGreaterThan(0)
    expect(result.pinnedPrintingCount).toBeDefined()
    expect(result.pinnedPrintingCount).toBeGreaterThan(result.pinnedIndicesCount!)
  })

  it('pinned-only view:images without viewMode does not return pinnedPrintingCount', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 'view:images' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    expect(result.pinnedIndicesCount).toBeGreaterThan(0)
    expect(result.pinnedPrintingCount).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Default playable filter (Spec 057)
// ---------------------------------------------------------------------------

// Fixture with a "funny" card: Dismember (face 9) has legalities_legal=0
const funnyData = {
  ...TEST_DATA,
  legalities_legal: [
    ...TEST_DATA.legalities_legal.slice(0, 9),
    0, // face 9 (Dismember): not legal in any format
  ],
  flags: [
    ...TEST_DATA.flags.slice(0, 9),
    CardFlag.Funny, // face 9 (Dismember): funny
  ],
}
const funnyIndex = new CardIndex(funnyData)
const funnyPrintingIndex = new PrintingIndex(TEST_PRINTING_DATA)
const funnyCache = new NodeCache(funnyIndex, funnyPrintingIndex)

// Fixture with a restricted-only card (Balance-like): face 9 has legal=0, restricted=Vintage
const restrictedOnlyData = {
  ...TEST_DATA,
  legalities_legal: [
    ...TEST_DATA.legalities_legal.slice(0, 9),
    0, // face 9: not legal anywhere
  ],
  legalities_restricted: [
    ...TEST_DATA.legalities_restricted.slice(0, 9),
    Format.Vintage, // face 9: restricted in Vintage (playable)
  ],
}
const restrictedOnlyIndex = new CardIndex(restrictedOnlyData)
const restrictedOnlyCache = new NodeCache(restrictedOnlyIndex, funnyPrintingIndex)

describe('default playable filter (Spec 057)', () => {
  it('excludes cards not legal or restricted in any format by default', () => {
    // t:instant matches 4 cards: Bolt, Counterspell, Azorius Charm, Dismember.
    // Dismember has legalities_legal=0, so the playable filter excludes it.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(3)
  })

  it('includes cards that are restricted-only (e.g. Balance in Vintage) by default', () => {
    // t:instant matches 4 cards. Face 9 is restricted in Vintage, so playable.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: restrictedOnlyCache,
      index: restrictedOnlyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(4)
    expect(result.indicesIncludingExtras).toBeUndefined()
  })

  it('populates indicesIncludingExtras when filter removes results', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.indicesIncludingExtras).toBe(4)
  })

  it('does not populate indicesIncludingExtras when filter removes nothing', () => {
    // t:creature matches cards all legal somewhere
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.indicesIncludingExtras).toBeUndefined()
  })

  it('include:extras bypasses the playable filter', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant include:extras' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    // Dismember included because include:extras skips filter
    expect(result.indices.length).toBe(4)
    expect(result.indicesIncludingExtras).toBeUndefined()
  })

  it('include:extras in pinned query bypasses the filter', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant', pinnedQuery: 'include:extras' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(4)
    expect(result.indicesIncludingExtras).toBeUndefined()
  })

  it('excludes non-tournament printings by default with unique:prints', () => {
    // Bolt has printings 0,1,2,5,6,8,9,10 (row 6 GoldBorder). Sol Ring has 3-7 (row 7 Oversized).
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    // Bolt has 8 printings (0,1,2,5,6,8,9,10). Filter removes #6 (GoldBorder) → 7 remain.
    expect(result.printingIndices).toBeDefined()
    expect(Array.from(result.printingIndices!)).not.toContain(6)
    expect(result.printingIndices!.length).toBe(7)
  })

  it('populates printingIndicesIncludingExtras when filter removes printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.printingIndicesIncludingExtras).toBe(8)
  })

  it('include:extras shows non-tournament printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning include:extras' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    // All 8 Bolt printings including #6 (GoldBorder)
    expect(result.printingIndices!.length).toBe(8)
    expect(result.printingIndicesIncludingExtras).toBeUndefined()
  })

  it('filters printings of not-legal-anywhere cards too', () => {
    // is:funny matches Dismember (face 9). It has no printings in the fixture,
    // but the card-level filter should still exclude it.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'is:funny' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.indicesIncludingExtras).toBe(1)
  })

  it('histograms reflect filtered results, not unfiltered', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    // 3 instants after filtering (Bolt=R, Counterspell=U, Azorius Charm=WU)
    const totalFromHistogram = result.histograms.cardType[2] // instant bucket
    expect(totalFromHistogram).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Issue #58: Set query zero results when no playable printings match
// ---------------------------------------------------------------------------
// Fixture: set:wcd matches only printing #6 (Bolt in World Championship Decks),
// which has GoldBorder and is filtered out by the playable filter.
describe('set query zero results when no playable printings (Issue #58)', () => {
  it('set query with all printings filtered returns 0 results and populates extras hint', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:wcd' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.indicesIncludingExtras).toBe(1)
    expect(result.printingIndicesIncludingExtras).toBe(1)
  })

  it('set query with include:extras shows non-tournament printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:wcd include:extras' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1)
    expect(result.printingIndices?.length).toBe(1)
    expect(result.indicesIncludingExtras).toBeUndefined()
    expect(result.printingIndicesIncludingExtras).toBeUndefined()
  })

  it('set query with tournament printings unchanged', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:mh2' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1)
    expect(result.indicesIncludingExtras).toBeUndefined()
  })

  it('set + face condition with all printings filtered returns 0 results', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:wcd t:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    // Bolt is instant, not creature; intersection is empty before playable filter
    expect(result.indices.length).toBe(0)
  })

  it('face-only query unchanged when no printing conditions', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBeGreaterThan(0)
    expect(result.hasPrintingConditions).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Issue #96: Pinned my:list + live unique:prints applies override
// ---------------------------------------------------------------------------
describe('pinned my:list + live unique:prints override (Issue #96)', () => {
  const getListMask = () => {
    const faceMask = new Uint8Array(index.faceCount)
    faceMask[3] = 1 // Sol Ring (oracle-level)
    const printingMask = new Uint8Array(printingIndex.printingCount)
    printingMask[1] = 1 // Bolt foil (printing-level)
    return { faceMask, printingMask }
  }
  const cacheWithList = new NodeCache(index, printingIndex, getListMask)

  it('pinned my:list + live unique:prints applies override (2 printings)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints', pinnedQuery: 'my:list' },
      cache: cacheWithList,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.hasPrintingConditions).toBe(true)
    expect(result.uniqueMode).toBe('prints')
    // Override: Bolt foil (1) + Sol Ring canonical nonfoil (3) = 2 printings
    expect(result.printingIndices).toBeDefined()
    expect(result.printingIndices!.length).toBe(2)
    expect(Array.from(result.printingIndices!)).toContain(1)
    expect(Array.from(result.printingIndices!)).toContain(3)
  })

  it('pinned unique:prints + live my:list applies override (2 printings)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'my:list', pinnedQuery: 'unique:prints' },
      cache: cacheWithList,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.hasPrintingConditions).toBe(true)
    expect(result.uniqueMode).toBe('prints')
    expect(result.printingIndices).toBeDefined()
    expect(result.printingIndices!.length).toBe(2)
    expect(Array.from(result.printingIndices!)).toContain(1)
    expect(Array.from(result.printingIndices!)).toContain(3)
  })
})

// ---------------------------------------------------------------------------
// Spec 097: aggregation counts for card-level queries
// ---------------------------------------------------------------------------

describe('aggregation counts (Spec 097)', () => {
  it('card-level query expands printings for aggregation count display', () => {
    // t:instant is card-only; evaluator does not return printingIndices.
    // Worker expands so display can show aggregation counts.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.hasPrintingConditions).toBe(false)
    expect(result.uniqueMode).toBe('cards')
    expect(result.printingIndices).toBeDefined()
    // Bolt has 8 printings (0,1,2,5,6,8,9,10); others have none
    expect(result.printingIndices!.length).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Spec 082: dual counts on breakdown nodes
// ---------------------------------------------------------------------------

describe('dual counts (Spec 082)', () => {
  it('toBreakdown propagates matchCountCards and matchCountPrints to BreakdownNode', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant set:mh2' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.breakdown).toBeDefined()
    const bd = result.breakdown!
    expect(bd.matchCountCards).toBe(1)
    expect(bd.matchCountPrints).toBe(3)
    expect(bd.children).toHaveLength(2)
    const [tInstant, setMh2] = bd.children!
    expect(tInstant.matchCountCards).toBe(4)
    expect(tInstant.matchCountPrints).toBe(8)
    expect(setMh2.matchCountPrints).toBe(3)
    expect(setMh2.matchCountCards).toBe(1)
  })
})
