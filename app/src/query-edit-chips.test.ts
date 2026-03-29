// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { BreakdownNode } from '@frantic-search/shared'
import { parseBreakdown } from './query-edit-core'
import { MV_FIELDS } from './mana-value-query'
import {
  toggleSimple,
  cycleChip,
  cyclePercentileChip,
  popularityClearPredicate,
  saltClearPredicate,
  manaCostGenericClearPredicate,
  cycleManaValueMenuChip,
  getManaValueMenuActiveIndex,
} from './query-edit-chips'

function buildBreakdown(query: string): BreakdownNode {
  return parseBreakdown(query)!
}
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
// Mana value MenuDrawer — exclusive chips (Spec 168)
// ---------------------------------------------------------------------------

function menuChip(value: string, operator: string, term: string) {
  return { field: [...MV_FIELDS], operator, value, term }
}

describe('cycleManaValueMenuChip', () => {
  const tap3 = (q: string, bd: BreakdownNode | null) =>
    cycleManaValueMenuChip(q, bd, menuChip('3', '=', 'mv=3'))
  const tap5 = (q: string, bd: BreakdownNode | null) =>
    cycleManaValueMenuChip(q, bd, menuChip('5', '=', 'mv=5'))
  const tap7 = (q: string, bd: BreakdownNode | null) =>
    cycleManaValueMenuChip(q, bd, menuChip('7', '>=', 'mv>=7'))

  it('appends mv=3 to empty query', () => {
    expect(tap3('', null)).toBe('mv=3')
  })

  it('clears when tapping active mv=3', () => {
    const q = 'mv=3'
    expect(tap3(q, buildBreakdown(q))).toBe('')
  })

  it('replaces mv=3 with mv=5', () => {
    const q = 'mv=3'
    expect(tap5(q, buildBreakdown(q))).toBe('mv=5')
  })

  it('collapses stacked mv=3 mv=5 to mv=2', () => {
    const q = 'mv=3 mv=5'
    expect(
      cycleManaValueMenuChip(q, buildBreakdown(q), menuChip('2', '=', 'mv=2')),
    ).toBe('mv=2')
  })

  it('removes -mv=3 and appends mv=2', () => {
    const q = '-mv=3'
    expect(
      cycleManaValueMenuChip(q, buildBreakdown(q), menuChip('2', '=', 'mv=2')),
    ).toBe('mv=2')
  })

  it('normalizes cmc=4 to mv=5 (replace family)', () => {
    const q = 'cmc=4'
    expect(tap5(q, buildBreakdown(q))).toBe('mv=5')
  })

  it('mv>=7 tap toggles off', () => {
    const q = 'mv>=7'
    expect(tap7(q, buildBreakdown(q))).toBe('')
  })

  it('mv=3 to mv>=7', () => {
    const q = 'mv=3'
    expect(tap7(q, buildBreakdown(q))).toBe('mv>=7')
  })
})

describe('getManaValueMenuActiveIndex', () => {
  it('returns index for single mv=4', () => {
    expect(getManaValueMenuActiveIndex(buildBreakdown('mv=4'))).toBe(4)
  })

  it('returns index for cmc=2 alias', () => {
    expect(getManaValueMenuActiveIndex(buildBreakdown('cmc=2'))).toBe(2)
  })

  it('returns null when stacked', () => {
    expect(getManaValueMenuActiveIndex(buildBreakdown('mv=2 mv=3'))).toBe(null)
  })

  it('returns null when no MV chip term', () => {
    expect(getManaValueMenuActiveIndex(buildBreakdown('t:creature'))).toBe(null)
  })

  it('returns null for mv=10', () => {
    expect(getManaValueMenuActiveIndex(buildBreakdown('mv=10'))).toBe(null)
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

describe('cycleChip — mana cost (m: / mana:, Spec 169)', () => {
  const MANA_COST_FIELDS = ['m', 'mana']

  function cycleMana(q: string, value: string) {
    return cycleChip(q, parseBreakdown(q), {
      field: MANA_COST_FIELDS,
      operator: ':',
      value,
      term: `m:${value}`,
    })
  }

  it('neutral → positive → negative → neutral for m:w', () => {
    let q = ''
    q = cycleMana(q, 'w')
    expect(q).toBe('m:w')
    q = cycleMana(q, 'w')
    expect(q).toBe('-m:w')
    q = cycleMana(q, 'w')
    expect(q).toBe('')
  })

  it('detects mana: alias and cycles to negative preserving alias label', () => {
    expect(cycleMana('mana:w', 'w')).toBe('-mana:w')
    expect(cycleMana('-mana:w', 'w')).toBe('')
  })

  it('m:w and m:x still compose via cycleChip', () => {
    let q = ''
    q = cycleMana(q, 'w')
    expect(q).toBe('m:w')
    q = cycleMana(q, 'x')
    expect(q).toBe('m:w m:x')
    q = cycleMana(q, 'w')
    expect(q).toBe('m:x -m:w')
  })
})

describe('cyclePercentileChip — mana cost generic m>=1–m>=8 (Spec 169)', () => {
  const MANA_COST_FIELDS = ['m', 'mana']

  function cycleManaGeneric(q: string, value: string): string {
    return cyclePercentileChip(q, parseBreakdown(q), {
      field: MANA_COST_FIELDS,
      operator: '>=',
      value,
      term: `m>=${value}`,
      clearPredicate: manaCostGenericClearPredicate,
    })
  }

  it('replaces legacy m:2 with m>=8', () => {
    expect(cycleManaGeneric('m:2', '8')).toBe('m>=8')
  })

  it('replaces m>=2 with m>=8', () => {
    expect(cycleManaGeneric('m>=2', '8')).toBe('m>=8')
  })

  it('clears user-typed m:9 when choosing m>=2', () => {
    expect(cycleManaGeneric('m:9', '2')).toBe('m>=2')
  })

  it('active m>=3 → tap m>=3 → -m>=3', () => {
    expect(cycleManaGeneric('m>=3', '3')).toBe('-m>=3')
  })

  it('negated m:3 → tap m>=8 → m>=8', () => {
    expect(cycleManaGeneric('-m:3', '8')).toBe('m>=8')
  })

  it('does not clear m:x when changing generic digit', () => {
    let q = 'm:1 m:x'
    q = cycleManaGeneric(q, '8')
    expect(q).toBe('m:x m>=8')
  })

  it('appends m>=1 without removing m:x', () => {
    expect(cycleManaGeneric('m:x', '1')).toBe('m:x m>=1')
  })
})

describe('cycleChip — type (t:) keywords', () => {
  function cycleType(q: string, value: string) {
    return cycleChip(q, parseBreakdown(q), {
      field: TYPE_FIELDS,
      operator: ':',
      value,
      term: `t:${value}`,
    })
  }

  it('neutral → positive → negative → neutral for t:land', () => {
    let q = ''
    q = cycleType(q, 'land')
    expect(q).toBe('t:land')
    q = cycleType(q, 'land')
    expect(q).toBe('-t:land')
    q = cycleType(q, 'land')
    expect(q).toBe('')
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

// ---------------------------------------------------------------------------
// cyclePercentileChip (Spec 102)
// ---------------------------------------------------------------------------

const POPULARITY_FIELDS = ['edhrec', 'edhrecrank']

function cyclePopularity(query: string, value: string): string {
  return cyclePercentileChip(query, parseBreakdown(query), {
    field: POPULARITY_FIELDS,
    operator: '>',
    value,
    term: `edhrec>${value}`,
    clearPredicate: popularityClearPredicate,
  })
}

function cycleSalt(query: string, value: string): string {
  return cyclePercentileChip(query, parseBreakdown(query), {
    field: ['salt', 'edhrecsalt', 'saltiness'],
    operator: '>',
    value,
    term: `salt>${value}`,
    clearPredicate: saltClearPredicate,
  })
}

describe('cyclePercentileChip — popularity', () => {
  it('neutral → positive: appends edhrec>90%', () => {
    expect(cyclePopularity('', '90%')).toBe('edhrec>90%')
  })

  it('positive → negated: replaces edhrec>90% with -edhrec>90%', () => {
    expect(cyclePopularity('edhrec>90%', '90%')).toBe('-edhrec>90%')
  })

  it('negated → neutral: clears term', () => {
    expect(cyclePopularity('-edhrec>90%', '90%')).toBe('')
  })

  it('tapping different chip clears previous and adds new', () => {
    expect(cyclePopularity('edhrec>90%', '95%')).toBe('edhrec>95%')
  })

  it('clears manually typed edhrec<10% when tapping >90%', () => {
    expect(cyclePopularity('edhrec<10%', '90%')).toBe('edhrec>90%')
  })

  it('does not clear edhrecsalt when tapping popularity chip', () => {
    const q = 'edhrecsalt>90%'
    expect(cyclePopularity(q, '90%')).toBe('edhrecsalt>90% edhrec>90%')
  })

  it('empty query: clearing yields empty, append returns term', () => {
    expect(cyclePopularity('', '90%')).toBe('edhrec>90%')
  })

  it('preserves surrounding terms', () => {
    expect(cyclePopularity('t:creature edhrec>90%', '95%')).toBe('t:creature edhrec>95%')
  })
})

describe('cyclePercentileChip — salt', () => {
  it('neutral → positive: appends salt>90%', () => {
    expect(cycleSalt('', '90%')).toBe('salt>90%')
  })

  it('positive → negated: replaces salt>90% with -salt>90%', () => {
    expect(cycleSalt('salt>90%', '90%')).toBe('-salt>90%')
  })

  it('negated → neutral: clears term', () => {
    expect(cycleSalt('-salt>90%', '90%')).toBe('')
  })

  it('popularity and salt sections operate independently', () => {
    let q = 'edhrec>90%'
    q = cycleSalt(q, '95%')
    expect(q).toBe('edhrec>90% salt>95%')
  })
})
