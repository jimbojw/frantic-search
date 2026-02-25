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
// Toggle: Color Identity drill (shared ci>= node)
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
// Toggle: Color Identity exclude (shared ci: node, WUBRG subset)
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
// Toggle: Simple (independent node-level toggle)
// Used for colorless, multicolor, MV, and type toggles.
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
  const node = breakdown
    ? findFieldNode(breakdown, opts.field, opts.operator, opts.negated, v => v === opts.value)
    : null

  if (node) {
    return removeNode(query, node, breakdown!)
  }
  return appendTerm(query, opts.appendTerm, breakdown)
}
