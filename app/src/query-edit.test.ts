// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { BreakdownNode } from '@frantic-search/shared'
import {
  sealQuery,
  findFieldNode,
  spliceQuery,
  removeNode,
  extractValue,
  toggleColorDrill,
  toggleColorExclude,
  toggleSimple,
  cycleChip,
  graduatedColorBar,
  graduatedColorX,
  colorlessBar,
  colorlessX,
  clearColorIdentity,
  parseBreakdown,
} from './query-edit'

function buildBreakdown(query: string): BreakdownNode {
  return parseBreakdown(query)!
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
// Graduated: Colorless (via toggleSimple — app uses colorlessBar/colorlessX)
// ---------------------------------------------------------------------------

describe('toggleSimple — colorless', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: false, value: 'c', appendTerm: 'ci:c' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: true, value: 'c', appendTerm: '-ci:c' })

  it('appends ci:c to empty query', () => {
    expect(drill('', null)).toBe('ci:c')
  })

  it('no change when ci:c already exists', () => {
    const q = 'ci:c'
    expect(drill(q, buildBreakdown(q))).toBe('ci:c')
  })

  it('removes -ci:c when drilling (un-exclude)', () => {
    const q = '-ci:c'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -ci:c to empty query', () => {
    expect(exclude('', null)).toBe('-ci:c')
  })

  it('no change when -ci:c already exists', () => {
    const q = '-ci:c'
    expect(exclude(q, buildBreakdown(q))).toBe('-ci:c')
  })

  it('removes ci:c when excluding (less of this)', () => {
    const q = 'ci:c'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Graduated: Multicolor (via toggleSimple)
// ---------------------------------------------------------------------------

describe('toggleSimple — multicolor', () => {
  const drill = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: false, value: 'm', appendTerm: 'ci:m' })
  const exclude = (q: string, bd: BreakdownNode | null) =>
    toggleSimple(q, bd, { field: CI_FIELDS, operator: ':', negated: true, value: 'm', appendTerm: '-ci:m' })

  it('appends ci:m to empty query', () => {
    expect(drill('', null)).toBe('ci:m')
  })

  it('no change when ci:m already exists', () => {
    const q = 'ci:m'
    expect(drill(q, buildBreakdown(q))).toBe('ci:m')
  })

  it('removes -ci:m (un-exclude)', () => {
    const q = '-ci:m'
    expect(drill(q, buildBreakdown(q))).toBe('')
  })

  it('appends -ci:m to empty query', () => {
    expect(exclude('', null)).toBe('-ci:m')
  })

  it('no change when -ci:m already exists', () => {
    const q = '-ci:m'
    expect(exclude(q, buildBreakdown(q))).toBe('-ci:m')
  })

  it('removes ci:m (less multicolor)', () => {
    const q = 'ci:m'
    expect(exclude(q, buildBreakdown(q))).toBe('')
  })
})

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
// Splice correctness — surrounding text preservation (legacy)
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

// ---------------------------------------------------------------------------
// Graduated: Color Identity bar ("more of this color")
// ---------------------------------------------------------------------------

describe('graduatedColorBar', () => {
  // Single-color progression
  it('appends ci>=C to empty query', () => {
    expect(graduatedColorBar('', null, 'r')).toBe('ci>=r')
  })

  it('upgrades ci>= to ci: when color already in node', () => {
    const q = 'ci>=r'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci:r')
  })

  it('upgrades ci: to ci= when color already in node', () => {
    const q = 'ci:r'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci=r')
  })

  it('no change when color already at ci= (max)', () => {
    const q = 'ci=r'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci=r')
  })

  // Cross-color: adding to existing node
  it('adds color to existing ci>= node', () => {
    const q = 'ci>=w'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci>=wr')
  })

  it('adds color to existing ci: WUBRG node', () => {
    const q = 'ci:w'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci:wr')
  })

  it('downgrades ci= to ci: and adds new color', () => {
    const q = 'ci=w'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci:wr')
  })

  // Multi-color same-node upgrade (whole-node)
  it('upgrades whole ci>= node to ci: when color in multi-color node', () => {
    const q = 'ci>=wr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci:wr')
  })

  it('upgrades whole ci: node to ci= when color in multi-color node', () => {
    const q = 'ci:wr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci=wr')
  })

  // Splice correctness with surrounding terms
  it('upgrades ci>= to ci: preserving surrounding terms', () => {
    const q = 'f:edh ci>=r t:creature'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('f:edh ci:r t:creature')
  })

  it('upgrades ci: to ci= preserving surrounding terms', () => {
    const q = 'f:edh ci:r t:creature'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('f:edh ci=r t:creature')
  })

  it('downgrades ci= and adds color preserving surrounding terms', () => {
    const q = 'f:edh ci=w t:creature'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('f:edh ci:wr t:creature')
  })

  it('adds color to ci>= preserving surrounding terms', () => {
    const q = 'f:edh ci>=wr t:creature'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('f:edh ci:wr t:creature')
  })

  // Alias preservation
  it('preserves user-typed field alias on upgrade', () => {
    const q = 'identity>=r'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('identity:r')
  })

  // WUBRG canonicalization for value additions
  it('canonicalizes added colors to WUBRG order', () => {
    const q = 'ci>=r'
    expect(graduatedColorBar(q, buildBreakdown(q), 'w')).toBe('ci>=wr')
  })

  // ci:wubrg tautology removal
  it('removes ci: node when adding color would produce ci:wubrg', () => {
    const q = 'ci:wubr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'g')).toBe('')
  })

  it('removes ci: node with surrounding terms when tautological', () => {
    const q = 't:creature ci:wubr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'g')).toBe('t:creature')
  })

  it('removes ci= node when adding color would produce ci:wubrg', () => {
    const q = 'ci=wubr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'g')).toBe('')
  })

  it('removes ci>= node when adding color would produce ci>=wubrg (tautological at :)', () => {
    const q = 'ci>=wubr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'g')).toBe('')
  })

  it('removes ci>= node when upgrading ci>=wubrg to ci: (tautological)', () => {
    const q = 'ci>=wubrg'
    expect(graduatedColorBar(q, buildBreakdown(q), 'w')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Graduated: Color Identity × ("less of this color")
// ---------------------------------------------------------------------------

describe('graduatedColorX', () => {
  // Single-color regression
  it('downgrades ci= to ci: when color in node', () => {
    const q = 'ci=r'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:r')
  })

  it('downgrades ci: to ci>= when color in node', () => {
    const q = 'ci:r'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci>=r')
  })

  it('removes ci>= node when single-color', () => {
    const q = 'ci>=r'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('')
  })

  it('appends exclusion when no CI node exists', () => {
    expect(graduatedColorX('', null, 'r')).toBe('ci:wubg')
  })

  it('no change when color already excluded by ci: WUBRG', () => {
    const q = 'ci:wubg'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:wubg')
  })

  it('no change when color excluded by ci=', () => {
    const q = 'ci=w'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci=w')
  })

  // Multi-color same-node downgrade (whole-node)
  it('downgrades whole ci= node to ci: for multi-color', () => {
    const q = 'ci=wr'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:wr')
  })

  it('removes color from ci: multi-color node', () => {
    const q = 'ci:wr'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:w')
  })

  it('removes color from ci>= multi-color node', () => {
    const q = 'ci>=wr'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci>=w')
  })

  it('removes color from ci: with four colors', () => {
    const q = 'ci:wurg'
    expect(graduatedColorX(q, buildBreakdown(q), 'g')).toBe('ci:wur')
  })

  // Cross-color × interactions
  it('upgrades ci>= to ci: when color not in node (excludes absent colors)', () => {
    const q = 'ci>=w'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:w')
  })

  it('no change when ci:w excludes the color', () => {
    const q = 'ci:w'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:w')
  })

  // Splice correctness
  it('downgrades ci= to ci: preserving surrounding terms', () => {
    const q = 'f:edh ci=r t:creature'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('f:edh ci:r t:creature')
  })

  it('removes color from ci>= preserving surrounding terms', () => {
    const q = 'f:edh ci>=wr t:creature'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('f:edh ci>=w t:creature')
  })

  // Alias preservation
  it('preserves user-typed field alias on downgrade', () => {
    const q = 'identity=r'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('identity:r')
  })

  // Multi-node scenario
  it('appends exclusion alongside existing ci>= when color not present', () => {
    const q = 'ci>=w ci:wubg'
    // R is already excluded by ci:wubg — no change
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci>=w ci:wubg')
  })

  // ci:wubrg tautology removal
  it('removes ci=wubrg instead of downgrading to ci:wubrg', () => {
    const q = 'ci=wubrg'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('')
  })

  it('removes ci=wubrg with surrounding terms', () => {
    const q = 't:creature ci=wubrg'
    expect(graduatedColorX(q, buildBreakdown(q), 'w')).toBe('t:creature')
  })
})

// ---------------------------------------------------------------------------
// Graduated: Colorless bar
// ---------------------------------------------------------------------------

describe('colorlessBar', () => {
  it('appends ci=c to empty query', () => {
    expect(colorlessBar('', null)).toBe('ci=c')
  })

  it('no change when ci=c already exists', () => {
    const q = 'ci=c'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('ci=c')
  })

  it('removes -ci=c (un-exclude)', () => {
    const q = '-ci=c'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('')
  })

  it('downgrades ci>= to ci: (includes colorless)', () => {
    const q = 'ci>=w'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('ci:w')
  })

  it('downgrades ci= WUBRG to ci:', () => {
    const q = 'ci=w'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('ci:w')
  })

  it('narrows ci: WUBRG to ci=c (more colorless)', () => {
    const q = 'ci:w'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('ci=c')
  })

  it('narrows multi-color ci: to ci=c', () => {
    const q = 'ci:ur'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('ci=c')
  })

  it('downgrades ci>= preserving other terms', () => {
    const q = 't:creature ci>=w'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('t:creature ci:w')
  })

  it('narrows ci: to ci=c preserving other terms', () => {
    const q = 'f:edh ci:ur t:creature'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('f:edh ci=c t:creature')
  })

  // ci:wubrg tautology removal
  it('removes ci>=wubrg instead of downgrading to ci:wubrg', () => {
    const q = 'ci>=wubrg'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('')
  })

  it('removes ci>=wubrg with surrounding terms', () => {
    const q = 't:creature ci>=wubrg'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('t:creature')
  })

  it('removes ci=wubrg instead of downgrading to ci:wubrg', () => {
    const q = 'ci=wubrg'
    expect(colorlessBar(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Graduated: Colorless ×
// ---------------------------------------------------------------------------

describe('colorlessX', () => {
  it('appends -ci=c to empty query', () => {
    expect(colorlessX('', null)).toBe('-ci=c')
  })

  it('no change when -ci=c already exists', () => {
    const q = '-ci=c'
    expect(colorlessX(q, buildBreakdown(q))).toBe('-ci=c')
  })

  it('removes ci=c', () => {
    const q = 'ci=c'
    expect(colorlessX(q, buildBreakdown(q))).toBe('')
  })

  it('no change when ci>= exists (colorless implicitly excluded)', () => {
    const q = 'ci>=w'
    expect(colorlessX(q, buildBreakdown(q))).toBe('ci>=w')
  })

  it('no change when ci= WUBRG exists (colorless implicitly excluded)', () => {
    const q = 'ci=w'
    expect(colorlessX(q, buildBreakdown(q))).toBe('ci=w')
  })

  it('upgrades ci: WUBRG to ci= to exclude colorless', () => {
    const q = 'ci:w'
    expect(colorlessX(q, buildBreakdown(q))).toBe('ci=w')
  })
})

// ---------------------------------------------------------------------------
// clearColorIdentity
// ---------------------------------------------------------------------------

describe('clearColorIdentity', () => {
  it('removes a single ci>= node', () => {
    const q = 'ci>=wr'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('')
  })

  it('removes ci: and ci:m nodes', () => {
    const q = 'ci:wub ci:m'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('')
  })

  it('preserves non-CI terms when removing CI nodes', () => {
    const q = 't:creature ci>=r -ci=c'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('t:creature')
  })

  it('removes ci=wubrg', () => {
    const q = 'ci=wubrg'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('')
  })

  it('returns query unchanged when no CI nodes exist', () => {
    const q = 't:creature'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('t:creature')
  })

  it('returns empty query unchanged', () => {
    expect(clearColorIdentity('', null)).toBe('')
  })

  it('removes negated CI nodes', () => {
    const q = '-ci:m t:creature'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('t:creature')
  })

  it('removes ci=c node', () => {
    const q = 'ci=c'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('')
  })

  it('removes mixed CI nodes preserving other terms', () => {
    const q = 'f:edh ci>=wr ci:m t:creature -ci=c'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('f:edh t:creature')
  })

  it('handles alias fields', () => {
    const q = 'identity>=r'
    expect(clearColorIdentity(q, buildBreakdown(q))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Multi-step toggle sequences (regression tests for stale-breakdown bug)
//
// These simulate sequential histogram clicks where each step uses a fresh
// breakdown derived from the current query, matching the fix in
// ResultsBreakdown that uses parseBreakdown() instead of the async worker
// breakdown.
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

const FORMAT_FIELDS = ['f', 'format', 'legal']
const IS_FIELDS = ['is']

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
