// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import {
  NodeCache,
  index,
  printingIndex,
  TEST_DATA,
  TEST_PRINTING_DATA,
  CardFlag,
  Color,
  Format,
  CardIndex,
} from '@frantic-search/shared'
import type { ColumnarData, OracleTagData } from '@frantic-search/shared'

const FIXTURE_ORACLE_TAGS: OracleTagData = {
  ramp: [0, 3, 4],
}
const tagDataForOtagTests = {
  oracle: FIXTURE_ORACLE_TAGS,
  illustration: null,
  flavor: null,
  artist: null,
} as const
import { PrintingIndex } from '@frantic-search/shared'
import { emptyUrlLiveQuerySuggestionPool } from './worker-empty-url-suggestions'
import { runSearch } from './worker-search'

const cache = new NodeCache(index, printingIndex)

const sessionSalt = 12345

/** Spec 131 hybrid / Issue #221: bare AND fails; primaries 0; raptor o:double matches. */
const RAPTOR_DOUBLE_HYBRID_DATA: ColumnarData = {
  names: ['Savage Raptor'],
  mana_costs: ['{2}{R}'],
  oracle_texts: ['Double the tokens you create.'],
  colors: [Color.Red],
  color_identity: [Color.Red],
  type_lines: ['Creature — Dinosaur'],
  powers: [2],
  toughnesses: [2],
  loyalties: [0],
  defenses: [0],
  legalities_legal: [Format.Commander | Format.Legacy],
  legalities_banned: [0],
  legalities_restricted: [0],
  card_index: [0],
  canonical_face: [0],
  scryfall_ids: [''],
  oracle_ids: ['oid-raptor-double'],
  art_crop_thumb_hashes: [''],
  card_thumb_hashes: [''],
  layouts: ['normal'],
  flags: [0],
  edhrec_ranks: [null],
  edhrec_salts: [null],
  power_lookup: ['', '0', '3'],
  toughness_lookup: ['', '1', '3'],
  loyalty_lookup: [''],
  defense_lookup: [''],
  keywords_index: {},
  produces: {},
}

/** Phrase primary wins; hybrid must not override (Spec 131). */
const GAMMA_DELTA_PHRASE_DATA: ColumnarData = {
  names: ['Epsilon Whelp'],
  mana_costs: ['{U}'],
  oracle_texts: ['When gamma delta triggers, draw a card.'],
  colors: [Color.Blue],
  color_identity: [Color.Blue],
  type_lines: ['Creature — Dragon'],
  powers: [2],
  toughnesses: [2],
  loyalties: [0],
  defenses: [0],
  legalities_legal: [Format.Commander | Format.Legacy],
  legalities_banned: [0],
  legalities_restricted: [0],
  card_index: [0],
  canonical_face: [0],
  scryfall_ids: [''],
  oracle_ids: ['oid-gamma-delta'],
  art_crop_thumb_hashes: [''],
  card_thumb_hashes: [''],
  layouts: ['normal'],
  flags: [0],
  edhrec_ranks: [null],
  edhrec_salts: [null],
  power_lookup: ['', '0', '3'],
  toughness_lookup: ['', '1', '3'],
  loyalty_lookup: [''],
  defense_lookup: [''],
  keywords_index: {},
  produces: {},
}

describe('runSearch pinned lip counts (issue #52)', () => {
  it('pinned-only format query returns pinnedIndicesCount (oracle-level)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '', pinnedQuery: 'f:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    // f:commander is face-domain (oracle-level): all 9 cards are commander-legal.
    expect(result.pinnedIndicesCount).toBe(9)
    expect(result.hasPrintingConditions).toBe(false)
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

  it('both non-empty pinned format query is oracle-level', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature', pinnedQuery: 'f:commander' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedBreakdown).toBeDefined()
    // f:commander is face-domain (oracle-level): all 9 cards are commander-legal.
    expect(result.pinnedIndicesCount).toBe(9)
    // Intersection: creatures ∩ commander-legal = creatures (4 creatures, all commander-legal)
    expect(result.indices.length).toBe(4)
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
// Default inclusion filter (Spec 178)
// ---------------------------------------------------------------------------

// Fixture: face 9 (Dismember) has ContentWarning flag.
// All legalities are kept from TEST_DATA (Dismember is legal in formats).
// Spec 178: legality no longer gates default inclusion.
const contentWarningData = {
  ...TEST_DATA,
  flags: [
    ...TEST_DATA.flags.slice(0, 9),
    CardFlag.ContentWarning, // face 9: content warning
  ],
}
const contentWarningIndex = new CardIndex(contentWarningData)
const contentWarningCache = new NodeCache(contentWarningIndex, printingIndex)

// Fixture: face 9 (Dismember) is a token layout (extras-layout omission).
const tokenLayoutData = {
  ...TEST_DATA,
  layouts: [
    ...TEST_DATA.layouts.slice(0, 9),
    'token', // face 9: token layout
  ],
}
const tokenLayoutIndex = new CardIndex(tokenLayoutData)
const tokenLayoutCache = new NodeCache(tokenLayoutIndex, printingIndex)

// Fixture: printing data with playtest promo type on printing #8 (SLD Bolt).
// promo_types_flags_1 bit 0 = playtest.
const playtestPrintingData = {
  ...TEST_PRINTING_DATA,
  promo_types_flags_1: [
    ...TEST_PRINTING_DATA.promo_types_flags_1!.slice(0, 8),
    (TEST_PRINTING_DATA.promo_types_flags_1![8]) | 1, // printing #8: add playtest
    ...TEST_PRINTING_DATA.promo_types_flags_1!.slice(9),
  ],
}
const playtestPrintingIndex = new PrintingIndex(playtestPrintingData)
const playtestCache = new NodeCache(index, playtestPrintingIndex)

// Fixture: printing data with a printing in wholesale-omit set "past".
const wholesaleOmitPrintingData = {
  ...TEST_PRINTING_DATA,
  set_lookup: [
    ...TEST_PRINTING_DATA.set_lookup,
    { code: "PAST", name: "Astral", released_at: 19980101 },
  ],
  set_indices: [
    ...TEST_PRINTING_DATA.set_indices.slice(0, 8),
    7, // printing #8: set "PAST" (wholesale omit)
    ...TEST_PRINTING_DATA.set_indices.slice(9),
  ],
}
const wholesaleOmitPrintingIndex = new PrintingIndex(wholesaleOmitPrintingData)
const wholesaleOmitCache = new NodeCache(index, wholesaleOmitPrintingIndex)

describe('default inclusion filter (Spec 178)', () => {
  it('content-warning faces excluded by default (card-only path)', () => {
    // t:instant matches 4 faces. Face 9 has ContentWarning → excluded.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: contentWarningCache,
      index: contentWarningIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(3)
  })

  it('is:content_warning widens content-warning omission', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant is:content_warning' },
      cache: contentWarningCache,
      index: contentWarningIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1) // only face 9 matches both t:instant AND is:content_warning
  })

  it('token-layout faces excluded by default (card-only path)', () => {
    // Face 9 has layout=token. t:instant matches 4 faces; after default filter, 3 remain.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: tokenLayoutCache,
      index: tokenLayoutIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(3)
  })

  it('is:token widens extras-layout omission', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'is:token' },
      cache: tokenLayoutCache,
      index: tokenLayoutIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1) // face 9 (token)
  })

  it('include:extras bypasses all default omission passes', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant include:extras' },
      cache: contentWarningCache,
      index: contentWarningIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(4)
    expect(result.indicesBeforeDefaultFilter).toBeUndefined()
  })

  it('include:extras in pinned query bypasses the filter', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant', pinnedQuery: 'include:extras' },
      cache: contentWarningCache,
      index: contentWarningIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(4)
  })

  it('populates include-extras suggestion when filter removes results', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: contentWarningCache,
      index: contentWarningIndex,
      printingIndex,
      sessionSalt,
    })
    const ext = result.suggestions.find((s) => s.id === 'include-extras')
    expect(ext).toBeDefined()
    expect(ext!.priority).toBe(90)
    expect(ext!.count).toBe(4)
    expect(result.indicesBeforeDefaultFilter).toBe(4)
  })

  it('does not populate include-extras suggestion when filter removes nothing', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:creature' },
      cache: contentWarningCache,
      index: contentWarningIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
    expect(result.indicesBeforeDefaultFilter).toBeUndefined()
  })

  it('excludes gold-bordered set printings by default (wholesale omit)', () => {
    // Bolt has 8 printings (0,1,2,5,6,8,9,10). #6 in WC01 (DEFAULT_OMIT_SET_CODES) excluded.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.printingIndices).toBeDefined()
    expect(Array.from(result.printingIndices!)).not.toContain(6)
    expect(result.printingIndices!.length).toBe(7)
  })

  it('populates include-extras suggestion when filter removes printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    const ext = result.suggestions.find((s) => s.id === 'include-extras')
    expect(ext).toBeDefined()
    expect(ext!.priority).toBe(90)
    expect(ext!.printingCount).toBe(8)
    expect(result.printingIndicesBeforeDefaultFilter).toBe(8)
  })

  it('include:extras shows non-tournament printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning include:extras' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.printingIndices!.length).toBe(8)
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
  })

  it('playtest printing excluded by default', () => {
    // Bolt has printings 0,1,2,5,6,8,9,10. Printing #8 has playtest, #6 has GoldBorder.
    // Both should be excluded from unique:prints lightning.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning' },
      cache: playtestCache,
      index,
      printingIndex: playtestPrintingIndex,
      sessionSalt,
    })
    expect(result.printingIndices).toBeDefined()
    expect(Array.from(result.printingIndices!)).not.toContain(8) // playtest excluded
    expect(Array.from(result.printingIndices!)).not.toContain(6) // GoldBorder excluded
    expect(result.printingIndices!.length).toBe(6) // 8 total - #6 - #8
  })

  it('is:playtest widens playtest omission', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'is:playtest' },
      cache: playtestCache,
      index,
      printingIndex: playtestPrintingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1) // face 1 (Bolt via printing #8)
  })

  it('wholesale-omit set printing excluded by default', () => {
    // Printing #8 is in set PAST. unique:prints lightning includes it in
    // raw results, but the default filter wholesale-omits it.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'unique:prints lightning' },
      cache: wholesaleOmitCache,
      index,
      printingIndex: wholesaleOmitPrintingIndex,
      sessionSalt,
    })
    expect(result.printingIndices).toBeDefined()
    expect(Array.from(result.printingIndices!)).not.toContain(8) // PAST excluded
    expect(Array.from(result.printingIndices!)).not.toContain(6) // GoldBorder excluded
    expect(result.printingIndices!.length).toBe(6) // 8 total - #6 - #8
  })

  it('positive set: widens wholesale-omit set', () => {
    // set:past is both the filter AND the widener. The positive prefix "past"
    // set-widens printing #8 through the wholesale-omit check.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:past' },
      cache: wholesaleOmitCache,
      index,
      printingIndex: wholesaleOmitPrintingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1) // Bolt face survives via widened printing
  })

  it('set: widening restores gold-bordered set printings', () => {
    // set:wc01 matches printing #6 (WC01, in DEFAULT_OMIT_SET_CODES). The positive
    // set: prefix "wc01" widens that printing through the wholesale-omit pass.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:wc01' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1)
    expect(result.printingIndices?.length).toBe(1)
  })

  it('wholesale-omit set excludes face when all printings in omit set (card-only query)', () => {
    // Sol Ring (face 3) has printings #3, #4, #7. Move all to set PAST.
    const allPastData = {
      ...TEST_PRINTING_DATA,
      set_lookup: [
        ...TEST_PRINTING_DATA.set_lookup,
        { code: "PAST", name: "Astral", released_at: 19980101 },
      ],
      set_indices: [
        ...TEST_PRINTING_DATA.set_indices.slice(0, 3),
        7, 7, // printings #3, #4 → PAST
        ...TEST_PRINTING_DATA.set_indices.slice(5, 7),
        7, // printing #7 → PAST
        ...TEST_PRINTING_DATA.set_indices.slice(8),
      ],
    }
    const allPastPIdx = new PrintingIndex(allPastData)
    const allPastCache = new NodeCache(index, allPastPIdx)
    // "sol" is a bare word query (card-only, no printing conditions).
    // Sol Ring should be excluded because all its printings are in PAST.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'sol' },
      cache: allPastCache,
      index,
      printingIndex: allPastPIdx,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.indicesBeforeDefaultFilter).toBe(1)
  })

  it('playtest promo excludes face when all printings are playtest (card-only query)', () => {
    // Make ALL Sol Ring printings (#3, #4, #7) have playtest promo.
    const allPlaytestData = {
      ...TEST_PRINTING_DATA,
      promo_types_flags_1: [
        ...TEST_PRINTING_DATA.promo_types_flags_1!.slice(0, 3),
        TEST_PRINTING_DATA.promo_types_flags_1![3] | 1, // #3: playtest
        TEST_PRINTING_DATA.promo_types_flags_1![4] | 1, // #4: playtest
        ...TEST_PRINTING_DATA.promo_types_flags_1!.slice(5, 7),
        TEST_PRINTING_DATA.promo_types_flags_1![7] | 1, // #7: playtest (already Oversized too)
        ...TEST_PRINTING_DATA.promo_types_flags_1!.slice(8),
      ],
    }
    const allPlaytestPIdx = new PrintingIndex(allPlaytestData)
    const allPlaytestCache = new NodeCache(index, allPlaytestPIdx)
    // "sol" bare word → Sol Ring. All printings have playtest → face excluded.
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'sol' },
      cache: allPlaytestCache,
      index,
      printingIndex: allPlaytestPIdx,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.indicesBeforeDefaultFilter).toBe(1)
  })

  it('legality no longer gates default inclusion', () => {
    // Face 9 has legalities_legal=0 but no omission-pass flags.
    // Under Spec 178 it passes the default filter (no layout/playtest/set/CW/mask).
    const neverLegalData = {
      ...TEST_DATA,
      legalities_legal: [...TEST_DATA.legalities_legal.slice(0, 9), 0],
    }
    const neverLegalIndex = new CardIndex(neverLegalData)
    const neverLegalCache = new NodeCache(neverLegalIndex, printingIndex)
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: neverLegalCache,
      index: neverLegalIndex,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(4) // all 4 instants survive
  })

  it('histograms reflect filtered results, not unfiltered', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:instant' },
      cache: contentWarningCache,
      index: contentWarningIndex,
      printingIndex,
      sessionSalt,
    })
    const totalFromHistogram = result.histograms.cardType[2] // instant bucket
    expect(totalFromHistogram).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Issue #58 / Spec 178: set: widening restores gold-bordered set printings
// ---------------------------------------------------------------------------
// Fixture: set:wc01 matches only printing #6 (Bolt in World Championship Decks 2001),
// which is in DEFAULT_OMIT_SET_CODES. Positive set:wc01 widens it.
describe('set query with gold-bordered set printings (Issue #58 + Spec 178)', () => {
  it('set:wc01 self-widens gold-bordered set printing (Spec 178)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:wc01' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(1)
    expect(result.printingIndices?.length).toBe(1)
    expect(result.suggestions.find((s) => s.id === 'include-extras')).toBeUndefined()
  })

  it('set query with include:extras also shows gold-bordered set printings', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:wc01 include:extras' },
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

  it('set + face condition with no matching face returns 0 results', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'set:wc01 t:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
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
    expect(oracle!.label).toMatch(/o:deal|deal/)
  })

  it('prefers per-word over ordered-regex when both match the same count (Spec 131 tie rule)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'ci:r damage target' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const oracle = result.suggestions.find((s) => s.id === 'oracle')
    expect(oracle).toBeDefined()
    expect(oracle!.label).toContain('o:damage')
    expect(oracle!.label).toContain('o:target')
    expect(oracle!.label).not.toMatch(/^o:\/.+\/$/)
  })

  it('does not emit ordered-regex oracle when a trailing token is not regex-safe (Spec 131)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'add {C}{C}' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const oracle = result.suggestions.find((s) => s.id === 'oracle')
    expect(oracle).toBeDefined()
    expect(oracle!.label).not.toMatch(/^o:\/.+\/$/)
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

  it('oracle coexists with multi-word otag prefix chips; oracle sorts first (issue #209)', () => {
    const oracleTags209: OracleTagData = {
      'target-opponent-a': [0],
      'target-opponent-b': [1],
      'target-opponent-c': [2],
    }
    const tagRef = {
      oracle: oracleTags209,
      illustration: null,
      flavor: null,
      artist: null,
    } as const
    const cache209 = new NodeCache(index, printingIndex, null, tagRef)
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'target opponent' },
      cache: cache209,
      index,
      printingIndex,
      sessionSalt,
      tagData: tagRef,
    })
    expect(result.indices.length).toBe(0)
    const oracle = result.suggestions.find((s) => s.id === 'oracle')
    expect(oracle).toBeDefined()
    expect(oracle!.query).toContain('o:')
    expect(oracle!.label.toLowerCase()).toContain('target')
    expect(oracle!.count).toBeGreaterThan(0)
    expect(oracle!.priority).toBe(20)
    const otagChips = result.suggestions.filter(
      (s) => s.id === 'bare-term-upgrade' && s.label.startsWith('otag:'),
    )
    expect(otagChips.length).toBeGreaterThanOrEqual(1)
    expect(otagChips[0]!.priority).toBe(21)
    const sorted = [...result.suggestions].sort((a, b) => a.priority - b.priority)
    const oracleIdx = sorted.findIndex((s) => s.id === 'oracle')
    const firstOtagIdx = sorted.findIndex(
      (s) => s.id === 'bare-term-upgrade' && s.label.startsWith('otag:'),
    )
    expect(oracleIdx).toBeLessThan(firstOtagIdx)
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
    expect(result.suggestions.find((s) => s.id === 'oracle')).toBeUndefined()
  })

  it('single-token hybrid suggests raptor o:double when primaries fail (Spec 131 / issue #221)', () => {
    const idx = new CardIndex(RAPTOR_DOUBLE_HYBRID_DATA)
    const localCache = new NodeCache(idx, null)
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'raptor double' },
      cache: localCache,
      index: idx,
      printingIndex: null,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const oracle = result.suggestions.find((s) => s.id === 'oracle')
    expect(oracle).toBeDefined()
    if (!oracle) return
    expect(oracle.query?.trim()).toBe('raptor o:double')
    expect(oracle.label).toBe('o:double')
    expect(oracle.count).toBe(1)
  })

  it('phrase primary wins; hybrid does not override (Spec 131)', () => {
    const idx = new CardIndex(GAMMA_DELTA_PHRASE_DATA)
    const localCache = new NodeCache(idx, null)
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'gamma delta' },
      cache: localCache,
      index: idx,
      printingIndex: null,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const oracle = result.suggestions.find((s) => s.id === 'oracle')
    expect(oracle).toBeDefined()
    if (!oracle) return
    expect(oracle.query?.trim()).toBe('o:"gamma delta"')
    expect(oracle.label).toBe('o:"gamma delta"')
    expect(oracle.count).toBe(1)
  })
})

describe('name-token spellcheck (Spec 163)', () => {
  it('zero results with typo bare token suggests corrected query', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'thallia guardian' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const typo = result.suggestions.find((s) => s.id === 'name-typo')
    expect(typo).toBeDefined()
    expect(typo!.priority).toBe(17)
    expect(typo!.label).toBe('thalia')
    expect(typo!.query!.toLowerCase()).toContain('thalia')
    expect(typo!.query!.toLowerCase()).toContain('guardian')
    expect(typo!.count).toBeGreaterThan(0)
  })

  it('does not emit name-typo when pinned alone matches nothing (Spec 131 guard)', () => {
    const result = runSearch({
      msg: {
        type: 'search',
        queryId: 1,
        query: 'thallia guardian',
        pinnedQuery: 'name:ZxYzAbC123Nope',
      },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.pinnedIndicesCount).toBe(0)
    expect(result.suggestions.find((s) => s.id === 'name-typo')).toBeUndefined()
  })

  it('field-only zero query has no name-typo (no bare tokens)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 't:phonytype123xyz' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    expect(result.suggestions.find((s) => s.id === 'name-typo')).toBeUndefined()
  })

  it('name-typo sorts before oracle when both apply', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'thallia guardian' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const typo = result.suggestions.find((s) => s.id === 'name-typo')
    const oracle = result.suggestions.find((s) => s.id === 'oracle')
    expect(typo).toBeDefined()
    if (oracle) {
      expect(typo!.priority).toBeLessThan(oracle.priority)
    }
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

  it('is:instant suggests t:instant when replacement matches cards', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'is:instant' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wf = result.suggestions.filter((s) => s.id === 'wrong-field')
    const tChip = wf.find((s) => s.label === 't:instant')
    expect(tChip).toBeDefined()
    expect(tChip!.count).toBeGreaterThan(0)
    expect(tChip!.query?.replace(/\s+/g, ' ').trim()).toBe('t:instant')
  })

  it('is:flying suggests kw:flying pedagogically even when count is zero', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'is:flying' },
      cache,
      index,
      printingIndex,
      sessionSalt,
      keywordLabels: ['flying'],
    })
    expect(result.indices.length).toBe(0)
    const wf = result.suggestions.filter((s) => s.id === 'wrong-field')
    const kw = wf.find((s) => s.label === 'kw:flying')
    expect(kw).toBeDefined()
    expect(kw!.query?.replace(/\s+/g, ' ').trim()).toBe('kw:flying')
    expect(kw!.count).toBeUndefined()
  })

  it('is:white does not emit kw:/t: wrong-field chips (color excluded)', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'is:white' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    const wf = result.suggestions.filter((s) => s.id === 'wrong-field')
    expect(wf.some((s) => s.label.startsWith('kw:'))).toBe(false)
    expect(wf.some((s) => s.label.startsWith('t:'))).toBe(false)
    expect(wf.some((s) => s.label === 'ci:w')).toBe(true)
  })

  it('not:creature suggests -t:creature when count > 0', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'not:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wf = result.suggestions.filter((s) => s.id === 'wrong-field')
    const chip = wf.find((s) => s.label === '-t:creature')
    expect(chip).toBeDefined()
    expect(chip!.count).toBeGreaterThan(0)
  })

  it('-not:creature suggests t:creature when count > 0', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: '-not:creature' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBe(0)
    const wf = result.suggestions.filter((s) => s.id === 'wrong-field')
    const chip = wf.find((s) => s.label === 't:creature')
    expect(chip).toBeDefined()
    expect(chip!.count).toBeGreaterThan(0)
  })

  it('lightning is:instant yields results and wrong-field t:instant rider-style chip', () => {
    const result = runSearch({
      msg: { type: 'search', queryId: 1, query: 'lightning is:instant' },
      cache,
      index,
      printingIndex,
      sessionSalt,
    })
    expect(result.indices.length).toBeGreaterThan(0)
    const wf = result.suggestions.filter((s) => s.id === 'wrong-field')
    const tChip = wf.find((s) => s.label === 't:instant')
    expect(tChip).toBeDefined()
    expect(tChip!.query).toContain('t:instant')
    expect(tChip!.query).toContain('lightning')
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
