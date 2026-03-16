// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import type { BreakdownNode } from '@frantic-search/shared'
import { parseBreakdown } from './query-edit-core'
import {
  toggleColorDrill,
  toggleColorExclude,
  graduatedColorBar,
  graduatedColorX,
  colorlessBar,
  colorlessX,
  clearColorIdentity,
  findFirstCiWubrgNode,
  isWubrgColorActive,
  toggleIdentityColorChip,
  toggleIdentityColorlessChip,
  cycleCiNumericChip,
} from './query-edit-color'
import { toggleSimple } from './query-edit-chips'

function buildBreakdown(query: string): BreakdownNode {
  return parseBreakdown(query)!
}

const CI_FIELDS = ['ci', 'identity', 'id', 'commander', 'cmd']

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
    const result = toggleColorDrill(q, buildBreakdown(q), 'w')
    expect(result).toBe('ci>=wr')
  })

  it('preserves user-typed field alias', () => {
    const q = 'identity>=r'
    expect(toggleColorDrill(q, buildBreakdown(q), 'u')).toBe('identity>=ur')
  })

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

  it('upgrades whole ci>= node to ci: when color in multi-color node', () => {
    const q = 'ci>=wr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci:wr')
  })

  it('upgrades whole ci: node to ci= when color in multi-color node', () => {
    const q = 'ci:wr'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('ci=wr')
  })

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

  it('preserves user-typed field alias on upgrade', () => {
    const q = 'identity>=r'
    expect(graduatedColorBar(q, buildBreakdown(q), 'r')).toBe('identity:r')
  })

  it('canonicalizes added colors to WUBRG order', () => {
    const q = 'ci>=r'
    expect(graduatedColorBar(q, buildBreakdown(q), 'w')).toBe('ci>=wr')
  })

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

  it('downgrades whole ci= node to ci: for multi-color', () => {
    const q = 'ci=wr'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:wr')
  })

  it('downgrades ci: multi-color node to ci>= on minus tap', () => {
    const q = 'ci:wr'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci>=wr')
  })

  it('removes color from ci>= multi-color node', () => {
    const q = 'ci>=wr'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci>=w')
  })

  it('downgrades ci: with four colors to ci>= on minus tap', () => {
    const q = 'ci:wurg'
    expect(graduatedColorX(q, buildBreakdown(q), 'g')).toBe('ci>=wurg')
  })

  it('upgrades ci>= to ci: when color not in node (excludes absent colors)', () => {
    const q = 'ci>=w'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:w')
  })

  it('no change when ci:w excludes the color', () => {
    const q = 'ci:w'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci:w')
  })

  it('downgrades ci= to ci: preserving surrounding terms', () => {
    const q = 'f:edh ci=r t:creature'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('f:edh ci:r t:creature')
  })

  it('removes color from ci>= preserving surrounding terms', () => {
    const q = 'f:edh ci>=wr t:creature'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('f:edh ci>=w t:creature')
  })

  it('preserves user-typed field alias on downgrade', () => {
    const q = 'identity=r'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('identity:r')
  })

  it('appends exclusion alongside existing ci>= when color not present', () => {
    const q = 'ci>=w ci:wubg'
    expect(graduatedColorX(q, buildBreakdown(q), 'r')).toBe('ci>=w ci:wubg')
  })

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
// Spec 130: findFirstCiWubrgNode
// ---------------------------------------------------------------------------

describe('findFirstCiWubrgNode', () => {
  it('returns ci>= node when only ci>= exists', () => {
    const bd = buildBreakdown('ci>=r t:creature')
    const node = findFirstCiWubrgNode(bd)
    expect(node).not.toBeNull()
    expect(node!.label).toContain('ci>=')
    expect(node!.label).toContain('r')
  })

  it('returns ci= over ci>= (priority)', () => {
    const bd = buildBreakdown('ci=w ci>=u')
    const node = findFirstCiWubrgNode(bd)
    expect(node).not.toBeNull()
    expect(node!.label).toMatch(/ci=w/)
  })

  it('returns ci: over ci>= (priority)', () => {
    const bd = buildBreakdown('ci:u ci>=w')
    const node = findFirstCiWubrgNode(bd)
    expect(node).not.toBeNull()
    expect(node!.label).toMatch(/ci:u/)
  })

  it('skips ci:m, returns ci:u', () => {
    const bd = buildBreakdown('ci:m ci:u')
    const node = findFirstCiWubrgNode(bd)
    expect(node).not.toBeNull()
    expect(node!.label).toMatch(/ci:u/)
  })

  it('skips ci:2, returns ci:wu', () => {
    const bd = buildBreakdown('ci:2 ci:wu')
    const node = findFirstCiWubrgNode(bd)
    expect(node).not.toBeNull()
    expect(node!.label).toMatch(/ci:wu/)
  })

  it('returns null for named value ci:grixis', () => {
    const bd = buildBreakdown('ci:grixis')
    const node = findFirstCiWubrgNode(bd)
    expect(node).toBeNull()
  })

  it('returns null for ci:m only', () => {
    const bd = buildBreakdown('ci:m')
    const node = findFirstCiWubrgNode(bd)
    expect(node).toBeNull()
  })

  it('returns null when no CI node', () => {
    const bd = buildBreakdown('t:creature')
    const node = findFirstCiWubrgNode(bd)
    expect(node).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Spec 130: isWubrgColorActive
// ---------------------------------------------------------------------------

describe('isWubrgColorActive', () => {
  it('returns true for W and U when ci=w and ci>=u exist', () => {
    const bd = buildBreakdown('ci=w ci>=u')
    expect(isWubrgColorActive(bd, 'w')).toBe(true)
    expect(isWubrgColorActive(bd, 'u')).toBe(true)
  })

  it('returns false for U when only ci=w exists', () => {
    const bd = buildBreakdown('AND(ci=w)')
    expect(isWubrgColorActive(bd, 'u')).toBe(false)
  })

  it('returns false for U when only ci:m exists', () => {
    const bd = buildBreakdown('AND(ci:m)')
    expect(isWubrgColorActive(bd, 'u')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Spec 130: toggleIdentityColorChip / toggleIdentityColorlessChip
// ---------------------------------------------------------------------------

describe('toggleIdentityColorChip', () => {
  it('tap U on empty → ci:u', () => {
    expect(toggleIdentityColorChip('', null, 'u')).toBe('ci:u')
  })

  it('tap U on ci:u → empty', () => {
    const q = 'ci:u'
    expect(toggleIdentityColorChip(q, buildBreakdown(q), 'u')).toBe('')
  })

  it('tap U on ci>=u → empty', () => {
    const q = 'ci>=u'
    expect(toggleIdentityColorChip(q, buildBreakdown(q), 'u')).toBe('')
  })

  it('tap W on ci>=u → ci:wu', () => {
    const q = 'ci>=u'
    expect(toggleIdentityColorChip(q, buildBreakdown(q), 'w')).toBe('ci:wu')
  })

  it('tap U on ci:wu → ci:w', () => {
    const q = 'ci:wu'
    expect(toggleIdentityColorChip(q, buildBreakdown(q), 'u')).toBe('ci:w')
  })
})

describe('toggleIdentityColorlessChip', () => {
  it('tap C on ci=c → empty', () => {
    const q = 'ci=c'
    expect(toggleIdentityColorlessChip(q, buildBreakdown(q))).toBe('')
  })

  it('tap C on ci:c → empty', () => {
    const q = 'ci:c'
    expect(toggleIdentityColorlessChip(q, buildBreakdown(q))).toBe('')
  })

  it('tap C on ci:wr → ci=c (replaces WUBRG with colorless)', () => {
    const q = 'ci:wr'
    expect(toggleIdentityColorlessChip(q, buildBreakdown(q))).toBe('ci=c')
  })
})

describe('toggleIdentityColorChip — C interaction', () => {
  it('tap W on ci=c → ci:w (removes ci=c first)', () => {
    const q = 'ci=c'
    expect(toggleIdentityColorChip(q, buildBreakdown(q), 'w')).toBe('ci:w')
  })

  it('tap W on ci:c → ci:w', () => {
    const q = 'ci:c'
    expect(toggleIdentityColorChip(q, buildBreakdown(q), 'w')).toBe('ci:w')
  })
})

// ---------------------------------------------------------------------------
// Spec 130: cycleCiNumericChip
// ---------------------------------------------------------------------------

describe('cycleCiNumericChip', () => {
  it('appends ci=2 when neutral', () => {
    expect(cycleCiNumericChip('', null, 2)).toBe('ci=2')
  })

  it('cycles positive → negative', () => {
    const q = 'ci=2'
    expect(cycleCiNumericChip(q, buildBreakdown(q), 2)).toMatch(/-ci=2|-ci:2/)
  })

  it('detects ci:2 as positive', () => {
    const q = 'ci:2'
    const result = cycleCiNumericChip(q, buildBreakdown(q), 2)
    expect(result).toMatch(/-ci/)
  })
})
