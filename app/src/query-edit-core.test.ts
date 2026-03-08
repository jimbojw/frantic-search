// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { BreakdownNode } from '@frantic-search/shared'
import {
  sealQuery,
  findFieldNode,
  spliceQuery,
  removeNode,
  extractValue,
  parseBreakdown,
  appendTerm,
  prependTerm,
  clearFieldTermsRecursive,
} from './query-edit-core'
import { reconstructQuery } from './InlineBreakdown'

function buildBreakdown(query: string): BreakdownNode {
  return parseBreakdown(query)!
}

const CI_FIELDS = ['ci', 'identity', 'id', 'commander', 'cmd']

// ---------------------------------------------------------------------------
// sealQuery
// ---------------------------------------------------------------------------

describe('sealQuery', () => {
  it('returns an already-valid query unchanged', () => {
    expect(sealQuery('t:creature')).toBe('t:creature')
    expect(sealQuery('ci>=r t:creature')).toBe('ci>=r t:creature')
    expect(sealQuery('')).toBe('')
  })

  it('closes an unclosed double quote', () => {
    expect(sealQuery('name:"ang')).toBe('name:"ang"')
  })

  it('closes an unclosed single quote', () => {
    expect(sealQuery("name:'ang")).toBe("name:'ang'")
  })

  it('closes an unclosed regex', () => {
    expect(sealQuery('name:/ang')).toBe('name:/ang/')
  })

  it('closes an unclosed parenthesis', () => {
    expect(sealQuery('(t:creature')).toBe('(t:creature)')
  })

  it('closes multiple unclosed parentheses', () => {
    expect(sealQuery('((a OR b)')).toBe('((a OR b))')
  })

  it('closes an unclosed quote inside an unclosed paren', () => {
    expect(sealQuery('(name:"ang')).toBe('(name:"ang")')
  })

  it('handles the motivating example with nested unclosed constructs', () => {
    expect(sealQuery('f:commander (t:enchantment OR name:"ang'))
      .toBe('f:commander (t:enchantment OR name:"ang")')
  })

  it('does not double-close a properly closed quote', () => {
    expect(sealQuery('name:"ang"')).toBe('name:"ang"')
  })

  it('does not double-close a properly closed regex', () => {
    expect(sealQuery('name:/ang/')).toBe('name:/ang/')
  })

  it('does not double-close balanced parentheses', () => {
    expect(sealQuery('(a OR b)')).toBe('(a OR b)')
  })

  it('closes an empty unclosed quote', () => {
    expect(sealQuery('name:"')).toBe('name:""')
  })

  it('closes an empty unclosed regex', () => {
    expect(sealQuery('name:/')).toBe('name://')
  })

  it('handles unclosed regex with content after field operator', () => {
    expect(sealQuery('/ang')).toBe('/ang/')
  })

  it('does not treat slash inside a word as a regex opener', () => {
    expect(sealQuery('foo/bar')).toBe('foo/bar')
  })
})

// ---------------------------------------------------------------------------
// findFieldNode
// ---------------------------------------------------------------------------

describe('findFieldNode', () => {
  it('finds un-negated FIELD by field+operator', () => {
    const bd = buildBreakdown('ci>=r t:creature')
    const found = findFieldNode(bd, CI_FIELDS, '>=', false)
    expect(found).not.toBeNull()
    expect(found!.label).toBe('ci>=r')
  })

  it('returns null for negated search when node is not negated', () => {
    const bd = buildBreakdown('ci>=r t:creature')
    expect(findFieldNode(bd, CI_FIELDS, '>=', true)).toBeNull()
  })

  it('finds negated (NOT-wrapped) FIELD node', () => {
    const bd = buildBreakdown('-ci>=r t:creature')
    const found = findFieldNode(bd, CI_FIELDS, '>=', true)
    expect(found).not.toBeNull()
    expect(found!.type).toBe('NOT')
    expect(found!.label).toBe('-ci>=r')
  })

  it('skips negated nodes when searching for un-negated', () => {
    const bd = buildBreakdown('-ci>=r ci>=u')
    const found = findFieldNode(bd, CI_FIELDS, '>=', false)
    expect(found).not.toBeNull()
    expect(found!.label).toBe('ci>=u')
  })

  it('finds node inside OR', () => {
    const bd = buildBreakdown('ci>=r OR t:creature')
    const found = findFieldNode(bd, CI_FIELDS, '>=', false)
    expect(found).not.toBeNull()
    expect(found!.label).toBe('ci>=r')
  })

  it('returns null when no matching node exists', () => {
    const bd = buildBreakdown('t:creature')
    expect(findFieldNode(bd, CI_FIELDS, '>=', false)).toBeNull()
  })

  it('matches field aliases', () => {
    const bd = buildBreakdown('identity>=wu')
    const found = findFieldNode(bd, CI_FIELDS, '>=', false)
    expect(found).not.toBeNull()
    expect(found!.label).toBe('identity>=wu')
  })

  it('supports value predicate to filter by value', () => {
    const bd = buildBreakdown('ci:wub ci:c')
    const found = findFieldNode(bd, CI_FIELDS, ':', false, v => v === 'c')
    expect(found).not.toBeNull()
    expect(found!.label).toBe('ci:c')
  })

  it('value predicate skips non-matching values', () => {
    const bd = buildBreakdown('ci:wub')
    expect(findFieldNode(bd, CI_FIELDS, ':', false, v => v === 'c')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractValue
// ---------------------------------------------------------------------------

describe('extractValue', () => {
  it('extracts value from FIELD label', () => {
    expect(extractValue('ci>=r', '>=')).toBe('r')
    expect(extractValue('ci:wub', ':')).toBe('wub')
    expect(extractValue('mv=3', '=')).toBe('3')
  })

  it('extracts value from NOT label', () => {
    expect(extractValue('-ci>=r', '>=')).toBe('r')
    expect(extractValue('-t:creature', ':')).toBe('creature')
  })

  it('returns empty for dangling operator', () => {
    expect(extractValue('ci:', ':')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// spliceQuery
// ---------------------------------------------------------------------------

describe('spliceQuery', () => {
  it('replaces a value span', () => {
    expect(spliceQuery('ci:w t:creature', { start: 3, end: 4 }, 'wr'))
      .toBe('ci:wr t:creature')
  })

  it('removes a node span', () => {
    expect(spliceQuery('ci:w t:creature', { start: 0, end: 4 }, ''))
      .toBe(' t:creature')
  })

  it('inserts at a zero-width span', () => {
    expect(spliceQuery('ci:', { start: 3, end: 3 }, 'wub'))
      .toBe('ci:wub')
  })
})

// ---------------------------------------------------------------------------
// removeNode
// ---------------------------------------------------------------------------

describe('removeNode', () => {
  it('returns empty string when removing the only term', () => {
    const q = 'ci>=r'
    const bd = buildBreakdown(q)
    expect(removeNode(q, bd, bd)).toBe('')
  })

  it('removes a leaf from root AND and trims', () => {
    const q = 'ci>=r t:creature'
    const bd = buildBreakdown(q)
    const target = findFieldNode(bd, CI_FIELDS, '>=', false)!
    expect(removeNode(q, target, bd)).toBe('t:creature')
  })

  it('removes the last leaf from root AND and trims', () => {
    const q = 't:creature ci>=r'
    const bd = buildBreakdown(q)
    const target = findFieldNode(bd, CI_FIELDS, '>=', false)!
    expect(removeNode(q, target, bd)).toBe('t:creature')
  })

  it('removes a NOT node from root AND', () => {
    const q = '-ci:c t:creature'
    const bd = buildBreakdown(q)
    const target = findFieldNode(bd, CI_FIELDS, ':', true)!
    expect(removeNode(q, target, bd)).toBe('t:creature')
  })

  it('removes f:modern from f:modern f:commander (issue 48 — parseBreakdown spans)', () => {
    const q = 'f:modern f:commander'
    const bd = parseBreakdown(q)!
    const child = bd.children!.find(c => reconstructQuery(c) === 'f:modern')
    expect(child).toBeDefined()
    expect(removeNode(q, child!, bd)).toBe('f:commander')
  })

  it('removing OR from a (b or c) d yields a d (no empty parens, issue 81)', () => {
    const q = 'a (b or c) d'
    const bd = parseBreakdown(q)!
    const orChild = bd.children!.find(c => reconstructQuery(c) === 'b OR c')
    expect(orChild).toBeDefined()
    expect(removeNode(q, orChild!, bd)).toBe('a d')
  })
})

// ---------------------------------------------------------------------------
// Pin/unpin sequence (issue 48 — stale-breakdown regression)
// ---------------------------------------------------------------------------

function findAndRemoveNode(q: string, bd: BreakdownNode, nodeLabel: string): string {
  if (reconstructQuery(bd) === nodeLabel) {
    return removeNode(q, bd, bd)
  }
  if (bd.children) {
    for (const child of bd.children) {
      if (reconstructQuery(child) === nodeLabel) {
        return removeNode(q, child, bd)
      }
    }
  }
  return q
}

function simPin(live: string, pinned: string, nodeLabel: string): { live: string; pinned: string } {
  const liveBd = parseBreakdown(live.trim())
  if (!liveBd) return { live, pinned }
  const newLive = findAndRemoveNode(live.trim(), liveBd, nodeLabel)
  const pinnedBd = parseBreakdown(pinned)
  return { live: newLive, pinned: appendTerm(pinned, nodeLabel, pinnedBd) }
}

function simUnpin(live: string, pinned: string, nodeLabel: string): { live: string; pinned: string } {
  const pinnedBd = parseBreakdown(pinned.trim())
  if (!pinnedBd) return { live, pinned }
  const newPinned = findAndRemoveNode(pinned.trim(), pinnedBd, nodeLabel)
  const liveBd = parseBreakdown(live)
  return { live: prependTerm(live, nodeLabel, liveBd), pinned: newPinned }
}

describe('pin/unpin sequence (issue 48)', () => {
  it('unpin f:modern from f:modern f:commander yields f:commander pinned', () => {
    let live = ''
    let pinned = 'f:modern f:commander'
    const r = simUnpin(live, pinned, 'f:modern')
    expect(r.pinned).toBe('f:commander')
    expect(r.live).toBe('f:modern')
  })

  it('full pin/unpin reorder sequence does not corrupt pinned query', () => {
    let live = ''
    let pinned = ''
    // Pin f:commander from TERMS
    live = 'f:commander'
    const r1 = simPin(live, pinned, 'f:commander')
    live = r1.live
    pinned = r1.pinned
    expect(pinned).toBe('f:commander')
    expect(live).toBe('')
    // Pin f:modern from TERMS
    live = 'f:modern'
    const r2 = simPin(live, pinned, 'f:modern')
    live = r2.live
    pinned = r2.pinned
    expect(pinned).toBe('f:commander f:modern')
    expect(live).toBe('')
    // Unpin f:commander (pinned → live)
    const r3 = simUnpin(live, pinned, 'f:commander')
    live = r3.live
    pinned = r3.pinned
    expect(pinned).toBe('f:modern')
    expect(live).toBe('f:commander')
    // Pin f:commander from live (order flips: pinned was f:modern, now f:modern f:commander)
    const r4 = simPin(live, pinned, 'f:commander')
    live = r4.live
    pinned = r4.pinned
    expect(pinned).toBe('f:modern f:commander')
    expect(live).toBe('')
    // Unpin f:modern — this was the bug: produced f:modern f:c
    const r5 = simUnpin(live, pinned, 'f:modern')
    expect(r5.pinned).toBe('f:commander')
    expect(r5.live).toBe('f:modern')
  })

  it('pin OR from a (b or c) d yields a d (issue 81)', () => {
    const r = simPin('a (b or c) d', '', 'b OR c')
    expect(r.live).toBe('a d')
    expect(r.pinned).toBe('b OR c')
  })

  it('unpin OR from pinned into leaf live yields (a OR b) c (issue 81)', () => {
    const r = simUnpin('c', 'a OR b', 'a OR b')
    expect(r.live).toBe('(a OR b) c')
    expect(r.pinned).toBe('')
  })
})

// ---------------------------------------------------------------------------
// appendTerm (Spec 054)
// ---------------------------------------------------------------------------

describe('appendTerm', () => {
  it('returns just the term for an empty query', () => {
    expect(appendTerm('', 'f:commander', null)).toBe('f:commander')
  })

  it('appends term to a simple query', () => {
    expect(appendTerm('t:creature', 'f:commander', buildBreakdown('t:creature')))
      .toBe('t:creature f:commander')
  })

  it('wraps OR-root query in parens before appending', () => {
    expect(appendTerm('a OR b', 'f:commander', buildBreakdown('a OR b')))
      .toBe('(a OR b) f:commander')
  })

  it('seals unclosed delimiters before appending', () => {
    expect(appendTerm('name:"ang', 'f:commander', buildBreakdown('name:"ang')))
      .toBe('name:"ang" f:commander')
  })

  it('trims whitespace before appending', () => {
    expect(appendTerm('  t:creature  ', 'f:commander', buildBreakdown('t:creature')))
      .toBe('t:creature f:commander')
  })
})

// ---------------------------------------------------------------------------
// prependTerm (Spec 054)
// ---------------------------------------------------------------------------

describe('prependTerm', () => {
  it('returns just the term for an empty query', () => {
    expect(prependTerm('', 'f:commander', null)).toBe('f:commander')
  })

  it('prepends term to a simple query', () => {
    expect(prependTerm('t:creature', 'f:commander', buildBreakdown('t:creature')))
      .toBe('f:commander t:creature')
  })

  it('wraps OR-root query in parens before prepending', () => {
    expect(prependTerm('a OR b', 'f:commander', buildBreakdown('a OR b')))
      .toBe('f:commander (a OR b)')
  })

  it('seals unclosed delimiters before prepending', () => {
    expect(prependTerm('name:"ang', 'f:commander', buildBreakdown('name:"ang')))
      .toBe('f:commander name:"ang"')
  })

  it('trims whitespace before prepending', () => {
    expect(prependTerm('  t:creature  ', 'f:commander', buildBreakdown('t:creature')))
      .toBe('f:commander t:creature')
  })

  it('handles whitespace-only query as empty', () => {
    expect(prependTerm('   ', 'f:commander', null)).toBe('f:commander')
  })

  it('wraps OR term in parens when prepending to leaf (issue 81)', () => {
    expect(prependTerm('c', 'a OR b', parseBreakdown('c'))).toBe('(a OR b) c')
  })
})

// ---------------------------------------------------------------------------
// clearFieldTermsRecursive (Spec 102)
// ---------------------------------------------------------------------------

describe('clearFieldTermsRecursive', () => {
  const popularityPredicate = (label: string) => {
    const raw = label.startsWith('-') ? label.slice(1) : label
    const lower = raw.toLowerCase()
    return lower.startsWith('edhrecrank') || (lower.startsWith('edhrec') && !lower.startsWith('edhrecsalt'))
  }

  it('returns query unchanged when no nodes match', () => {
    const q = 't:creature f:commander'
    const bd = parseBreakdown(q)!
    expect(clearFieldTermsRecursive(q, bd, popularityPredicate)).toBe(q)
  })

  it('clears edhrec term from flat query, leaves other terms', () => {
    const q = 't:creature edhrec>90%'
    const bd = parseBreakdown(q)!
    expect(clearFieldTermsRecursive(q, bd, popularityPredicate)).toBe('t:creature')
  })

  it('returns empty string when root is the only match', () => {
    const q = 'edhrec>90%'
    const bd = parseBreakdown(q)!
    expect(clearFieldTermsRecursive(q, bd, popularityPredicate)).toBe('')
  })

  it('clears edhrec from nested structure', () => {
    const q = '(t:creature edhrec>90% OR t:instant)'
    const bd = parseBreakdown(q)!
    expect(clearFieldTermsRecursive(q, bd, popularityPredicate)).toBe('(t:creature OR t:instant)')
  })

  it('clears edhrecrank alias', () => {
    const q = 't:creature edhrecrank>95%'
    const bd = parseBreakdown(q)!
    expect(clearFieldTermsRecursive(q, bd, popularityPredicate)).toBe('t:creature')
  })

  it('does not clear edhrecsalt (salt field)', () => {
    const q = 't:creature edhrecsalt>90%'
    const bd = parseBreakdown(q)!
    expect(clearFieldTermsRecursive(q, bd, popularityPredicate)).toBe(q)
  })

  it('clears negated edhrec term', () => {
    const q = 't:creature -edhrec>90%'
    const bd = parseBreakdown(q)!
    expect(clearFieldTermsRecursive(q, bd, popularityPredicate)).toBe('t:creature')
  })
})
