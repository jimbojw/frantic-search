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
const CI_FIELDS = ['ci', 'identity', 'id', 'commander', 'cmd']
const WUBRG_VALUE_RE = /^[wubrg]+$/i

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
  const opStart = node.valueSpan!.start - currentOp.length
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
