// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { BreakdownNode } from '@frantic-search/shared'
import { parseBreakdown } from './query-edit-core'
import { toggleSimple, cycleChip } from './query-edit-chips'

function buildBreakdown(query: string): BreakdownNode {
  return parseBreakdown(query)!
}

const MV_FIELDS = ['mv', 'cmc', 'manavalue']
const TYPE_FIELDS = ['t', 'type']
const FORMAT_FIELDS = ['f', 'format', 'legal']
const IS_FIELDS = ['is']

// ---------------------------------------------------------------------------
// Graduated: Mana Value
// ---------------------------------------------------------------------------

describe('toggleSimple — mana value', () => {
  const drill3 = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: MV_FIELDS, operator: '=', negated: false, value: '3', appendTerm: 'mv=3' })
  const drill5 = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: MV_FIELDS, operator: '=', negated: false, value: '5', appendTerm: 'mv=5' })
  const exclude3 = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: MV_FIELDS, operator: '=', negated: true, value: '3', appendTerm: '-mv=3' })

  it('appends mv=3 to empty query', () => {
    expect(drill3('', null)).toBe('mv=3')
  })

  it('no change when mv=3 already exists', () => {
    const q = 'mv=3'
    expect(drill3(q, buildBreakdown(q))).toBe('mv=3')
  })

  it('removes -mv=3 when drilling (un-exclude)', () => {
    const q = '-mv=3'
    expect(drill3(q, buildBreakdown(q))).toBe('')
  })

  it('appends second MV term independently', () => {
    const q = 'mv=3'
    expect(drill5(q, buildBreakdown(q))).toBe('mv=3 mv=5')
  })

  it('appends -mv=3 to empty query', () => {
    expect(exclude3('', null)).toBe('-mv=3')
  })

  it('no change when -mv=3 already exists', () => {
    const q = '-mv=3'
    expect(exclude3(q, buildBreakdown(q))).toBe('-mv=3')
  })

  it('removes mv=3 when excluding (less of this)', () => {
    const q = 'mv=3'
    expect(exclude3(q, buildBreakdown(q))).toBe('')
  })

  it('handles alias: removes cmc=3 when excluding', () => {
    const q = 'cmc=3'
    expect(exclude3(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Graduated: MV 7+ (uses >= operator)
// ---------------------------------------------------------------------------

describe('toggleSimple — mana value 7+', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: MV_FIELDS, operator: '>=', negated: false, value: '7', appendTerm: 'mv>=7' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: MV_FIELDS, operator: '>=', negated: true, value: '7', appendTerm: '-mv>=7' })

  it('appends mv>=7 to empty query', () => {
    expect(drill('', null)).toBe('mv>=7')
  })

  it('no change when mv>=7 already exists', () => {
    const q = 'mv>=7'
    expect(drill(q, buildBreakdown(q))).toBe('mv>=7')
  })

  it('removes -mv>=7 when drilling (un-exclude)', () => {
    const q = '-mv>=7'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -mv>=7 to empty query', () => {
    expect(exclude('', null)).toBe('-mv>=7')
  })

  it('no change when -mv>=7 already exists', () => {
    const q = '-mv>=7'
    expect(exclude(q, buildBreakdown(q))).toBe('-mv>=7')
  })

  it('removes mv>=7 when excluding (less of this)', () => {
    const q = 'mv>=7'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Graduated: Card Type
// ---------------------------------------------------------------------------

describe('toggleSimple — card type', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: TYPE_FIELDS, operator: ':', negated: false, value: 'creature', appendTerm: 't:creature' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: TYPE_FIELDS, operator: ':', negated: true, value: 'creature', appendTerm: '-t:creature' })

  it('appends t:creature to empty query', () => {
    expect(drill('', null)).toBe('t:creature')
  })

  it('no change when t:creature already exists', () => {
    const q = 't:creature'
    expect(drill(q, buildBreakdown(q))).toBe('t:creature')
  })

  it('removes -t:creature when drilling (un-exclude)', () => {
    const q = '-t:creature'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -t:creature to empty query', () => {
    expect(exclude('', null)).toBe('-t:creature')
  })

  it('no change when -t:creature already exists', () => {
    const q = '-t:creature'
    expect(exclude(q, buildBreakdown(q))).toBe('-t:creature')
  })

  it('removes t:creature when excluding (less of this)', () => {
    const q = 't:creature'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })

  it('handles alias: removes type:creature when excluding', () => {
    const q = 'type:creature'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })

  it('handles alias: no change when type:creature exists on drill', () => {
    const q = 'type:creature'
    expect(drill(q, buildBreakdown(q))).toBe('type:creature')
  })
})

// ---------------------------------------------------------------------------
// Multi-step toggle sequences (regression tests for stale-breakdown bug)
// ---------------------------------------------------------------------------

function mvDrill(query: string, value: string): string {
  const op = value === '7' ? '>=' : '='
  const term = `mv${op}${value}`
  return toggleSimple(query, buildBreakdown(query), {
    field: MV_FIELDS, operator: op, negated: false, value, appendTerm: term,
  })
}

function mvExclude(query: string, value: string): string {
  const op = value === '7' ? '>=' : '='
  const term = `-mv${op}${value}`
  return toggleSimple(query, buildBreakdown(query), {
    field: MV_FIELDS, operator: op, negated: true, value, appendTerm: term,
  })
}

describe('multi-step MV toggle sequences', () => {
  it('drill 2, drill 3, ×2, ×3 returns to start', () => {
    let q = 'f:commander'
    q = mvDrill(q, '2');  expect(q).toBe('f:commander mv=2')
    q = mvDrill(q, '3');  expect(q).toBe('f:commander mv=2 mv=3')
    q = mvExclude(q, '2');expect(q).toBe('f:commander mv=3')
    q = mvExclude(q, '3');expect(q).toBe('f:commander')
  })

  it('×2, ×3, drill 2, drill 3 returns to start', () => {
    let q = 'f:commander'
    q = mvExclude(q, '2');expect(q).toBe('f:commander -mv=2')
    q = mvExclude(q, '3');expect(q).toBe('f:commander -mv=2 -mv=3')
    q = mvDrill(q, '2');  expect(q).toBe('f:commander -mv=3')
    q = mvDrill(q, '3');  expect(q).toBe('f:commander')
  })

  it('×2, ×3, drill 2, drill 3, ×2 re-excludes', () => {
    let q = 'f:commander'
    q = mvExclude(q, '2');expect(q).toBe('f:commander -mv=2')
    q = mvExclude(q, '3');expect(q).toBe('f:commander -mv=2 -mv=3')
    q = mvDrill(q, '2');  expect(q).toBe('f:commander -mv=3')
    q = mvDrill(q, '3');  expect(q).toBe('f:commander')
    q = mvExclude(q, '2');expect(q).toBe('f:commander -mv=2')
  })

  it('drill 3, drill 2, ×2 leaves only drill 3', () => {
    let q = 'f:commander'
    q = mvDrill(q, '3');  expect(q).toBe('f:commander mv=3')
    q = mvDrill(q, '2');  expect(q).toBe('f:commander mv=3 mv=2')
    q = mvExclude(q, '2');expect(q).toBe('f:commander mv=3')
  })

  it('×3, drill 2, ×2 leaves only ×3', () => {
    let q = 'f:commander'
    q = mvExclude(q, '3');expect(q).toBe('f:commander -mv=3')
    q = mvDrill(q, '2');  expect(q).toBe('f:commander -mv=3 mv=2')
    q = mvExclude(q, '2');expect(q).toBe('f:commander -mv=3')
  })
})

// ---------------------------------------------------------------------------
// cycleChip — tri-state cycling (Spec 044)
// ---------------------------------------------------------------------------

function cycleFormat(query: string, value: string): string {
  return cycleChip(query, parseBreakdown(query), {
    field: FORMAT_FIELDS, operator: ':', value, term: `f:${value}`,
  })
}

function cycleIs(query: string, value: string): string {
  return cycleChip(query, parseBreakdown(query), {
    field: IS_FIELDS, operator: ':', value, term: `is:${value}`,
  })
}

describe('cycleChip — format', () => {
  it('neutral → positive: appends f:commander', () => {
    expect(cycleFormat('', 'commander')).toBe('f:commander')
  })

  it('positive → negative: replaces f:commander with -f:commander', () => {
    expect(cycleFormat('f:commander', 'commander')).toBe('-f:commander')
  })

  it('negative → neutral: removes -f:commander', () => {
    expect(cycleFormat('-f:commander', 'commander')).toBe('')
  })

  it('full round-trip returns to empty', () => {
    let q = ''
    q = cycleFormat(q, 'commander'); expect(q).toBe('f:commander')
    q = cycleFormat(q, 'commander'); expect(q).toBe('-f:commander')
    q = cycleFormat(q, 'commander'); expect(q).toBe('')
  })

  it('detects user-typed alias: format:commander → -format:commander', () => {
    expect(cycleFormat('format:commander', 'commander')).toBe('-format:commander')
  })

  it('detects negated alias: -format:commander → neutral', () => {
    expect(cycleFormat('-format:commander', 'commander')).toBe('')
  })

  it('preserves surrounding terms on positive → negative', () => {
    expect(cycleFormat('t:creature f:commander is:dfc', 'commander'))
      .toBe('t:creature is:dfc -f:commander')
  })

  it('preserves surrounding terms on negative → neutral', () => {
    expect(cycleFormat('t:creature -f:commander', 'commander'))
      .toBe('t:creature')
  })
})

describe('cycleChip — is keywords', () => {
  it('neutral → positive: appends is:dfc', () => {
    expect(cycleIs('', 'dfc')).toBe('is:dfc')
  })

  it('positive → negative: replaces is:dfc with -is:dfc', () => {
    expect(cycleIs('is:dfc', 'dfc')).toBe('-is:dfc')
  })

  it('negative → neutral: removes -is:dfc', () => {
    expect(cycleIs('-is:dfc', 'dfc')).toBe('')
  })

  it('full round-trip returns to empty', () => {
    let q = ''
    q = cycleIs(q, 'dual'); expect(q).toBe('is:dual')
    q = cycleIs(q, 'dual'); expect(q).toBe('-is:dual')
    q = cycleIs(q, 'dual'); expect(q).toBe('')
  })

  it('preserves surrounding terms throughout cycle', () => {
    let q = 't:creature'
    q = cycleIs(q, 'dfc');  expect(q).toBe('t:creature is:dfc')
    q = cycleIs(q, 'dfc');  expect(q).toBe('t:creature -is:dfc')
    q = cycleIs(q, 'dfc');  expect(q).toBe('t:creature')
  })
})

describe('cycleChip — multi-chip sequences', () => {
  it('multiple different chips coexist', () => {
    let q = ''
    q = cycleFormat(q, 'commander'); expect(q).toBe('f:commander')
    q = cycleIs(q, 'dfc');           expect(q).toBe('f:commander is:dfc')
    q = cycleFormat(q, 'commander'); expect(q).toBe('is:dfc -f:commander')
    q = cycleIs(q, 'dfc');           expect(q).toBe('-f:commander -is:dfc')
  })

  it('cycling one chip does not affect another', () => {
    let q = 'f:commander is:dfc'
    q = cycleIs(q, 'dfc')
    expect(q).toBe('f:commander -is:dfc')
    q = cycleFormat(q, 'commander')
    expect(q).toBe('-is:dfc -f:commander')
  })
})
