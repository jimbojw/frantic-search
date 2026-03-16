// SPDX-License-Identifier: Apache-2.0
import type { BreakdownNode } from '@frantic-search/shared'
import {
  findFieldNode,
  extractValue,
  spliceQuery,
  removeNode,
  appendTerm,
  isFieldLabel,
  clearFieldTerms,
  parseBreakdown,
} from './query-edit-core'

const WUBRG = 'wubrg'
const COLOR_BIT: Record<string, number> = { w: 1, u: 2, b: 4, r: 8, g: 16 }

function parseColorMask(value: string): number {
  let mask = 0
  for (const ch of value.toLowerCase()) {
    if (ch in COLOR_BIT) mask |= COLOR_BIT[ch]
  }
  return mask
}

function serializeColors(mask: number): string {
  let result = ''
  for (const ch of WUBRG) {
    if (mask & COLOR_BIT[ch]) result += ch
  }
  return result
}

const ALL_FIVE = parseColorMask('wubrg')
export const CI_FIELDS = ['ci', 'identity', 'id', 'commander', 'cmd']
const WUBRG_VALUE_RE = /^[wubrg]+$/i

/** Value predicate for ci= that excludes ci=c and only matches WUBRG. */
function wubrgEqPredicate(v: string): boolean {
  return v.toLowerCase() !== 'c' && WUBRG_VALUE_RE.test(v)
}

function getCiNodeOperator(label: string): string {
  return label.includes('>=') ? '>=' : label.includes('=') ? '=' : ':'
}

// ---------------------------------------------------------------------------
// Operator splice helper
// ---------------------------------------------------------------------------

function spliceOpAndValue(
  query: string,
  node: BreakdownNode,
  currentOp: string,
  newOp: string,
  newValue: string,
): string {
  // Operator position: label has "fieldOpValue"; op starts at label.indexOf(op).
  // For root-level nodes, span.start is 0; for nested, span matches query position.
  const opOffsetInLabel = node.label.indexOf(currentOp)
  const opStart =
    opOffsetInLabel >= 0 && node.span
      ? node.span.start + opOffsetInLabel
      : node.valueSpan!.start - currentOp.length
  return spliceQuery(query, { start: opStart, end: node.valueSpan!.end }, newOp + newValue)
}

// ---------------------------------------------------------------------------
// Toggle: Color Identity drill (shared ci>= node) — LEGACY, kept for
// existing call sites until migration is complete.
// ---------------------------------------------------------------------------

export function toggleColorDrill(
  query: string,
  breakdown: BreakdownNode | null,
  color: string,
): string {
  const colorBit = COLOR_BIT[color.toLowerCase()]
  if (!colorBit) return query

  const node = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, '>=', false)
    : null

  if (!node) {
    return appendTerm(query, `ci>=${color.toLowerCase()}`, breakdown)
  }

  const currentValue = extractValue(node.label, '>=')
  const currentMask = parseColorMask(currentValue)
  const hasColor = (currentMask & colorBit) !== 0

  if (hasColor) {
    const newMask = currentMask & ~colorBit
    if (newMask === 0) {
      return removeNode(query, node, breakdown!)
    }
    return spliceQuery(query, node.valueSpan!, serializeColors(newMask))
  } else {
    const newMask = currentMask | colorBit
    return spliceQuery(query, node.valueSpan!, serializeColors(newMask))
  }
}

// ---------------------------------------------------------------------------
// Graduated: Color Identity bar ("more of this color")  — Spec 043
// ---------------------------------------------------------------------------

export function graduatedColorBar(
  query: string,
  breakdown: BreakdownNode | null,
  color: string,
): string {
  const colorBit = COLOR_BIT[color.toLowerCase()]
  if (!colorBit) return query
  const c = color.toLowerCase()

  const eqNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '=', false) : null
  if (eqNode) {
    const val = extractValue(eqNode.label, '=')
    const mask = parseColorMask(val)
    if (mask & colorBit) return query
    const newMask = mask | colorBit
    if (newMask === ALL_FIVE) {
      return removeNode(query, eqNode, breakdown!)
    }
    return spliceOpAndValue(query, eqNode, '=', ':', serializeColors(newMask))
  }

  const colonNode = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, ':', false, v => WUBRG_VALUE_RE.test(v))
    : null
  if (colonNode) {
    const val = extractValue(colonNode.label, ':')
    const mask = parseColorMask(val)
    if (mask & colorBit) {
      return spliceOpAndValue(query, colonNode, ':', '=', val)
    }
    const newMask = mask | colorBit
    if (newMask === ALL_FIVE) {
      return removeNode(query, colonNode, breakdown!)
    }
    return spliceQuery(query, colonNode.valueSpan!, serializeColors(newMask))
  }

  const gteNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '>=', false) : null
  if (gteNode) {
    const val = extractValue(gteNode.label, '>=')
    const mask = parseColorMask(val)
    if (mask & colorBit) {
      if (mask === ALL_FIVE) {
        return removeNode(query, gteNode, breakdown!)
      }
      return spliceOpAndValue(query, gteNode, '>=', ':', val)
    }
    const newMask = mask | colorBit
    if (newMask === ALL_FIVE) {
      return removeNode(query, gteNode, breakdown!)
    }
    return spliceQuery(query, gteNode.valueSpan!, serializeColors(newMask))
  }

  return appendTerm(query, `ci>=${c}`, breakdown)
}

// ---------------------------------------------------------------------------
// Graduated: Color Identity × ("less of this color")  — Spec 043
// ---------------------------------------------------------------------------

export function graduatedColorX(
  query: string,
  breakdown: BreakdownNode | null,
  color: string,
): string {
  const colorBit = COLOR_BIT[color.toLowerCase()]
  if (!colorBit) return query

  // 1. ci= node
  const eqNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '=', false) : null
  if (eqNode) {
    const val = extractValue(eqNode.label, '=')
    const mask = parseColorMask(val)
    if (mask & colorBit) {
      if (mask === ALL_FIVE) {
        return removeNode(query, eqNode, breakdown!)
      }
      return spliceOpAndValue(query, eqNode, '=', ':', val)
    }
    return query
  }

  // 2. ci: WUBRG node
  const colonNode = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, ':', false, v => WUBRG_VALUE_RE.test(v))
    : null
  if (colonNode) {
    const val = extractValue(colonNode.label, ':')
    const mask = parseColorMask(val)
    if (mask & colorBit) {
      // Downgrade operator from : to >= (symmetric with bar tap upgrade)
      return spliceOpAndValue(query, colonNode, ':', '>=', val)
    }
    return query
  }

  // 3. ci>= node
  const gteNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '>=', false) : null
  if (gteNode) {
    const val = extractValue(gteNode.label, '>=')
    const mask = parseColorMask(val)
    if (mask & colorBit) {
      const newMask = mask & ~colorBit
      if (newMask === 0) {
        return removeNode(query, gteNode, breakdown!)
      }
      return spliceQuery(query, gteNode.valueSpan!, serializeColors(newMask))
    }
    // C not in ci>= — upgrade to ci: to exclude absent colors (including C)
    return spliceOpAndValue(query, gteNode, '>=', ':', val)
  }

  // 4. No CI node at all — append exclusion term
  const newMask = ALL_FIVE & ~colorBit
  return appendTerm(query, `ci:${serializeColors(newMask)}`, breakdown)
}

// ---------------------------------------------------------------------------
// Graduated: Colorless bar / × — Spec 043
// ---------------------------------------------------------------------------

export function colorlessBar(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  // 1. ci=c already present → no change
  const eqC = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, '=', false, v => v.toLowerCase() === 'c')
    : null
  if (eqC) return query

  // 2. -ci=c present → remove it (un-exclude)
  const negEqC = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, '=', true, v => v.toLowerCase() === 'c')
    : null
  if (negEqC) return removeNode(query, negEqC, breakdown!)

  // 3. ci>= exists → downgrade to ci: (includes colorless via subset semantics)
  const gteNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '>=', false) : null
  if (gteNode) {
    const val = extractValue(gteNode.label, '>=')
    if (parseColorMask(val) === ALL_FIVE) {
      return removeNode(query, gteNode, breakdown!)
    }
    return spliceOpAndValue(query, gteNode, '>=', ':', val)
  }

  // 4. ci= WUBRG exists → downgrade to ci: (relax to include colorless)
  const eqNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '=', false) : null
  if (eqNode) {
    const val = extractValue(eqNode.label, '=')
    if (parseColorMask(val) === ALL_FIVE) {
      return removeNode(query, eqNode, breakdown!)
    }
    return spliceOpAndValue(query, eqNode, '=', ':', val)
  }

  // 5. ci: WUBRG exists → colorless already included, so "more colorless" means
  //    narrow to exclusively colorless: splice to ci=c.
  const colonNode = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, ':', false, v => WUBRG_VALUE_RE.test(v))
    : null
  if (colonNode) return spliceOpAndValue(query, colonNode, ':', '=', 'c')

  // 6. No relevant node → append ci=c
  return appendTerm(query, 'ci=c', breakdown)
}

export function colorlessX(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  // 1. ci=c exists → remove it
  const eqC = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, '=', false, v => v.toLowerCase() === 'c')
    : null
  if (eqC) return removeNode(query, eqC, breakdown!)

  // 2. -ci=c already present → no change
  const negEqC = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, '=', true, v => v.toLowerCase() === 'c')
    : null
  if (negEqC) return query

  // 3. ci= WUBRG exists → colorless implicitly excluded, no change
  const eqNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '=', false) : null
  if (eqNode) return query

  // 4. ci: WUBRG exists → upgrade to ci= to exclude colorless
  const colonNode = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, ':', false, v => WUBRG_VALUE_RE.test(v))
    : null
  if (colonNode) {
    const val = extractValue(colonNode.label, ':')
    return spliceOpAndValue(query, colonNode, ':', '=', val)
  }

  // 5. ci>= exists → colorless implicitly excluded, no change
  const gteNode = breakdown ? findFieldNode(breakdown, CI_FIELDS, '>=', false) : null
  if (gteNode) return query

  // 6. No relevant node → append -ci=c
  return appendTerm(query, '-ci=c', breakdown)
}

// ---------------------------------------------------------------------------
// Toggle: Color Identity exclude (shared ci: node, WUBRG subset)
// — LEGACY, kept for existing call sites until migration is complete.
// ---------------------------------------------------------------------------

export function toggleColorExclude(
  query: string,
  breakdown: BreakdownNode | null,
  color: string,
): string {
  const colorBit = COLOR_BIT[color.toLowerCase()]
  if (!colorBit) return query

  const node = breakdown
    ? findFieldNode(breakdown, CI_FIELDS, ':', false, v => WUBRG_VALUE_RE.test(v))
    : null

  if (!node) {
    const newMask = ALL_FIVE & ~colorBit
    return appendTerm(query, `ci:${serializeColors(newMask)}`, breakdown)
  }

  const currentValue = extractValue(node.label, ':')
  const currentMask = parseColorMask(currentValue)
  const hasColor = (currentMask & colorBit) !== 0

  if (hasColor) {
    // Color is present → exclude it (remove from allowed set)
    const newMask = currentMask & ~colorBit
    if (newMask === 0) {
      return removeNode(query, node, breakdown!)
    }
    return spliceQuery(query, node.valueSpan!, serializeColors(newMask))
  } else {
    // Color is absent (excluded) → un-exclude (add back)
    const newMask = currentMask | colorBit
    if (newMask === ALL_FIVE) {
      return removeNode(query, node, breakdown!)
    }
    return spliceQuery(query, node.valueSpan!, serializeColors(newMask))
  }
}

// ---------------------------------------------------------------------------
// Spec 130: MenuDrawer COLOR section — shared helpers
// ---------------------------------------------------------------------------

/**
 * Returns the first CI node in priority order: ci= (WUBRG) > ci: (WUBRG) > ci>= (WUBRG).
 * Excludes ci=c, ci:m, ci:1–ci:5, and named values (e.g. grixis).
 */
export function findFirstCiWubrgNode(
  breakdown: BreakdownNode | null,
): BreakdownNode | null {
  if (!breakdown) return null

  const eqNode = findFieldNode(breakdown, CI_FIELDS, '=', false, wubrgEqPredicate)
  if (eqNode) return eqNode

  const colonNode = findFieldNode(
    breakdown,
    CI_FIELDS,
    ':',
    false,
    v => WUBRG_VALUE_RE.test(v),
  )
  if (colonNode) return colonNode

  const gteNode = findFieldNode(
    breakdown,
    CI_FIELDS,
    '>=',
    false,
    v => WUBRG_VALUE_RE.test(v),
  )
  return gteNode
}

/**
 * Returns true if the color letter appears in any un-negated CI node whose value
 * matches WUBRG_VALUE_RE. Matches histogram WUBRG active state.
 */
export function isWubrgColorActive(
  breakdown: BreakdownNode | null,
  color: string,
): boolean {
  if (!breakdown) return false
  const c = color.toLowerCase()
  if (!WUBRG.includes(c)) return false

  const eqNode = findFieldNode(breakdown, CI_FIELDS, '=', false, wubrgEqPredicate)
  if (eqNode && extractValue(eqNode.label, '=').toLowerCase().includes(c))
    return true

  const colonNode = findFieldNode(
    breakdown,
    CI_FIELDS,
    ':',
    false,
    v => WUBRG_VALUE_RE.test(v),
  )
  if (colonNode && extractValue(colonNode.label, ':').toLowerCase().includes(c))
    return true

  const gteNode = findFieldNode(
    breakdown,
    CI_FIELDS,
    '>=',
    false,
    v => WUBRG_VALUE_RE.test(v),
  )
  if (gteNode && extractValue(gteNode.label, '>=').toLowerCase().includes(c))
    return true

  return false
}

export type IdentityColorChipState = {
  wubrg: { w: boolean; u: boolean; b: boolean; r: boolean; g: boolean }
  colorless: boolean
  numeric: Record<number, 'neutral' | 'positive' | 'negative'>
  multicolor: 'neutral' | 'positive' | 'negative'
}

/**
 * Returns chip state for the MenuDrawer COLOR section.
 * C chip: active only when ci=c or ci:c exists (intentionally different from histogram).
 */
export function getIdentityColorChipState(
  breakdown: BreakdownNode | null,
): IdentityColorChipState {
  const wubrg = {
    w: isWubrgColorActive(breakdown, 'w'),
    u: isWubrgColorActive(breakdown, 'u'),
    b: isWubrgColorActive(breakdown, 'b'),
    r: isWubrgColorActive(breakdown, 'r'),
    g: isWubrgColorActive(breakdown, 'g'),
  }

  const colorless =
    !!(
      breakdown &&
      (findFieldNode(breakdown, CI_FIELDS, '=', false, v => v.toLowerCase() === 'c') ||
        findFieldNode(breakdown, CI_FIELDS, ':', false, v => v.toLowerCase() === 'c'))
    )

  const numeric: Record<number, 'neutral' | 'positive' | 'negative'> = {}
  for (let n = 1; n <= 5; n++) {
    const val = String(n)
    const pos =
      breakdown &&
      (findFieldNode(breakdown, CI_FIELDS, '=', false, v => v === val) ||
        findFieldNode(breakdown, CI_FIELDS, ':', false, v => v === val))
    const neg =
      breakdown &&
      (findFieldNode(breakdown, CI_FIELDS, '=', true, v => v === val) ||
        findFieldNode(breakdown, CI_FIELDS, ':', true, v => v === val))
    numeric[n] = pos ? 'positive' : neg ? 'negative' : 'neutral'
  }

  let multicolor: 'neutral' | 'positive' | 'negative' = 'neutral'
  if (breakdown) {
    if (findFieldNode(breakdown, CI_FIELDS, ':', false, v => v === 'm'))
      multicolor = 'positive'
    else if (findFieldNode(breakdown, CI_FIELDS, ':', true, v => v === 'm'))
      multicolor = 'negative'
  }

  return { wubrg, colorless, numeric, multicolor }
}

/**
 * Binary toggle for WUBRG chips. Uses findFirstCiWubrgNode for write target.
 * Active → inactive: remove color; inactive → active: add color (remove ci=c first).
 * Edits that would produce ci:wubrg remove the node instead.
 */
export function toggleIdentityColorChip(
  query: string,
  breakdown: BreakdownNode | null,
  color: string,
): string {
  const colorBit = COLOR_BIT[color.toLowerCase()]
  if (!colorBit) return query
  const c = color.toLowerCase()

  const node = findFirstCiWubrgNode(breakdown)
  const op = node ? getCiNodeOperator(node.label) : ''
  const hasColor = node
    ? (parseColorMask(extractValue(node.label, op)) & colorBit) !== 0
    : false

  if (hasColor && node) {
    // Active → inactive: remove color from node
    const val = extractValue(node.label, op)
    const mask = parseColorMask(val)
    const newMask = mask & ~colorBit
    if (newMask === 0) {
      return removeNode(query, node, breakdown!)
    }
    const newVal = serializeColors(newMask)
    return spliceOpAndValue(query, node, op, ':', newVal)
  }

  // Inactive → active: remove ci=c/ci:c first, then add color
  let q = query
  let bd = breakdown

  const eqC =
    bd &&
    (findFieldNode(bd, CI_FIELDS, '=', false, v => v.toLowerCase() === 'c') ||
      findFieldNode(bd, CI_FIELDS, ':', false, v => v.toLowerCase() === 'c'))
  if (eqC) {
    q = removeNode(q, eqC, bd!)
    bd = parseBreakdown(q)
  }

  const wubrgNode = findFirstCiWubrgNode(bd)
  if (wubrgNode) {
    const op = getCiNodeOperator(wubrgNode.label)
    const val = extractValue(wubrgNode.label, op)
    const mask = parseColorMask(val)
    const newMask = mask | colorBit
    if (newMask === ALL_FIVE) {
      return removeNode(q, wubrgNode, bd!)
    }
    const newVal = serializeColors(newMask)
    // Replace entire node to avoid span/offset bugs
    const field = wubrgNode.label.slice(0, wubrgNode.label.indexOf(op))
    return wubrgNode.span
      ? spliceQuery(q, wubrgNode.span, field + ':' + newVal)
      : spliceOpAndValue(q, wubrgNode, op, ':', newVal)
  }

  return appendTerm(q, `ci:${c}`, bd)
}

/**
 * Binary toggle for C chip. Active only when ci=c or ci:c exists.
 */
export function toggleIdentityColorlessChip(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  const eqC =
    breakdown &&
    (findFieldNode(breakdown, CI_FIELDS, '=', false, v => v.toLowerCase() === 'c') ||
      findFieldNode(breakdown, CI_FIELDS, ':', false, v => v.toLowerCase() === 'c'))

  if (eqC) {
    return removeNode(query, eqC, breakdown!)
  }

  // Inactive → active: replace WUBRG node with ci=c or append ci=c
  const wubrgNode = findFirstCiWubrgNode(breakdown)
  if (wubrgNode) {
    return spliceOpAndValue(
      query,
      wubrgNode,
      wubrgNode.label.includes('=') ? '=' : wubrgNode.label.includes(':') ? ':' : '>=',
      '=',
      'c',
    )
  }
  return appendTerm(query, 'ci=c', breakdown)
}

/**
 * Tri-state cycle for ci=1–ci=5. Detects ci:N or ci=N for active state.
 * Writes ci=N when appending.
 */
export function cycleCiNumericChip(
  query: string,
  breakdown: BreakdownNode | null,
  n: number,
): string {
  const value = String(n)
  const term = `ci=${value}`

  const positive =
    breakdown &&
    (findFieldNode(breakdown, CI_FIELDS, '=', false, v => v === value) ||
      findFieldNode(breakdown, CI_FIELDS, ':', false, v => v === value))
  const negative =
    breakdown &&
    (findFieldNode(breakdown, CI_FIELDS, '=', true, v => v === value) ||
      findFieldNode(breakdown, CI_FIELDS, ':', true, v => v === value))

  if (positive) {
    const negatedTerm = `-${positive.label}`
    const removed = removeNode(query, positive, breakdown!)
    const freshBd = parseBreakdown(removed)
    return appendTerm(removed, negatedTerm, freshBd)
  }
  if (negative) {
    return removeNode(query, negative, breakdown!)
  }
  return appendTerm(query, term, breakdown)
}

// ---------------------------------------------------------------------------
// clearColorIdentity
// ---------------------------------------------------------------------------

const CI_OPS = ['>=', ':', '=']

export function isCILabel(label: string): boolean {
  return isFieldLabel(label, CI_FIELDS, CI_OPS)
}

export function clearColorIdentity(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  return clearFieldTerms(query, breakdown, isCILabel)
}
