// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { BreakdownNode } from '@frantic-search/shared'
import { parseBreakdown } from './query-edit-core'
import {
  toggleUniquePrints,
  hasUniquePrints,
  hasMyInQuery,
  getMyListIdFromBreakdown,
  toggleIncludeExtras,
  hasIncludeExtras,
  setViewTerm,
  clearViewTerms,
  clearUniqueTerms,
  setUniqueTerm,
  clearSortTerms,
  cycleSortChip,
} from './query-edit-modifiers'

function buildBreakdown(query: string): BreakdownNode {
  return parseBreakdown(query)!
}

// ---------------------------------------------------------------------------
// toggleUniquePrints — bimodal toggle (Spec 048)
// ---------------------------------------------------------------------------

describe('toggleUniquePrints', () => {
  it('appends unique:prints to empty query', () => {
    expect(toggleUniquePrints('', null)).toBe('unique:prints')
  })

  it('removes unique:prints when present', () => {
    const q = 'unique:prints'
    expect(toggleUniquePrints(q, buildBreakdown(q))).toBe('')
  })

  it('removes ++ alias when present (Spec 048)', () => {
    const q = 't:creature ++'
    expect(toggleUniquePrints(q, buildBreakdown(q))).toBe('t:creature')
  })

  it('round-trips: absent → present → absent', () => {
    let q = ''
    q = toggleUniquePrints(q, parseBreakdown(q))
    expect(q).toBe('unique:prints')
    q = toggleUniquePrints(q, parseBreakdown(q))
    expect(q).toBe('')
  })

  it('preserves surrounding terms when appending', () => {
    const q = 'r:mythic'
    expect(toggleUniquePrints(q, buildBreakdown(q))).toBe('r:mythic unique:prints')
  })

  it('preserves surrounding terms when removing', () => {
    const q = 'r:mythic unique:prints'
    expect(toggleUniquePrints(q, buildBreakdown(q))).toBe('r:mythic')
  })

  it('preserves surrounding terms on both sides when removing', () => {
    const q = 'r:mythic unique:prints t:creature'
    expect(toggleUniquePrints(q, buildBreakdown(q))).toBe('r:mythic t:creature')
  })

  it('wraps OR-root query in parens when appending', () => {
    const q = 'r:mythic OR r:rare'
    expect(toggleUniquePrints(q, buildBreakdown(q))).toBe('(r:mythic OR r:rare) unique:prints')
  })
})

// ---------------------------------------------------------------------------
// hasUniquePrints — state detection
// ---------------------------------------------------------------------------

describe('hasUniquePrints', () => {
  it('returns false for null breakdown', () => {
    expect(hasUniquePrints(null)).toBe(false)
  })

  it('returns false when unique:prints is absent', () => {
    expect(hasUniquePrints(buildBreakdown('r:mythic'))).toBe(false)
  })

  it('returns true when unique:prints is present', () => {
    expect(hasUniquePrints(buildBreakdown('unique:prints'))).toBe(true)
  })

  it('returns true when unique:prints is among other terms', () => {
    expect(hasUniquePrints(buildBreakdown('r:mythic unique:prints'))).toBe(true)
  })

  it('returns true when ++ alias is present (Spec 048)', () => {
    expect(hasUniquePrints(buildBreakdown('++'))).toBe(true)
    expect(hasUniquePrints(buildBreakdown('t:creature ++'))).toBe(true)
  })
})

describe('hasMyInQuery', () => {
  it('returns false for null breakdown', () => {
    expect(hasMyInQuery(null)).toBe(false)
  })
  it('returns false when my: is absent', () => {
    expect(hasMyInQuery(buildBreakdown('t:creature'))).toBe(false)
  })
  it('returns true when my:list is present', () => {
    expect(hasMyInQuery(buildBreakdown('my:list'))).toBe(true)
  })
  it('returns true when my:list is among other terms', () => {
    expect(hasMyInQuery(buildBreakdown('my:list t:creature'))).toBe(true)
  })
  it('returns false when my: is negated', () => {
    expect(hasMyInQuery(buildBreakdown('-my:list'))).toBe(false)
  })
})

describe('getMyListIdFromBreakdown', () => {
  it('returns default for my:list', () => {
    expect(getMyListIdFromBreakdown(buildBreakdown('my:list'))).toBe('default')
  })
  it('returns default for my:default', () => {
    expect(getMyListIdFromBreakdown(buildBreakdown('my:default'))).toBe('default')
  })
  it('returns trash for my:trash', () => {
    expect(getMyListIdFromBreakdown(buildBreakdown('my:trash'))).toBe('trash')
  })
  it('returns null when my: is absent', () => {
    expect(getMyListIdFromBreakdown(buildBreakdown('t:creature'))).toBe(null)
  })
  it('returns null when my: is negated', () => {
    expect(getMyListIdFromBreakdown(buildBreakdown('-my:list'))).toBe(null)
  })
  it('returns trash when my:trash is among other terms', () => {
    expect(getMyListIdFromBreakdown(buildBreakdown('my:trash t:creature'))).toBe('trash')
  })
})

describe('parseBreakdown preserves alias display (Spec 048)', () => {
  it('++ breakdown label is ++ not unique:prints', () => {
    const bd = buildBreakdown('t:creature ++')
    const uniqueChild = bd.children?.find(c => c.label === '++' || c.label === 'unique:prints')
    expect(uniqueChild).toBeDefined()
    expect(uniqueChild!.label).toBe('++')
  })

  it('@@ breakdown label is @@ not unique:art', () => {
    const bd = buildBreakdown('t:creature @@')
    const uniqueChild = bd.children?.find(c => c.label === '@@' || c.label === 'unique:art')
    expect(uniqueChild).toBeDefined()
    expect(uniqueChild!.label).toBe('@@')
  })

  it('** breakdown label is ** not include:extras (Spec 057)', () => {
    const bd = buildBreakdown('t:creature **')
    const includeChild = bd.children?.find(c => c.label === '**' || c.label === 'include:extras')
    expect(includeChild).toBeDefined()
    expect(includeChild!.label).toBe('**')
  })

  it('include:extras breakdown label is include:extras not ** (Spec 057)', () => {
    const bd = buildBreakdown('t:creature include:extras')
    const includeChild = bd.children?.find(c => c.label === '**' || c.label === 'include:extras')
    expect(includeChild).toBeDefined()
    expect(includeChild!.label).toBe('include:extras')
  })
})

// ---------------------------------------------------------------------------
// toggleIncludeExtras — bimodal toggle (Spec 057)
// ---------------------------------------------------------------------------

describe('toggleIncludeExtras', () => {
  it('appends include:extras to empty query', () => {
    expect(toggleIncludeExtras('', null)).toBe('include:extras')
  })

  it('removes include:extras when present', () => {
    const q = 'include:extras'
    expect(toggleIncludeExtras(q, buildBreakdown(q))).toBe('')
  })

  it('round-trips: absent → present → absent', () => {
    let q = ''
    q = toggleIncludeExtras(q, parseBreakdown(q))
    expect(q).toBe('include:extras')
    q = toggleIncludeExtras(q, parseBreakdown(q))
    expect(q).toBe('')
  })

  it('preserves surrounding terms when appending', () => {
    const q = 'is:gamechanger'
    expect(toggleIncludeExtras(q, buildBreakdown(q))).toBe('is:gamechanger include:extras')
  })

  it('preserves surrounding terms when removing', () => {
    const q = 'is:gamechanger include:extras'
    expect(toggleIncludeExtras(q, buildBreakdown(q))).toBe('is:gamechanger')
  })

  it('preserves surrounding terms on both sides when removing', () => {
    const q = 'r:mythic include:extras unique:prints'
    expect(toggleIncludeExtras(q, buildBreakdown(q))).toBe('r:mythic unique:prints')
  })

  it('wraps OR-root query in parens when appending', () => {
    const q = 'r:mythic OR r:rare'
    expect(toggleIncludeExtras(q, buildBreakdown(q))).toBe('(r:mythic OR r:rare) include:extras')
  })

  it('removes ** alias when present (Spec 057)', () => {
    const q = 't:creature **'
    expect(toggleIncludeExtras(q, buildBreakdown(q))).toBe('t:creature')
  })
})

// ---------------------------------------------------------------------------
// hasIncludeExtras — state detection
// ---------------------------------------------------------------------------

describe('hasIncludeExtras', () => {
  it('returns false for null breakdown', () => {
    expect(hasIncludeExtras(null)).toBe(false)
  })

  it('returns false when include:extras is absent', () => {
    expect(hasIncludeExtras(buildBreakdown('is:gamechanger'))).toBe(false)
  })

  it('returns true when include:extras is present', () => {
    expect(hasIncludeExtras(buildBreakdown('include:extras'))).toBe(true)
  })

  it('returns true when include:extras is among other terms', () => {
    expect(hasIncludeExtras(buildBreakdown('is:gamechanger include:extras'))).toBe(true)
  })

  it('returns true when ** alias is present (Spec 057)', () => {
    expect(hasIncludeExtras(buildBreakdown('**'))).toBe(true)
    expect(hasIncludeExtras(buildBreakdown('t:creature **'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// setViewTerm (Spec 058)
// ---------------------------------------------------------------------------

describe('setViewTerm', () => {
  it('appends v: term to empty query (Spec 083)', () => {
    expect(setViewTerm('', null, 'images')).toBe('v:images')
  })

  it('appends v: term when none exists', () => {
    expect(setViewTerm('t:creature', buildBreakdown('t:creature'), 'detail'))
      .toBe('t:creature v:detail')
  })

  it('replaces existing view: term with v:', () => {
    expect(setViewTerm('view:slim', buildBreakdown('view:slim'), 'images'))
      .toBe('v:images')
  })

  it('replaces existing v: term (Spec 083)', () => {
    expect(setViewTerm('v:slim', buildBreakdown('v:slim'), 'images'))
      .toBe('v:images')
  })

  it('removes all view:/v: terms and appends new one', () => {
    expect(setViewTerm('view:slim view:detail', buildBreakdown('view:slim view:detail'), 'full'))
      .toBe('v:full')
  })

  it('clears v: when replacing (Spec 083)', () => {
    expect(setViewTerm('v:slim t:creature', buildBreakdown('v:slim t:creature'), 'detail'))
      .toBe('t:creature v:detail')
  })

  it('clears invalid view: and sets valid', () => {
    expect(setViewTerm('view:invalid t:creature', buildBreakdown('view:invalid t:creature'), 'images'))
      .toBe('t:creature v:images')
  })
})

describe('clearViewTerms', () => {
  it('removes display: term (Spec 107)', () => {
    expect(clearViewTerms('display:full', buildBreakdown('display:full'))).toBe('')
    expect(clearViewTerms('t:creature display:images', buildBreakdown('t:creature display:images')))
      .toBe('t:creature')
  })

  it('removes view: term', () => {
    expect(clearViewTerms('view:images', buildBreakdown('view:images'))).toBe('')
  })
  it('removes v: term (Spec 083)', () => {
    expect(clearViewTerms('v:images', buildBreakdown('v:images'))).toBe('')
  })
  it('removes view: but preserves other terms', () => {
    expect(clearViewTerms('t:creature view:full', buildBreakdown('t:creature view:full')))
      .toBe('t:creature')
  })
  it('removes v: but preserves other terms (Spec 083)', () => {
    expect(clearViewTerms('t:creature v:full', buildBreakdown('t:creature v:full')))
      .toBe('t:creature')
  })
  it('returns query unchanged when no view:/v: terms', () => {
    expect(clearViewTerms('t:creature', buildBreakdown('t:creature'))).toBe('t:creature')
  })
})

// ---------------------------------------------------------------------------
// clearUniqueTerms, setUniqueTerm (Spec 084)
// ---------------------------------------------------------------------------

describe('clearUniqueTerms', () => {
  it('removes unique:prints', () => {
    expect(clearUniqueTerms('unique:prints', buildBreakdown('unique:prints'))).toBe('')
  })
  it('removes unique:art', () => {
    expect(clearUniqueTerms('unique:art', buildBreakdown('unique:art'))).toBe('')
  })
  it('removes unique:cards', () => {
    expect(clearUniqueTerms('unique:cards', buildBreakdown('unique:cards'))).toBe('')
  })
  it('removes ++ alias', () => {
    expect(clearUniqueTerms('t:creature ++', buildBreakdown('t:creature ++'))).toBe('t:creature')
  })
  it('removes @@ alias', () => {
    expect(clearUniqueTerms('t:creature @@', buildBreakdown('t:creature @@'))).toBe('t:creature')
  })
  it('removes unique: but preserves other terms', () => {
    expect(clearUniqueTerms('t:creature unique:art', buildBreakdown('t:creature unique:art')))
      .toBe('t:creature')
  })
  it('returns query unchanged when no unique: terms', () => {
    expect(clearUniqueTerms('t:creature', buildBreakdown('t:creature'))).toBe('t:creature')
  })
})

describe('setUniqueTerm', () => {
  it('pinned has unique:art, tap cards → append unique:cards', () => {
    expect(setUniqueTerm('', null, 'unique:art', 'cards')).toBe('unique:cards')
  })
  it('pinned has unique:prints, live empty, tap cards → append unique:cards', () => {
    expect(setUniqueTerm('', null, 'unique:prints', 'cards')).toBe('unique:cards')
  })
  it('pinned empty, live has unique:art, tap cards → splice out (no append)', () => {
    expect(setUniqueTerm('unique:art', buildBreakdown('unique:art'), '', 'cards')).toBe('')
  })
  it('pinned empty, live has unique:prints, tap cards → splice out', () => {
    expect(setUniqueTerm('t:creature unique:prints', buildBreakdown('t:creature unique:prints'), '', 'cards'))
      .toBe('t:creature')
  })
  it('pinned has unique:art, live has unique:prints, tap cards → append unique:cards', () => {
    expect(setUniqueTerm('unique:prints', buildBreakdown('unique:prints'), 'unique:art', 'cards'))
      .toBe('unique:cards')
  })
  it('tap art → append unique:art', () => {
    expect(setUniqueTerm('t:creature', buildBreakdown('t:creature'), '', 'art'))
      .toBe('t:creature unique:art')
  })
  it('tap prints → append unique:prints', () => {
    expect(setUniqueTerm('t:creature', buildBreakdown('t:creature'), '', 'prints'))
      .toBe('t:creature unique:prints')
  })
  it('live has unique:art, tap prints → replace with unique:prints', () => {
    expect(setUniqueTerm('t:creature unique:art', buildBreakdown('t:creature unique:art'), '', 'prints'))
      .toBe('t:creature unique:prints')
  })
})

// ---------------------------------------------------------------------------
// Spec 059 — sort directive chip operations
// ---------------------------------------------------------------------------

describe('clearSortTerms', () => {
  it('removes order: term (Spec 107)', () => {
    expect(clearSortTerms('order:name', buildBreakdown('order:name'))).toBe('')
    expect(clearSortTerms('t:creature order:usd', buildBreakdown('t:creature order:usd')))
      .toBe('t:creature')
  })

  it('removes sort: term', () => {
    expect(clearSortTerms('sort:name', buildBreakdown('sort:name'))).toBe('')
  })
  it('removes -sort: term', () => {
    expect(clearSortTerms('-sort:name', buildBreakdown('-sort:name'))).toBe('')
  })
  it('removes sort: but preserves other terms', () => {
    expect(clearSortTerms('t:creature sort:mv', buildBreakdown('t:creature sort:mv')))
      .toBe('t:creature')
  })
  it('returns query unchanged when no sort: terms', () => {
    expect(clearSortTerms('t:creature', buildBreakdown('t:creature'))).toBe('t:creature')
  })
})

describe('cycleSortChip', () => {
  const nameChip = { field: ['sort'], operator: ':', value: 'name', term: 'sort:name' }
  const usdChip = { field: ['sort'], operator: ':', value: '$', term: 'sort:$' }

  it('neutral → adds sort:name', () => {
    expect(cycleSortChip('t:creature', buildBreakdown('t:creature'), nameChip))
      .toBe('t:creature sort:name')
  })

  it('positive → replaces with -sort:name', () => {
    expect(cycleSortChip('t:creature sort:name', buildBreakdown('t:creature sort:name'), nameChip))
      .toBe('t:creature -sort:name')
  })

  it('negative → removes', () => {
    expect(cycleSortChip('t:creature -sort:name', buildBreakdown('t:creature -sort:name'), nameChip))
      .toBe('t:creature')
  })

  it('exclusive selection: activating sort:$ removes existing sort:name', () => {
    const result = cycleSortChip('t:creature sort:name', buildBreakdown('t:creature sort:name'), usdChip)
    expect(result).toContain('sort:$')
    expect(result).not.toContain('sort:name')
  })

  it('exclusive selection: activating sort:$ removes existing -sort:name', () => {
    const result = cycleSortChip('t:creature -sort:name', buildBreakdown('t:creature -sort:name'), usdChip)
    expect(result).toContain('sort:$')
    expect(result).not.toContain('sort:name')
  })
})
