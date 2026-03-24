// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { collectNonexistentFieldRewrites, getNonexistentFieldRewrite } from './nonexistent-field-registry'

function spliceQuery(query: string, span: { start: number; end: number }, replacement: string): string {
  return query.slice(0, span.start) + replacement + query.slice(span.end)
}

describe('getNonexistentFieldRewrite', () => {
  test('returns metadata for subtype and supertype', () => {
    expect(getNonexistentFieldRewrite('subtype')?.canonical).toBe('t')
    expect(getNonexistentFieldRewrite('supertype')?.canonical).toBe('t')
  })

  test('returns null for unknown fields', () => {
    expect(getNonexistentFieldRewrite('t')).toBeNull()
    expect(getNonexistentFieldRewrite('type')).toBeNull()
  })
})

describe('collectNonexistentFieldRewrites', () => {
  test('subtype:elf → t:elf', () => {
    const q = 'subtype:elf'
    const [r] = collectNonexistentFieldRewrites(q)
    expect(r.label).toBe('t:elf')
    expect(spliceQuery(q, r.span, r.label)).toBe('t:elf')
    expect(r.docRef).toBe('reference/fields/face/type')
  })

  test('supertype:legendary → t:legendary', () => {
    const q = 'supertype:legendary'
    const [r] = collectNonexistentFieldRewrites(q)
    expect(r.label).toBe('t:legendary')
  })

  test('-subtype:elf → -t:elf with NOT span', () => {
    const q = '-subtype:elf'
    const [r] = collectNonexistentFieldRewrites(q)
    expect(r.label).toBe('-t:elf')
    expect(q.slice(r.span.start, r.span.end)).toBe('-subtype:elf')
    expect(spliceQuery(q, r.span, r.label)).toBe('-t:elf')
  })

  test('subtype:/elf/ → t:/elf/', () => {
    const q = 'subtype:/elf/'
    const [r] = collectNonexistentFieldRewrites(q)
    expect(r.label).toBe('t:/elf/')
  })

  test('-subtype:/elf/ → -t:/elf/', () => {
    const q = '-subtype:/elf/'
    const [r] = collectNonexistentFieldRewrites(q)
    expect(r.label).toBe('-t:/elf/')
  })

  test('empty subtype: or supertype: yields nothing', () => {
    expect(collectNonexistentFieldRewrites('subtype:')).toEqual([])
    expect(collectNonexistentFieldRewrites('supertype:')).toEqual([])
  })

  test('t:elf does not trigger', () => {
    expect(collectNonexistentFieldRewrites('t:elf')).toEqual([])
  })

  test('quoted value preserved in label', () => {
    const q = 'subtype:"elvish mystic"'
    const [r] = collectNonexistentFieldRewrites(q)
    expect(r.label).toBe('t:"elvish mystic"')
  })

  test('compound query: two distinct rewrites', () => {
    const q = 'subtype:goblin supertype:legendary'
    const rs = collectNonexistentFieldRewrites(q)
    expect(rs).toHaveLength(2)
    const queries = new Set(rs.map((r) => spliceQuery(q, r.span, r.label)))
    expect(queries.size).toBe(2)
  })

  test('duplicate mistaken clauses yield distinct splice outcomes', () => {
    const q = 'subtype:a subtype:a'
    const rs = collectNonexistentFieldRewrites(q)
    expect(rs).toHaveLength(2)
    const outcomes = rs.map((r) => spliceQuery(q.trim(), r.span, r.label))
    expect(new Set(outcomes).size).toBe(2)
  })
})
