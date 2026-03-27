// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { NodeCache, index, printingIndex, TEST_DATA, TEST_PRINTING_DATA, CardFlag, Format } from '@frantic-search/shared'
import type { OracleTagData } from '@frantic-search/shared'

const FIXTURE_ORACLE_TAGS: OracleTagData = {
  ramp: [0, 3, 4],
}
const tagDataForOtagTests = {
  oracle: FIXTURE_ORACLE_TAGS,
  illustration: null,
  flavor: null,
  artist: null,
} as const
import { CardIndex } from '@frantic-search/shared'
import { PrintingIndex } from '@frantic-search/shared'
import { emptyUrlLiveQuerySuggestionPool } from './worker-empty-url-suggestions'
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

describe('usedExtension (Spec 085)', () => {
  it('is false for unique:prints (Scryfall-supported; not Frantic-only syntax)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 't:instant unique:prints' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.uniqueMode).toBe('prints')
    expect(result.usedExtension).toBe(false)
  })

  it('is true for ** (Frantic-only include:extras sugar)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature **' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.includeExtras).toBe(true)
    expect(result.usedExtension).toBe(true)
  })

  it('is false for include:extras alone', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature include:extras' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.includeExtras).toBe(true)
    expect(result.usedExtension).toBe(false)
  })

  it('is true when query uses salt field', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'salt>0' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.usedExtension).toBe(true)
  })

  it('is true for effective query with partial date when pinned + live', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'date=202', pinnedQuery: 'c:r' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.usedExtension).toBe(true)
  })

  it('is true for usd=null (Spec 080)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'usd=null' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.usedExtension).toBe(true)
  })

  it('empty URL starter path sets usedExtension false', () => {
    const result = runSearch({
      msg: {
        type: 'search',
        queryId: 1,
        query: '',
        pinnedQuery: '',
        emptyUrlLiveQuery: true,
      },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.usedExtension).toBe(false)
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
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
  })

  it('populates include-extras suggestion when filter removes results', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    const ext = result.suggestions.find((s) => s.id === 'include-extras')
    expect(ext).toBeDefined()
    expect(ext!.priority).toBe(90)
    expect(ext!.count).toBe(4)
  })

  it('does not populate include-extras suggestion when filter removes nothing', () => {
    // t:creature matches cards all legal somewhere
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
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
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
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
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
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

  it('populates include-extras suggestion when filter removes printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning' },
      cache: funnyCache,
      index: funnyIndex,
      printingIndex: funnyPrintingIndex,
      sessionSalt,
    })
    const ext = result.suggestions.find((s) => s.id === 'include-extras')
    expect(ext).toBeDefined()
    expect(ext!.priority).toBe(90)
    expect(ext!.printingCount).toBe(8)
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
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
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
    const ext = result.suggestions.find((s) => s.id === 'include-extras')
    expect(ext?.count).toBe(1)
    expect(ext!.priority).toBe(90)
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
    const ext = result.suggestions.find((s) => s.id === 'include-extras')
    expect(ext?.count).toBe(1)
    expect(ext?.printingCount).toBe(1)
    expect(ext!.priority).toBe(90)
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
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
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
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
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
// Spec 121: Pinned my:list + live unique:prints (printing-only, no override)
// ---------------------------------------------------------------------------
describe('pinned my:list + live unique:prints (Spec 121)', () => {
  const getListMask = () => ({
    printingIndices: new Uint32Array([1, 3]), // Bolt foil (printing-level) + Sol Ring canonical nonfoil (generic)
  })
  const cacheWithList = new NodeCache(index, printingIndex, getListMask)

  it('pinned my:list + live unique:prints returns 2 printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints', pinnedQuery: 'my:list' },
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

  it('pinned unique:prints + live my:list returns 2 printings', () => {
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
// Spec 087: aggregation counts for card-level queries
// ---------------------------------------------------------------------------

describe('aggregation counts (Spec 087)', () => {
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

describe('quoted values in breakdown (issue 133)', () => {
  it('toBreakdown preserves quotes in oracle field label', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'o:"destroy all creatures" ci:white' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.breakdown).toBeDefined()
    const bd = result.breakdown!
    expect(bd.children).toHaveLength(2)
    const oracleChild = bd.children!.find(c => c.label.startsWith('o:'))
    expect(oracleChild).toBeDefined()
    expect(oracleChild!.label).toBe('o:"destroy all creatures"')
  })
})

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

describe('oracle hint (Spec 131)', () => {
  it('zero results with trailing bare tokens yields oracle suggestion when oracle variant returns results', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'lightning ci:r deal 3' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const oracle = result.suggestions.find((s) => s.id === 'oracle')
    expect(oracle).toBeDefined()
    expect(oracle!.query).toContain('o:')
    expect(oracle!.label).toContain('o:')
    expect(oracle!.count).toBeGreaterThan(0)
    expect(oracle!.priority).toBe(20)
  })

  it('(xyc OR abc) with zero results does not trigger oracle suggestion', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '(xyc OR abc)' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.suggestions.find((s) => s.id === 'oracle')).toBeUndefined()
  })

  it('non-zero results does not populate oracle suggestion', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBeGreaterThan(0)
    expect(result.suggestions.find((s) => s.id === 'oracle')).toBeUndefined()
  })

  it('otag bare-term-upgrade uses priority 21 (Spec 151; sorts after oracle 20)', () => {
    const cacheWithTags = new NodeCache(index, printingIndex, null, {
      oracle: FIXTURE_ORACLE_TAGS,
      illustration: null,
      flavor: null,
      artist: null,
    })
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'ramp' },
      cache: cacheWithTags,
      index,
      printingIndex,
      sessionSalt,
      tagData: tagDataForOtagTests,
    })
    expect(result.indices.length).toBe(0)
    const otagChip = result.suggestions.find((s) => s.id === 'bare-term-upgrade' && s.label === 'otag:ramp')
    expect(otagChip).toBeDefined()
    expect(otagChip!.priority).toBe(21)
  })

  it('kw bare-term-upgrade stays priority 16 (before oracle and otag chips)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'landfall' },
      cache,
      index,
      printingIndex,
      sessionSalt,
      keywordLabels: ['landfall'],
    })
    expect(result.indices.length).toBe(0)
    const kwChip = result.suggestions.find((s) => s.id === 'bare-term-upgrade' && s.label === 'kw:landfall')
    expect(kwChip).toBeDefined()
    expect(kwChip!.priority).toBe(16)
  })
})

describe('wrong-field suggestions (Spec 153)', () => {
  it('is:white with zero results yields ci:/c:/produces: suggestions', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'is:white' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wrongField = result.suggestions.filter((s) => s.id === 'wrong-field')
    expect(wrongField.length).toBeGreaterThan(0)
    const labels = wrongField.map((s) => s.label)
    expect(labels).toContain('ci:w')
    expect(labels).toContain('c:w')
    expect(labels).toContain('produces:w')
  })

  it('t:white (alias) with zero results yields ci:/c:/produces: suggestions', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:white' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wrongField = result.suggestions.filter((s) => s.id === 'wrong-field')
    expect(wrongField.length).toBeGreaterThan(0)
    const labels = wrongField.map((s) => s.label)
    expect(labels).toContain('ci:w')
    expect(labels).toContain('c:w')
    expect(labels).toContain('produces:w')
  })

  it('type:commander with zero results yields f:/is: suggestions', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'type:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wrongField = result.suggestions.filter((s) => s.id === 'wrong-field')
    expect(wrongField.length).toBeGreaterThan(0)
    const labels = wrongField.map((s) => s.label)
    expect(labels).toContain('f:commander')
    expect(labels).toContain('is:commander')
  })

  it('t:commander (alias) with zero results yields f:/is: suggestions', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wrongField = result.suggestions.filter((s) => s.id === 'wrong-field')
    expect(wrongField.length).toBeGreaterThan(0)
    const labels = wrongField.map((s) => s.label)
    expect(labels).toContain('f:commander')
    expect(labels).toContain('is:commander')
  })

  it('in:commander with zero results yields f:/is: suggestions', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'in:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wrongField = result.suggestions.filter((s) => s.id === 'wrong-field')
    expect(wrongField.length).toBeGreaterThan(0)
    const labels = wrongField.map((s) => s.label)
    expect(labels).toContain('f:commander')
    expect(labels).toContain('is:commander')
  })
})

describe('nonexistent-field suggestions (Spec 158)', () => {
  it('subtype:elf alone yields t:elf rewrite without counts', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'subtype:elf' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    const nf = result.suggestions.filter((s) => s.id === 'nonexistent-field')
    expect(nf).toHaveLength(1)
    expect(nf[0].label).toBe('t:elf')
    expect(nf[0].query).toBe('t:elf')
    expect(nf[0].priority).toBe(14)
    expect(nf[0].variant).toBe('rewrite')
    expect(nf[0].count).toBeUndefined()
    expect(nf[0].printingCount).toBeUndefined()
    expect(nf[0].docRef).toBe('reference/fields/face/type')
  })

  it('compound query with matches still suggests nonexistent-field (rider context)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'ci:g subtype:elf' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBeGreaterThan(0)
    const nf = result.suggestions.filter((s) => s.id === 'nonexistent-field')
    expect(nf).toHaveLength(1)
    expect(nf[0].label).toBe('t:elf')
    expect(nf[0].query).toBe('ci:g t:elf')
  })

  it('-subtype:elf suggests -t:elf', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '-subtype:elf' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    const nf = result.suggestions.filter((s) => s.id === 'nonexistent-field')
    expect(nf).toHaveLength(1)
    expect(nf[0].label).toBe('-t:elf')
    expect(nf[0].query).toBe('-t:elf')
  })

  it('subtype:/elf/ suggests t:/elf/', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'subtype:/elf/' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    const nf = result.suggestions.filter((s) => s.id === 'nonexistent-field')
    expect(nf).toHaveLength(1)
    expect(nf[0].label).toBe('t:/elf/')
  })

  it('subtype: with empty value does not emit nonexistent-field', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'subtype:' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.suggestions.filter((s) => s.id === 'nonexistent-field')).toHaveLength(0)
  })

  it('t:elf does not emit nonexistent-field', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:elf' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.suggestions.filter((s) => s.id === 'nonexistent-field')).toHaveLength(0)
  })
})

describe('operator relaxation suggestions (Spec 156)', () => {
  it('c=r with creature constraint yields relaxed c:r when that query matches', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'c=r t:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const relaxed = result.suggestions.filter((s) => s.id === 'relaxed')
    expect(relaxed.some((s) => s.label === 'c:r')).toBe(true)
    for (const s of relaxed) {
      expect(s.priority).toBe(24)
    }
  })

  it('ci=w with instant constraint yields relaxed ci>=w when that query matches', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'ci=w t:instant' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const relaxed = result.suggestions.filter((s) => s.id === 'relaxed')
    expect(relaxed.some((s) => s.label === 'ci>=w')).toBe(true)
  })

  it('ci=wu with creature constraint yields relaxed ci:wu', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'ci=wu t:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const relaxed = result.suggestions.filter((s) => s.id === 'relaxed')
    expect(relaxed.some((s) => s.label === 'ci:wu')).toBe(true)
  })

  it('numeric ci= does not emit relaxed suggestions', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'ci=2' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.suggestions.filter((s) => s.id === 'relaxed')).toHaveLength(0)
  })

  it('negated -c=r does not emit relaxed suggestions for that term', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '-c=r name:zzznopeaaa' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.suggestions.filter((s) => s.id === 'relaxed')).toHaveLength(0)
  })

  it('trailing comma after term is dropped in suggested query', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'c=r, t:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const relaxed = result.suggestions.filter((s) => s.id === 'relaxed')
    expect(relaxed.length).toBeGreaterThan(0)
    for (const s of relaxed) {
      expect(s.query).not.toContain('c:r,')
    }
  })
})

describe('stray comma suggestions (Spec 157)', () => {
  it('CSV-style value commas yield stray-comma when cleaned query matches', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't=creature, c=g' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const stray = result.suggestions.filter((s) => s.id === 'stray-comma')
    expect(stray).toHaveLength(1)
    expect(stray[0].priority).toBe(23)
    expect(stray[0].query).toBe('t=creature c=g')
    expect(stray[0].label).toBe('t=creature')
    expect(stray[0].count).toBeGreaterThan(0)
  })

  it('emits stray-comma at priority 23 and keeps suggestions priority-sorted', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't=creature, c=g' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const stray = result.suggestions.filter((s) => s.id === 'stray-comma')
    expect(stray).toHaveLength(1)
    expect(stray[0].priority).toBe(23)
    const pri = result.suggestions.map((s) => s.priority)
    expect([...pri].sort((a, b) => a - b)).toEqual(pri)
  })
})

describe('artist-atag suggestions (Spec 153)', () => {
  const illustrationTags = new Map<string, Uint32Array>([
    ['chair', new Uint32Array([0, 2, 5])],
    ['foot', new Uint32Array([3, 4])],
  ])
  const artistIndex: Record<string, number[]> = {
    'vincent proce': [0, 0, 0, 1, 0, 2],
    'scott murphy': [0, 3, 0, 4],
  }
  const tagData = {
    oracle: null,
    illustration: illustrationTags,
    flavor: null,
    artist: artistIndex,
  }
  const cacheWithTags = new NodeCache(index, printingIndex, null, tagData)

  it('a:chair with zero results yields atag:chair suggestion', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'a:chair' },
      cache: cacheWithTags,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const artistAtag = result.suggestions.filter((s) => s.id === 'artist-atag')
    expect(artistAtag.length).toBeGreaterThan(0)
    const labels = artistAtag.map((s) => s.label)
    expect(labels).toContain('atag:chair')
  })

  it('atag:proce with zero results yields a:proce suggestion', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'atag:proce' },
      cache: cacheWithTags,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const artistAtag = result.suggestions.filter((s) => s.id === 'artist-atag')
    expect(artistAtag.length).toBeGreaterThan(0)
    const labels = artistAtag.map((s) => s.label)
    expect(labels).toContain('a:proce')
  })

  it('artist-atag suggestion has correct priority and explain', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'a:chair' },
      cache: cacheWithTags,
      index,
      printingIndex,
      sessionSalt,
    })
    const artistAtag = result.suggestions.find((s) => s.id === 'artist-atag')
    expect(artistAtag).toBeDefined()
    expect(artistAtag!.priority).toBe(25)
    expect(artistAtag!.explain).toBe('Use atag: for illustration tags.')
  })
})

describe('Spec 155: empty URL live query suggestions', () => {
  it('returns sampled starter suggestions when emptyUrlLiveQuery is set', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', emptyUrlLiveQuery: true },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.suggestions).toHaveLength(3)
    expect(result.suggestions[0]).toMatchObject({
      id: 'example-query',
      variant: 'rewrite',
    })
    const allowed = new Set(emptyUrlLiveQuerySuggestionPool().map((s) => s.query))
    for (const s of result.suggestions) {
      expect(allowed.has(s.query)).toBe(true)
    }
    const lens = result.suggestions.map((s) => (s.query ?? '').length)
    expect(lens[1]!).toBeGreaterThanOrEqual(lens[0]!)
    expect(lens[2]!).toBeGreaterThanOrEqual(lens[1]!)
  })

  it('rejects empty live query without emptyUrlLiveQuery', () => {
    expect(() =>
      runSearch({
        msg: { type: 'search', queryId: 1, query: '' },
        cache,
        index,
        printingIndex,
        sessionSalt,
      }),
    ).toThrow()
  })
})
