// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { ASTNode, BreakdownNode } from '@frantic-search/shared'
import { parse } from '@frantic-search/shared'
import {
  sealQuery,
  findFieldNode,
  spliceQuery,
  removeNode,
  extractValue,
  toggleColorDrill,
  toggleColorExclude,
  toggleSimple,
} from './query-edit'

// ---------------------------------------------------------------------------
// Test helper: build a BreakdownNode tree from a query string using the real
// parser. This mirrors the worker's toBreakdown but operates on ASTNode
// directly (no evaluation needed). matchCount is always 0.
// ---------------------------------------------------------------------------

function nodeLabel(node: ASTNode): string {
  switch (node.type) {
    case 'FIELD': return `${node.field}${node.operator}${node.value}`
    case 'BARE': return node.value
    case 'EXACT': return `!"${node.value}"`
    case 'REGEX_FIELD': return `${node.field}${node.operator}/${node.pattern}/`
    case 'NOT': return 'NOT'
    case 'AND': return 'AND'
    case 'OR': return 'OR'
  }
}

function isNotLeaf(node: ASTNode): boolean {
  if (node.type !== 'NOT') return false
  const child = node.child
  return child.type !== 'AND' && child.type !== 'OR' && child.type !== 'NOT'
}

function astToBreakdown(node: ASTNode): BreakdownNode {
  if (isNotLeaf(node)) {
    const child = (node as { type: 'NOT'; child: ASTNode }).child
    const bd: BreakdownNode = {
      type: 'NOT',
      label: `-${nodeLabel(child)}`,
      matchCount: 0,
    }
    if (node.span) bd.span = node.span
    return bd
  }

  const bd: BreakdownNode = {
    type: node.type,
    label: nodeLabel(node),
    matchCount: 0,
  }
  if (node.span) bd.span = node.span
  if (node.type === 'FIELD' && node.valueSpan) bd.valueSpan = node.valueSpan

  if (node.type === 'AND' || node.type === 'OR') {
    bd.children = node.children.map(astToBreakdown)
  } else if (node.type === 'NOT') {
    bd.children = [astToBreakdown(node.child)]
  }

  return bd
}

function buildBreakdown(query: string): BreakdownNode {
  return astToBreakdown(parse(query))
}

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

const CI_FIELDS = ['ci', 'identity', 'id', 'commander', 'cmd']
const MV_FIELDS = ['mv', 'cmc', 'manavalue']
const TYPE_FIELDS = ['t', 'type']

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
})

// ---------------------------------------------------------------------------
// Toggle: Color Identity WUBRG drill
// ---------------------------------------------------------------------------

describe('toggleColorDrill', () => {
  it('appends ci>=X to empty query', () => {
    expect(toggleColorDrill('', null, 'r')).toBe('ci>=r')
  })

  it('removes single-color node (toggle off)', () => {
    const q = 'ci>=r'
    expect(toggleColorDrill(q, buildBreakdown(q), 'r')).toBe('')
  })

  it('accumulates a second color into existing node', () => {
    const q = 'ci>=r'
    expect(toggleColorDrill(q, buildBreakdown(q), 'u')).toBe('ci>=ur')
  })

  it('removes one color from multi-color node', () => {
    const q = 'ci>=ur'
    expect(toggleColorDrill(q, buildBreakdown(q), 'r')).toBe('ci>=u')
  })

  it('accumulates into existing node preserving surroundings', () => {
    const q = 'ci>=r t:creature'
    expect(toggleColorDrill(q, buildBreakdown(q), 'u')).toBe('ci>=ur t:creature')
  })

  it('removes node entirely when value becomes empty', () => {
    const q = 't:creature ci>=r'
    expect(toggleColorDrill(q, buildBreakdown(q), 'r')).toBe('t:creature')
  })

  it('adds W to existing node', () => {
    const q = 'ci>=r'
    expect(toggleColorDrill(q, buildBreakdown(q), 'w')).toBe('ci>=wr')
  })

  it('canonicalizes to WUBRG order', () => {
    const q = 'ci>=r'
    // Adding W: should produce 'wr' (W before R in WUBRG order)
    const result = toggleColorDrill(q, buildBreakdown(q), 'w')
    expect(result).toBe('ci>=wr')
  })

  it('preserves user-typed field alias', () => {
    const q = 'identity>=r'
    expect(toggleColorDrill(q, buildBreakdown(q), 'u')).toBe('identity>=ur')
  })

  // Splice correctness from spec table
  it('splices correctly with surrounding terms', () => {
    const q = 'f:edh ci>=r t:creature'
    expect(toggleColorDrill(q, buildBreakdown(q), 'u')).toBe('f:edh ci>=ur t:creature')
  })

  it('removes correctly with surrounding terms', () => {
    const q = 'f:edh ci>=ur t:creature'
    expect(toggleColorDrill(q, buildBreakdown(q), 'r')).toBe('f:edh ci>=u t:creature')
  })
})

// ---------------------------------------------------------------------------
// Toggle: Color Identity WUBRG exclude
// ---------------------------------------------------------------------------

describe('toggleColorExclude', () => {
  it('appends ci: with all colors minus excluded to empty query', () => {
    expect(toggleColorExclude('', null, 'r')).toBe('ci:wubg')
  })

  it('removes tautological node when un-excluding restores all 5', () => {
    const q = 'ci:wubg'
    expect(toggleColorExclude(q, buildBreakdown(q), 'r')).toBe('')
  })

  it('removes a color from existing subset node', () => {
    const q = 'ci:wub'
    expect(toggleColorExclude(q, buildBreakdown(q), 'u')).toBe('ci:wb')
  })

  it('adds a color back to existing subset node', () => {
    const q = 'ci:wb'
    expect(toggleColorExclude(q, buildBreakdown(q), 'u')).toBe('ci:wub')
  })

  it('removes W from subset node', () => {
    const q = 'ci:wb'
    expect(toggleColorExclude(q, buildBreakdown(q), 'w')).toBe('ci:b')
  })

  it('removes node when last color removed', () => {
    const q = 'ci:b'
    expect(toggleColorExclude(q, buildBreakdown(q), 'b')).toBe('')
  })

  it('skips ci:c node when searching for WUBRG subset', () => {
    const q = 'ci:c'
    // Excluding R when only ci:c exists → append ci:wubg (ci:c is not a WUBRG node)
    expect(toggleColorExclude(q, buildBreakdown(q), 'r')).toBe('ci:c ci:wubg')
  })

  it('skips ci:m node when searching for WUBRG subset', () => {
    const q = 'ci:m'
    expect(toggleColorExclude(q, buildBreakdown(q), 'r')).toBe('ci:m ci:wubg')
  })
})

// ---------------------------------------------------------------------------
// Toggle: Colorless (simple toggles)
// ---------------------------------------------------------------------------

describe('toggleSimple — colorless', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: false, value: 'c', appendTerm: 'ci:c' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: true, value: 'c', appendTerm: '-ci:c' })

  it('appends ci:c to empty query', () => {
    expect(drill('', null)).toBe('ci:c')
  })

  it('removes ci:c (toggle off)', () => {
    const q = 'ci:c'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -ci:c to empty query', () => {
    expect(exclude('', null)).toBe('-ci:c')
  })

  it('removes -ci:c (toggle off)', () => {
    const q = '-ci:c'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Toggle: Multicolor (simple toggles)
// ---------------------------------------------------------------------------

describe('toggleSimple — multicolor', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: false, value: 'm', appendTerm: 'ci:m' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: true, value: 'm', appendTerm: '-ci:m' })

  it('appends ci:m to empty query', () => {
    expect(drill('', null)).toBe('ci:m')
  })

  it('removes ci:m (toggle off)', () => {
    const q = 'ci:m'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -ci:m to empty query', () => {
    expect(exclude('', null)).toBe('-ci:m')
  })

  it('removes -ci:m (toggle off)', () => {
    const q = '-ci:m'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Toggle: Mana Value
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

  it('removes mv=3 (toggle off)', () => {
    const q = 'mv=3'
    expect(drill3(q, buildBreakdown(q))).toBe('')
  })

  it('appends second MV term independently', () => {
    const q = 'mv=3'
    expect(drill5(q, buildBreakdown(q))).toBe('mv=3 mv=5')
  })

  it('appends -mv=3 to empty query', () => {
    expect(exclude3('', null)).toBe('-mv=3')
  })

  it('removes -mv=3 (toggle off)', () => {
    const q = '-mv=3'
    expect(exclude3(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Toggle: MV 7+ (uses >= operator)
// ---------------------------------------------------------------------------

describe('toggleSimple — mana value 7+', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: MV_FIELDS, operator: '>=', negated: false, value: '7', appendTerm: 'mv>=7' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: MV_FIELDS, operator: '>=', negated: true, value: '7', appendTerm: '-mv>=7' })

  it('appends mv>=7 to empty query', () => {
    expect(drill('', null)).toBe('mv>=7')
  })

  it('removes mv>=7 (toggle off)', () => {
    const q = 'mv>=7'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -mv>=7 to empty query', () => {
    expect(exclude('', null)).toBe('-mv>=7')
  })

  it('removes -mv>=7 (toggle off)', () => {
    const q = '-mv>=7'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Toggle: Card Type
// ---------------------------------------------------------------------------

describe('toggleSimple — card type', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: TYPE_FIELDS, operator: ':', negated: false, value: 'creature', appendTerm: 't:creature' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: TYPE_FIELDS, operator: ':', negated: true, value: 'creature', appendTerm: '-t:creature' })

  it('appends t:creature to empty query', () => {
    expect(drill('', null)).toBe('t:creature')
  })

  it('removes t:creature (toggle off)', () => {
    const q = 't:creature'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -t:creature to empty query', () => {
    expect(exclude('', null)).toBe('-t:creature')
  })

  it('removes -t:creature (toggle off)', () => {
    const q = '-t:creature'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Splice correctness — surrounding text preservation
// ---------------------------------------------------------------------------

describe('splice correctness', () => {
  it('preserves surrounding text on value splice', () => {
    const q = 'f:edh ci>=r t:creature'
    const result = toggleColorDrill(q, buildBreakdown(q), 'u')
    expect(result).toBe('f:edh ci>=ur t:creature')
  })

  it('preserves surrounding text on removal', () => {
    const q = 'f:edh ci>=ur t:creature'
    const result = toggleColorDrill(q, buildBreakdown(q), 'r')
    expect(result).toBe('f:edh ci>=u t:creature')
  })
})
