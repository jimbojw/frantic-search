// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { DisplayColumns } from '@frantic-search/shared'
import { Rarity, Finish } from '@frantic-search/shared'
import type { PrintingDisplayColumns } from '@frantic-search/shared'
import {
  buildFacesOf,
  buildScryfallIndex,
  buildPrintingScryfallIndex,
  buildPrintingScryfallGroupIndex,
  RARITY_LABELS,
  FINISH_LABELS,
  formatPrice,
  faceStat,
  fullCardName,
  parseView,
} from './app-utils'

// ---------------------------------------------------------------------------
// buildFacesOf
// ---------------------------------------------------------------------------

describe('buildFacesOf', () => {
  it('returns an empty map for empty input', () => {
    expect(buildFacesOf([])).toEqual(new Map())
  })

  it('maps single-face cards each to their own index', () => {
    const result = buildFacesOf([0, 1, 2])
    expect(result.get(0)).toEqual([0])
    expect(result.get(1)).toEqual([1])
    expect(result.get(2)).toEqual([2])
    expect(result.size).toBe(3)
  })

  it('groups multi-face cards under their canonical face', () => {
    // Face 0 is canonical for face 0 and face 1 (DFC);
    // Face 2 is a standalone card.
    const result = buildFacesOf([0, 0, 2])
    expect(result.get(0)).toEqual([0, 1])
    expect(result.get(2)).toEqual([2])
    expect(result.size).toBe(2)
  })

  it('handles multiple multi-face cards', () => {
    // Card A: faces 0,1  Card B: faces 2,3  Card C: face 4
    const result = buildFacesOf([0, 0, 2, 2, 4])
    expect(result.get(0)).toEqual([0, 1])
    expect(result.get(2)).toEqual([2, 3])
    expect(result.get(4)).toEqual([4])
    expect(result.size).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// buildScryfallIndex
// ---------------------------------------------------------------------------

describe('buildScryfallIndex', () => {
  it('returns an empty map for empty input', () => {
    expect(buildScryfallIndex([], [])).toEqual(new Map())
  })

  it('indexes only canonical faces', () => {
    const ids = ['aaa', 'bbb', 'ccc']
    const canonical = [0, 0, 2] // face 1 is a back face of card 0
    const result = buildScryfallIndex(ids, canonical)
    expect(result.get('aaa')).toBe(0)
    expect(result.has('bbb')).toBe(false)
    expect(result.get('ccc')).toBe(2)
    expect(result.size).toBe(2)
  })

  it('indexes all entries when every card is single-faced', () => {
    const ids = ['aaa', 'bbb', 'ccc']
    const canonical = [0, 1, 2]
    const result = buildScryfallIndex(ids, canonical)
    expect(result.size).toBe(3)
    expect(result.get('aaa')).toBe(0)
    expect(result.get('bbb')).toBe(1)
    expect(result.get('ccc')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// RARITY_LABELS / FINISH_LABELS
// ---------------------------------------------------------------------------

describe('RARITY_LABELS', () => {
  it('has a label for every Rarity constant', () => {
    expect(RARITY_LABELS[Rarity.Common]).toBe('Common')
    expect(RARITY_LABELS[Rarity.Uncommon]).toBe('Uncommon')
    expect(RARITY_LABELS[Rarity.Rare]).toBe('Rare')
    expect(RARITY_LABELS[Rarity.Mythic]).toBe('Mythic')
  })
})

describe('FINISH_LABELS', () => {
  it('has a label for every Finish constant', () => {
    expect(FINISH_LABELS[Finish.Nonfoil]).toBe('Nonfoil')
    expect(FINISH_LABELS[Finish.Foil]).toBe('Foil')
    expect(FINISH_LABELS[Finish.Etched]).toBe('Etched')
  })
})

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

describe('formatPrice', () => {
  it('returns an em dash for zero cents', () => {
    expect(formatPrice(0)).toBe('\u2014')
  })

  it('formats a whole dollar amount', () => {
    expect(formatPrice(100)).toBe('$1.00')
  })

  it('formats a single cent', () => {
    expect(formatPrice(1)).toBe('$0.01')
  })

  it('formats a large amount', () => {
    expect(formatPrice(12345)).toBe('$123.45')
  })

  it('formats an amount with a fractional cent correctly', () => {
    expect(formatPrice(99)).toBe('$0.99')
  })
})

// ---------------------------------------------------------------------------
// faceStat — helper to build minimal DisplayColumns stubs
// ---------------------------------------------------------------------------

function stubDisplay(overrides: Partial<DisplayColumns> = {}): DisplayColumns {
  return {
    names: [],
    mana_costs: [],
    type_lines: [],
    oracle_texts: [],
    powers: [0],
    toughnesses: [0],
    loyalties: [0],
    defenses: [0],
    color_identity: [],
    scryfall_ids: [],
    art_crop_thumb_hashes: [],
    card_thumb_hashes: [],
    layouts: [],
    legalities_legal: [],
    legalities_banned: [],
    legalities_restricted: [],
    power_lookup: [''],
    toughness_lookup: [''],
    loyalty_lookup: [''],
    defense_lookup: [''],
    canonical_face: [],
    ...overrides,
  }
}

describe('faceStat', () => {
  it('returns power/toughness when both exist', () => {
    const d = stubDisplay({
      powers: [1],
      toughnesses: [2],
      loyalties: [0],
      defenses: [0],
      power_lookup: ['', '2'],
      toughness_lookup: ['', '', '3'],
      loyalty_lookup: [''],
      defense_lookup: [''],
    })
    expect(faceStat(d, 0)).toBe('2/3')
  })

  it('returns loyalty when no power/toughness', () => {
    const d = stubDisplay({
      powers: [0],
      toughnesses: [0],
      loyalties: [1],
      defenses: [0],
      power_lookup: [''],
      toughness_lookup: [''],
      loyalty_lookup: ['', '4'],
      defense_lookup: [''],
    })
    expect(faceStat(d, 0)).toBe('Loyalty: 4')
  })

  it('returns defense when no power/toughness or loyalty', () => {
    const d = stubDisplay({
      powers: [0],
      toughnesses: [0],
      loyalties: [0],
      defenses: [1],
      power_lookup: [''],
      toughness_lookup: [''],
      loyalty_lookup: [''],
      defense_lookup: ['', '5'],
    })
    expect(faceStat(d, 0)).toBe('Defense: 5')
  })

  it('returns null when no stat exists', () => {
    const d = stubDisplay()
    expect(faceStat(d, 0)).toBeNull()
  })

  it('prioritizes power/toughness over loyalty', () => {
    const d = stubDisplay({
      powers: [1],
      toughnesses: [1],
      loyalties: [1],
      defenses: [0],
      power_lookup: ['', '0'],
      toughness_lookup: ['', '1'],
      loyalty_lookup: ['', '3'],
      defense_lookup: [''],
    })
    expect(faceStat(d, 0)).toBe('0/1')
  })
})

// ---------------------------------------------------------------------------
// fullCardName
// ---------------------------------------------------------------------------

describe('fullCardName', () => {
  it('returns a single face name', () => {
    const d = stubDisplay({ names: ['Lightning Bolt'] })
    expect(fullCardName(d, [0])).toBe('Lightning Bolt')
  })

  it('joins two face names with " // "', () => {
    const d = stubDisplay({ names: ['Delver of Secrets', 'Insectile Aberration'] })
    expect(fullCardName(d, [0, 1])).toBe('Delver of Secrets // Insectile Aberration')
  })

  it('returns empty string for no faces', () => {
    const d = stubDisplay({ names: ['Ignored'] })
    expect(fullCardName(d, [])).toBe('')
  })
})

// ---------------------------------------------------------------------------
// parseView
// ---------------------------------------------------------------------------

describe('parseView', () => {
  it('returns "card" when card param is present', () => {
    expect(parseView(new URLSearchParams('card=abc'))).toBe('card')
  })

  it('returns "report" when report param is present', () => {
    expect(parseView(new URLSearchParams('report'))).toBe('report')
  })

  it('returns "help" when help param is present', () => {
    expect(parseView(new URLSearchParams('help'))).toBe('help')
  })

  it('returns "search" for empty params', () => {
    expect(parseView(new URLSearchParams())).toBe('search')
  })

  it('returns "search" for unrelated params', () => {
    expect(parseView(new URLSearchParams('q=foo'))).toBe('search')
  })

  it('prioritizes card over report and help', () => {
    expect(parseView(new URLSearchParams('card=abc&report&help'))).toBe('card')
  })

  it('prioritizes report over help', () => {
    expect(parseView(new URLSearchParams('report&help'))).toBe('report')
  })
})

// ---------------------------------------------------------------------------
// buildPrintingScryfallIndex
// ---------------------------------------------------------------------------

function stubPrintingDisplay(overrides: Partial<PrintingDisplayColumns> = {}): PrintingDisplayColumns {
  return {
    scryfall_ids: [],
    collector_numbers: [],
    set_codes: [],
    set_names: [],
    rarity: [],
    finish: [],
    price_usd: [],
    canonical_face_ref: [],
    ...overrides,
  }
}

describe('buildPrintingScryfallIndex', () => {
  it('returns an empty map for empty input', () => {
    expect(buildPrintingScryfallIndex(stubPrintingDisplay())).toEqual(new Map())
  })

  it('maps each unique scryfall_id to its first printing index', () => {
    const pd = stubPrintingDisplay({
      scryfall_ids: ['aaa', 'bbb', 'ccc'],
      canonical_face_ref: [0, 1, 2],
    })
    const result = buildPrintingScryfallIndex(pd)
    expect(result.size).toBe(3)
    expect(result.get('aaa')).toBe(0)
    expect(result.get('bbb')).toBe(1)
    expect(result.get('ccc')).toBe(2)
  })

  it('keeps the first index when finish variants share a scryfall_id', () => {
    const pd = stubPrintingDisplay({
      scryfall_ids: ['aaa', 'aaa', 'bbb'],
      canonical_face_ref: [0, 0, 1],
    })
    const result = buildPrintingScryfallIndex(pd)
    expect(result.size).toBe(2)
    expect(result.get('aaa')).toBe(0)
    expect(result.get('bbb')).toBe(2)
  })

  it('handles multiple printings of the same card across sets', () => {
    const pd = stubPrintingDisplay({
      scryfall_ids: ['print-a', 'print-b', 'print-c'],
      canonical_face_ref: [5, 5, 5],
    })
    const result = buildPrintingScryfallIndex(pd)
    expect(result.size).toBe(3)
    expect(result.get('print-a')).toBe(0)
    expect(result.get('print-b')).toBe(1)
    expect(result.get('print-c')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// buildPrintingScryfallGroupIndex
// ---------------------------------------------------------------------------

describe('buildPrintingScryfallGroupIndex', () => {
  it('returns an empty map for empty input', () => {
    expect(buildPrintingScryfallGroupIndex(stubPrintingDisplay())).toEqual(new Map())
  })

  it('maps a unique scryfall_id to a single-element array', () => {
    const pd = stubPrintingDisplay({
      scryfall_ids: ['aaa', 'bbb'],
    })
    const result = buildPrintingScryfallGroupIndex(pd)
    expect(result.size).toBe(2)
    expect(result.get('aaa')).toEqual([0])
    expect(result.get('bbb')).toEqual([1])
  })

  it('groups finish variants that share a scryfall_id', () => {
    const pd = stubPrintingDisplay({
      scryfall_ids: ['aaa', 'aaa', 'bbb'],
      finish: [Finish.Nonfoil, Finish.Foil, Finish.Nonfoil],
    })
    const result = buildPrintingScryfallGroupIndex(pd)
    expect(result.size).toBe(2)
    expect(result.get('aaa')).toEqual([0, 1])
    expect(result.get('bbb')).toEqual([2])
  })

  it('preserves insertion order within a group', () => {
    const pd = stubPrintingDisplay({
      scryfall_ids: ['x', 'x', 'x'],
      finish: [Finish.Nonfoil, Finish.Foil, Finish.Etched],
    })
    const result = buildPrintingScryfallGroupIndex(pd)
    expect(result.get('x')).toEqual([0, 1, 2])
  })
})
