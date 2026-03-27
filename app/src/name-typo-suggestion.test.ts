// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { ColumnarData } from '@frantic-search/shared'
import { CardIndex, Format, NodeCache, parse } from '@frantic-search/shared'
import { sealQuery } from './query-edit'
import { buildNameTypoSuggestion } from './name-typo-suggestion'

/** Two cards: one supplies `hearthfire` as a name word only; the other is the intended `heartfire hero` match. */
function hearthfireHeroSpellcheckFixture(): ColumnarData {
  const n = 2
  const z = <T>(v: T): T[] => Array.from({ length: n }, () => v)
  return {
    names: ['Hearthfire Sprite', 'Heartfire Hero'],
    mana_costs: z(''),
    oracle_texts: z(''),
    colors: z(0),
    color_identity: z(0),
    type_lines: z('Creature'),
    powers: z(0),
    toughnesses: z(0),
    loyalties: z(0),
    defenses: z(0),
    legalities_legal: z(Format.Commander),
    legalities_banned: z(0),
    legalities_restricted: z(0),
    card_index: [0, 1],
    canonical_face: [0, 1],
    scryfall_ids: z(''),
    oracle_ids: z('oid'),
    layouts: z('normal'),
    flags: z(0),
    edhrec_ranks: z(null),
    edhrec_salts: z(null),
    power_lookup: [''],
    toughness_lookup: [''],
    loyalty_lookup: [''],
    defense_lookup: [''],
    keywords_index: {},
    produces: {},
  }
}

describe('buildNameTypoSuggestion', () => {
  it('suggests heartfire when hearthfire and hero are both nameWords but no card matches both (Spec 163)', () => {
    const index = new CardIndex(hearthfireHeroSpellcheckFixture())
    expect(index.nameWords.has('hearthfire')).toBe(true)
    expect(index.nameWords.has('heartfire')).toBe(true)
    expect(index.nameWords.has('hero')).toBe(true)

    const cache = new NodeCache(index, null)
    const live = 'hearthfire hero'
    const ast = parse(live)
    expect(cache.evaluate(ast).result.matchCount).toBe(0)

    const s = buildNameTypoSuggestion({
      ast,
      liveQuery: live,
      index,
      cache,
      printingIndex: null,
      hasPinned: false,
      pinnedQueryTrim: '',
      pinnedIndicesCount: undefined,
      hasLive: true,
      totalCards: 0,
      includeExtras: false,
      viewMode: 'slim',
      sealQuery,
    })

    expect(s).toBeDefined()
    expect(s!.id).toBe('name-typo')
    expect(s!.query!.toLowerCase()).toContain('heartfire')
    expect(s!.query!.toLowerCase()).toContain('hero')
    expect(s!.count).toBeGreaterThan(0)
  })
})
