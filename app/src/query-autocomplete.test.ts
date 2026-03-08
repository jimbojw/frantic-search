// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { getCompletionContext, computeSuggestion, applyCompletion, type AutocompleteData } from './query-autocomplete'

function makeData(overrides: Partial<AutocompleteData> = {}): AutocompleteData {
  return {
    fieldAliases: { u: 'unique', unique: 'unique', set: 'set', s: 'set', t: 'type', type: 'type', c: 'color', r: 'rarity', f: 'legal' },
    names: ['Griselbrand', 'Llanowar Elves', 'Lightning Bolt', 'Llanowar Wastes'],
    typeLines: ['Legendary Creature — Demon', 'Creature — Elf Druid', 'Instant', 'Land'],
    setCodes: ['usg', 'ulg', 'uma', '2xm'],
    rarityNames: { common: 1, uncommon: 2, rare: 4, mythic: 8 },
    formatNames: { commander: 2048, modern: 64 },
    colorNames: { w: 1, u: 2, b: 4, r: 8, g: 16, white: 1, blue: 2 },
    isKeywords: ['foil', 'dfc', 'creature', 'vanilla'],
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
})
