// SPDX-License-Identifier: Apache-2.0
import type { BreakdownNode } from '@frantic-search/shared'
import { lex, TokenType } from '@frantic-search/shared'

/**
 * Close any unclosed syntactic constructs (quotes, regex, parentheses) so that
 * appending a new term to the query produces the expected tokenization rather
 * than being swallowed by an open delimiter.
 */
export function sealQuery(query: string): string {
  if (!query) return query

  const tokens = lex(query)
  let result = query

  const last = tokens.length >= 2 ? tokens[tokens.length - 2] : null
  if (last) {
    const source = query.slice(last.start, last.end)
    if (last.type === TokenType.QUOTED) {
      const openChar = query[last.start]
      if (source.length === 1 || source[source.length - 1] !== openChar) {
        result += openChar
      }
    } else if (last.type === TokenType.REGEX) {
      if (source.length === 1 || source[source.length - 1] !== '/') {
        result += '/'
      }
    }
  }

  let parenDepth = 0
  for (const tok of tokens) {
    if (tok.type === TokenType.LPAREN) parenDepth++
    else if (tok.type === TokenType.RPAREN) parenDepth--
  }
  if (parenDepth > 0) {
    result += ')'.repeat(parenDepth)
  }

  return result
}

// ---------------------------------------------------------------------------
// Core utilities
// ---------------------------------------------------------------------------

export function spliceQuery(
  query: string,
  span: { start: number; end: number },
  replacement: string,
): string {
  return query.slice(0, span.start) + replacement + query.slice(span.end)
}

/**
 * Extract the value portion from a BreakdownNode label.
 * Label format: `[-]field operator value`  (e.g. `ci>=r`, `-t:creature`)
 */
export function extractValue(label: string, operator: string): string {
  const raw = label.startsWith('-') ? label.slice(1) : label
  const opIdx = raw.indexOf(operator)
  return opIdx >= 0 ? raw.slice(opIdx + operator.length) : ''
}

/**
 * DFS search for a matching FIELD node in the breakdown tree.
 * Returns the first match (leftmost / earliest in query string order).
 *
 * For negated=true, returns the NOT node (whose label is `-field op value`).
 * For negated=false, returns the FIELD node itself.
 *
 * An optional valuePredicate filters by the extracted value from the label.
 */
export function findFieldNode(
  breakdown: BreakdownNode,
  field: string[],
  operator: string,
  negated: boolean,
  valuePredicate?: (value: string) => boolean,
): BreakdownNode | null {
  if (negated && breakdown.type === 'NOT' && !breakdown.children) {
    if (matchesLabel(breakdown.label.slice(1), field, operator, valuePredicate)) {
      return breakdown
    }
  }

  if (!negated && breakdown.type === 'FIELD') {
    if (matchesLabel(breakdown.label, field, operator, valuePredicate)) {
      return breakdown
    }
  }

  if (breakdown.children) {
    for (const child of breakdown.children) {
      const found = findFieldNode(child, field, operator, negated, valuePredicate)
      if (found) return found
    }
  }

  return null
}

function matchesLabel(
  label: string,
  field: string[],
  operator: string,
  valuePredicate?: (value: string) => boolean,
): boolean {
  const opIdx = label.indexOf(operator)
  if (opIdx < 0) return false
  const labelField = label.slice(0, opIdx).toLowerCase()
  if (!field.some(f => f.toLowerCase() === labelField)) return false
  if (valuePredicate) {
    const value = label.slice(opIdx + operator.length)
    if (!valuePredicate(value)) return false
  }
  return true
}

/**
 * Remove a node from the query string. Handles:
 * - Single-term removal (target is root) → empty string
 * - Leaf of root AND/OR → splice out span, clean whitespace
 */
export function removeNode(
  query: string,
  target: BreakdownNode,
  root: BreakdownNode,
): string {
  if (target === root || !root.children) {
    return ''
  }

  if (root.children.includes(target) && target.span) {
    const result = spliceQuery(query, target.span, '')
    return result.replace(/  +/g, ' ').trim()
  }

  return ''
}

// ---------------------------------------------------------------------------
// Append helper (seal + OR-root wrapping)
// ---------------------------------------------------------------------------

function appendTerm(
  query: string,
  term: string,
  breakdown: BreakdownNode | null,
): string {
  const trimmed = query.trim()
  if (!trimmed) return term
  const sealed = sealQuery(trimmed)
  const needsParens = breakdown?.type === 'OR'
  return needsParens ? `(${sealed}) ${term}` : `${sealed} ${term}`
}

// ---------------------------------------------------------------------------
// WUBRG color helpers
// ---------------------------------------------------------------------------

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
      const newMask = mask & ~colorBit
      if (newMask === 0) {
        // Single-color: downgrade operator to >=
        return spliceOpAndValue(query, colonNode, ':', '>=', val)
      }
      // Multi-color: remove C from allowed set
      return spliceQuery(query, colonNode.valueSpan!, serializeColors(newMask))
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
// Graduated: Simple (independent node-level "more / less")
// Used for multicolor, MV, and type toggles.
//
// Bar callers pass negated=false; × callers pass negated=true.
// 1. Same-polarity node exists → no change (already active)
// 2. Opposite-polarity node exists → remove it (cross-cancel)
// 3. Neither → append
// ---------------------------------------------------------------------------

export function toggleSimple(
  query: string,
  breakdown: BreakdownNode | null,
  opts: {
    field: string[]
    operator: string
    negated: boolean
    value: string
    appendTerm: string
  },
): string {
  const same = breakdown
    ? findFieldNode(breakdown, opts.field, opts.operator, opts.negated, v => v === opts.value)
    : null
  if (same) return query

  const opposite = breakdown
    ? findFieldNode(breakdown, opts.field, opts.operator, !opts.negated, v => v === opts.value)
    : null
  if (opposite) return removeNode(query, opposite, breakdown!)

  return appendTerm(query, opts.appendTerm, breakdown)
}

// ---------------------------------------------------------------------------
// Clear all color identity filters
// ---------------------------------------------------------------------------

const CI_OPS = ['>=', ':', '=']

function isCILabel(label: string): boolean {
  const raw = label.startsWith('-') ? label.slice(1) : label
  const lower = raw.toLowerCase()
  for (const f of CI_FIELDS) {
    for (const op of CI_OPS) {
      if (lower.startsWith(f + op)) return true
    }
  }
  return false
}

export function clearColorIdentity(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  if (!breakdown || !query.trim()) return query

  if (isCILabel(breakdown.label)) return ''

  if (!breakdown.children) return query

  const targets = breakdown.children.filter(
    child => child.span && isCILabel(child.label),
  )
  if (targets.length === 0) return query

  targets.sort((a, b) => b.span!.start - a.span!.start)
  let result = query
  for (const t of targets) {
    result = spliceQuery(result, t.span!, '')
  }
  return result.replace(/  +/g, ' ').trim()
}
