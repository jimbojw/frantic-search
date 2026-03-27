// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import {
  getCompletionContext,
  computeSuggestion,
  applyCompletion,
  type AutocompleteData,
  type CompletionContext,
} from './query-autocomplete'

function makeData(overrides: Partial<AutocompleteData> = {}): AutocompleteData {
  return {
    fieldAliases: { u: 'unique', unique: 'unique', set: 'set', s: 'set', t: 'type', type: 'type', c: 'color', r: 'rarity', f: 'legal', kw: 'keyword', keyword: 'keyword' },
    names: ['Griselbrand', 'Llanowar Elves', 'Lightning Bolt', 'Llanowar Wastes'],
    typeLines: ['Legendary Creature — Demon', 'Creature — Elf Druid', 'Instant', 'Land'],
    setCodes: ['usg', 'ulg', 'uma', '2xm'],
    rarityNames: { common: 1, uncommon: 2, rare: 4, mythic: 8 },
    formatNames: { commander: 2048, modern: 64 },
    colorNames: { w: 1, u: 2, b: 4, r: 8, g: 16, white: 1, blue: 2 },
    isKeywords: ['foil', 'dfc', 'creature', 'vanilla'],
    oracleTagLabels: [],
    illustrationTagLabels: [],
    keywordLabels: [],
    ...overrides,
  }
}

describe('getCompletionContext', () => {
  it('returns field context when WORD precedes colon', () => {
    expect(getCompletionContext('set:', 4)).toEqual({ type: 'field', prefix: 'set', tokenStart: 0, tokenEnd: 3, fieldName: undefined })
    expect(getCompletionContext('u ', 1)).toEqual({ type: 'field', prefix: 'u', tokenStart: 0, tokenEnd: 1, fieldName: undefined })
    expect(getCompletionContext('t:cre', 5)?.type).toBe('value') // cursor in value
  })

  it('returns field context when partial field before operator', () => {
    expect(getCompletionContext('se', 2)).toEqual({ type: 'field', prefix: 'se', tokenStart: 0, tokenEnd: 2, fieldName: undefined })
  })

  it('returns value context for set: prefix', () => {
    const ctx = getCompletionContext('set:u', 5)
    expect(ctx?.type).toBe('value')
    expect(ctx?.fieldName).toBe('set')
    expect(ctx?.prefix).toBe('u')
  })

  it('returns value context for t:cre', () => {
    const ctx = getCompletionContext('t:cre', 5)
    expect(ctx?.type).toBe('value')
    expect(ctx?.fieldName).toBe('type')
    expect(ctx?.prefix).toBe('cre')
  })

  it('returns exact-name context for !"gris', () => {
    const ctx = getCompletionContext('!"gris', 6)
    expect(ctx?.type).toBe('exact-name')
    expect(ctx?.prefix).toBe('gris')
  })

  it('returns bare context for standalone word', () => {
    const ctx = getCompletionContext('llan', 4)
    expect(ctx?.type).toBe('bare')
    expect(ctx?.prefix).toBe('llan')
  })

  it('returns null for operators, regex, parens', () => {
    expect(getCompletionContext(':', 1)).toBeNull()
    expect(getCompletionContext('(', 1)).toBeNull()
    expect(getCompletionContext('/foo/', 5)).toBeNull()
  })

  it('returns null for empty query', () => {
    expect(getCompletionContext('', 0)).toBeNull()
  })

  it('returns null when cursor in value of field:value pair', () => {
    // "set:usg" - cursor in "usg" is value context, not bare
    const ctx = getCompletionContext('set:usg', 7)
    expect(ctx?.type).toBe('value')
  })

  it('handles cursor at token boundary', () => {
    // Cursor right after "set" before ":"
    const ctx = getCompletionContext('set:u', 3)
    expect(ctx?.type).toBe('field')
    expect(ctx?.prefix).toBe('set')
  })

  it('returns value context for name>M (Spec 097)', () => {
    const ctx = getCompletionContext('name>M', 6)
    expect(ctx?.type).toBe('value')
    expect(ctx?.fieldName).toBe('name')
    expect(ctx?.prefix).toBe('M')
  })

  it('returns value context for name>=Lightning (Spec 097)', () => {
    // Cursor at end of "Lightning" (position 15)
    const ctx = getCompletionContext('name>=Lightning', 15)
    expect(ctx?.type).toBe('value')
    expect(ctx?.fieldName).toBe('name')
    expect(ctx?.prefix).toBe('Lightning')
  })
})

describe('computeSuggestion', () => {
  const data = makeData()

  it('suggests field name for u prefix', () => {
    const ctx = getCompletionContext('u', 1)!
    expect(computeSuggestion(ctx, data)).toBe('unique')
  })

  it('suggests set code for set:u', () => {
    const ctx = getCompletionContext('set:u', 5)!
    const s = computeSuggestion(ctx, data)
    expect(['uma', 'ulg', 'usg', '2xm']).toContain(s)
    expect(s?.toLowerCase().startsWith('u')).toBe(true)
  })

  it('suggests creature for t:cre', () => {
    const ctx = getCompletionContext('t:cre', 5)!
    expect(computeSuggestion(ctx, data)).toBe('creature')
  })

  it('suggests Griselbrand for exact name !"gris', () => {
    const ctx = getCompletionContext('!"gris', 6)!
    const s = computeSuggestion(ctx, data)
    expect(s).toBe('"Griselbrand"')
  })

  it('suggests first word only for bare llan', () => {
    const ctx = getCompletionContext('llan', 4)!
    const s = computeSuggestion(ctx, data)
    expect(s).toBe('Llanowar')
  })

  it('suggests single-word name fully', () => {
    const ctx = getCompletionContext('grise', 5)!
    const s = computeSuggestion(ctx, data)
    expect(s).toBe('Griselbrand')
  })

  it('returns null when no match', () => {
    const ctx = getCompletionContext('set:zzz', 7)
    expect(ctx).not.toBeNull()
    expect(computeSuggestion(ctx!, data)).toBeNull()
  })

  it('suggests oracle tag for otag:ram', () => {
    const tagData = makeData({ oracleTagLabels: ['ramp', 'removal', 'rampage'] })
    const ctx = getCompletionContext('otag:ram', 7)!
    expect(computeSuggestion(ctx, tagData)).toBe('ramp')
  })

  it('suggests display:full for display:f', () => {
    const ctx = getCompletionContext('display:f', 9)! // cursor after "f"
    expect(computeSuggestion(ctx, data)).toBe('full')
  })

  it('suggests view:images for v:i', () => {
    const ctx = getCompletionContext('v:i', 3)!
    expect(computeSuggestion(ctx, data)).toBe('images')
  })

  it('suggests order:name for order:n', () => {
    const ctx = getCompletionContext('order:n', 7)!
    expect(computeSuggestion(ctx, data)).toBe('name')
  })

  it('suggests sort:usd for sort:u', () => {
    const ctx = getCompletionContext('sort:u', 6)!
    expect(computeSuggestion(ctx, data)).toBe('usd')
  })

  it('suggests illustration tag for atag:cha', () => {
    const tagData = makeData({ illustrationTagLabels: ['chair', 'champion', 'chaos'] })
    const ctx = getCompletionContext('atag:cha', 8)!
    expect(computeSuggestion(ctx, tagData)).toBe('chair')
  })

  it('art: uses same data as atag:', () => {
    const tagData = makeData({ illustrationTagLabels: ['foot', 'foo', 'forest'] })
    const ctx = getCompletionContext('art:fo', 6)!
    expect(computeSuggestion(ctx, tagData)).toBe('foot')
  })

  it('returns null for otag: when oracle tags not loaded', () => {
    const ctx = getCompletionContext('otag:ramp', 8)!
    expect(computeSuggestion(ctx, data)).toBeNull()
  })

  it('ft:e has value context with fieldName flavor, not set (no spurious set completion)', () => {
    const ctx = getCompletionContext('ft:e', 4)
    expect(ctx).not.toBeNull()
    expect(ctx!.type).toBe('value')
    expect(ctx!.fieldName).toBe('flavor')
    expect(ctx!.prefix).toBe('e')
    // flavor has no value autocomplete — must not fall through to set completion
    const dataWithSetE = makeData({ setCodes: ['eld', 'emn', 'eve'] })
    expect(computeSuggestion(ctx!, dataWithSetE)).toBeNull()
  })

  it('suggests keyword for kw:fly', () => {
    const tagData = makeData({ keywordLabels: ['flying', 'first strike', 'flash'] })
    const ctx = getCompletionContext('kw:fly', 6)
    expect(ctx).not.toBeNull()
    expect(computeSuggestion(ctx!, tagData)).toBe('flying')
  })

  it('suggests keyword for keyword:dea', () => {
    const tagData = makeData({ keywordLabels: ['deathtouch', 'defender', 'double strike'] })
    const ctx = getCompletionContext('keyword:dea', 11)!
    expect(computeSuggestion(ctx, tagData)).toBe('deathtouch')
  })

  it('returns null for kw: when keywords not loaded', () => {
    const ctx = getCompletionContext('kw:flying', 8)!
    expect(computeSuggestion(ctx, data)).toBeNull()
  })

  it('suggests Proce for a:pro when artistTagLabels has Proce (Spec 149)', () => {
    const tagData = makeData({ artistTagLabels: ['Proce', 'Vincent', 'Murphy', 'Scott'] })
    const ctx = getCompletionContext('a:pro', 5)!
    expect(ctx.fieldName).toBe('artist')
    expect(computeSuggestion(ctx, tagData)).toBe('Proce')
  })

  it('suggests Vincent for artist:vin (substring match)', () => {
    const tagData = makeData({ artistTagLabels: ['Proce', 'Vincent', 'Murphy'] })
    const ctx = getCompletionContext('artist:vin', 10)!
    expect(computeSuggestion(ctx, tagData)).toBe('Vincent')
  })

  it('returns null for a: when artistTagLabels empty', () => {
    const ctx = getCompletionContext('a:pro', 5)!
    expect(computeSuggestion(ctx, data)).toBeNull()
  })

  it('returns null for empty data names', () => {
    const ctx = getCompletionContext('!"gris', 6)!
    expect(computeSuggestion(ctx, makeData({ names: [] }))).toBeNull()
  })

  it('suggests card name for name>M, not manavalue (Spec 097)', () => {
    const dataWithM = makeData({ names: ['Griselbrand', 'Llanowar Elves', 'Lightning Bolt', 'Mountain', 'Llanowar Wastes'] })
    const ctx = getCompletionContext('name>M', 6)!
    expect(ctx.type).toBe('value')
    expect(ctx.fieldName).toBe('name')
    const s = computeSuggestion(ctx, dataWithM)
    expect(s).toBe('Mountain')
    expect(s).not.toBe('manavalue')
  })

  it('suggests card name for name:bolt (Spec 097)', () => {
    const dataWithBolt = makeData({ names: ['Bolt', 'Lightning Bolt', 'Griselbrand'] })
    const ctx = getCompletionContext('name:bolt', 9)!
    expect(ctx.type).toBe('value')
    const s = computeSuggestion(ctx, dataWithBolt)
    expect(s).toBe('Bolt')
  })

  it('suggests card name for name:L (Spec 097)', () => {
    const ctx = getCompletionContext('name:L', 6)!
    expect(ctx.type).toBe('value')
    const s = computeSuggestion(ctx, data)
    // Stops at first space: "Llanowar Elves" → "Llanowar"
    expect(s).toBe('Llanowar')
  })

  it('suggests card name for name:Light prefix (Spec 097)', () => {
    const ctx = getCompletionContext('name:Light', 10)!
    // Stops at first space: "Lightning Bolt" → "Lightning"
    expect(computeSuggestion(ctx, data)).toBe('Lightning')
  })

  it('stops name suggestion at first whitespace (avoids bare word)', () => {
    const dataWithMulti = makeData({ names: ['Mine Security', 'Mountain', 'Mox Diamond'] })
    const ctx = getCompletionContext('name>M', 6)!
    const s = computeSuggestion(ctx, dataWithMulti)
    expect(s).toBe('Mine')
    expect(s).not.toBe('Mine Security')
  })
})

describe('applyCompletion', () => {
  it('replaces field token and positions cursor', () => {
    const ctx = getCompletionContext('u ', 1)!
    const { newQuery, newCursor } = applyCompletion('u ', 1, 'unique', ctx)
    expect(newQuery).toBe('unique ')
    expect(newCursor).toBe(6)
  })

  it('replaces value token for set:u', () => {
    const ctx = getCompletionContext('set:u', 5)!
    const { newQuery, newCursor } = applyCompletion('set:u', 5, 'usg', ctx)
    expect(newQuery).toBe('set:usg')
    expect(newCursor).toBe(7)
  })

  it('replaces exact name and adds closing quote', () => {
    const ctx = getCompletionContext('!"gris', 6)!
    const suggestion = computeSuggestion(ctx, makeData())!
    const { newQuery, newCursor } = applyCompletion('!"gris', 6, suggestion, ctx)
    expect(newQuery).toBe('!"Griselbrand"')
    expect(newCursor).toBe(14)
  })

  it('replaces bare word with single word', () => {
    const ctx = getCompletionContext('llan', 4)!
    const { newQuery, newCursor } = applyCompletion('llan', 4, 'Llanowar', ctx)
    expect(newQuery).toBe('Llanowar')
    expect(newCursor).toBe(8)
  })

  it('field completion after colon preserves operator (o:create → oracle:create)', () => {
    const fieldO: CompletionContext = {
      type: 'field',
      prefix: 'o',
      tokenStart: 0,
      tokenEnd: 1,
    }
    const { newQuery, newCursor } = applyCompletion(
      'o:create creature token',
      2,
      'oracle',
      fieldO,
    )
    expect(newQuery).toBe('oracle:create creature token')
    expect(newCursor).toBe(7)
  })

  it('field completion on colon uses legacy slice (o|:create → oracle:create)', () => {
    const ctx = getCompletionContext('o:create creature token', 1)!
    expect(ctx.type).toBe('field')
    const { newQuery, newCursor } = applyCompletion(
      'o:create creature token',
      1,
      'oracle',
      ctx,
    )
    expect(newQuery).toBe('oracle:create creature token')
    // Legacy path (cursor <= tokenEnd): caret lands after inserted field name only (index 6).
    expect(newCursor).toBe(6)
  })
})
