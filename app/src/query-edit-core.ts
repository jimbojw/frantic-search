// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, BreakdownNode } from '@frantic-search/shared'
import { lex, parse, TokenType } from '@frantic-search/shared'

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

// ---------------------------------------------------------------------------
// Synchronous breakdown from query string (no worker needed)
// ---------------------------------------------------------------------------

function nodeLabel(node: ASTNode): string {
  switch (node.type) {
    case 'FIELD': {
      const src = (node as { sourceText?: string }).sourceText
      if (node.field.toLowerCase() === 'unique' && src) return src
      if (node.field.toLowerCase() === 'include' && src) return src
      return `${node.field}${node.operator}${src ?? node.value}`
    }
    case 'BARE': return node.value
    case 'EXACT': return `!"${node.value}"`
    case 'REGEX_FIELD': return `${node.field}${node.operator}/${node.pattern}/`
    case 'NOP': return '(no-op)'
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

/**
 * Parse a query string and build a BreakdownNode tree synchronously.
 * Unlike the worker's breakdown, this has no match counts — but spans are
 * guaranteed to correspond to the given query string, avoiding stale-span bugs
 * when the query signal updates faster than the worker can respond.
 */
export function parseBreakdown(query: string): BreakdownNode | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  return astToBreakdown(parse(trimmed))
}

// ---------------------------------------------------------------------------
// Node search
// ---------------------------------------------------------------------------

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

/**
 * DFS search for a BARE node matching the value predicate (e.g. #metadata tags).
 * Spec 125: used for #tag chip state detection and cycling.
 *
 * For negated=true, returns the NOT node whose child is the matching BARE (label is -value).
 * For negated=false, returns the BARE node itself.
 */
export function findBareNode(
  breakdown: BreakdownNode,
  valuePredicate: (value: string) => boolean,
  negated: boolean,
): BreakdownNode | null {
  if (negated && breakdown.type === 'NOT' && !breakdown.children) {
    const inner = breakdown.label.startsWith('-') ? breakdown.label.slice(1) : breakdown.label
    if (valuePredicate(inner)) return breakdown
  }
  if (!negated && breakdown.type === 'BARE') {
    if (valuePredicate(breakdown.label)) return breakdown
  }
  if (breakdown.children) {
    for (const child of breakdown.children) {
      const found = findBareNode(child, valuePredicate, negated)
      if (found) return found
    }
  }
  return null
}

/**
 * Collect all FIELD nodes matching the given field/operator (positive and/or negated).
 * Returns nodes in DFS order.
 */
export function collectFieldNodes(
  breakdown: BreakdownNode,
  field: string[],
  operator: string,
  opts: { positive?: boolean; negated?: boolean; valuePredicate?: (value: string) => boolean } = { positive: true, negated: true },
): BreakdownNode[] {
  const out: BreakdownNode[] = []
  const positive = opts.positive !== false
  const negated = opts.negated !== false
  function walk(node: BreakdownNode) {
    if (negated && node.type === 'NOT' && !node.children) {
      if (matchesLabel(node.label.slice(1), field, operator, opts.valuePredicate)) out.push(node)
    }
    if (positive && node.type === 'FIELD') {
      if (matchesLabel(node.label, field, operator, opts.valuePredicate)) out.push(node)
    }
    if (node.children) for (const c of node.children) walk(c)
  }
  walk(breakdown)
  return out
}

/**
 * Collect all BARE nodes matching the value predicate (positive and/or negated).
 * For negated, collects the NOT node whose child matches.
 */
export function collectBareNodes(
  breakdown: BreakdownNode,
  valuePredicate: (value: string) => boolean,
  opts: { positive?: boolean; negated?: boolean } = { positive: true, negated: true },
): BreakdownNode[] {
  const out: BreakdownNode[] = []
  function walk(node: BreakdownNode) {
    if (opts.negated && node.type === 'NOT' && !node.children) {
      const inner = node.label.startsWith('-') ? node.label.slice(1) : node.label
      if (valuePredicate(inner)) out.push(node)
    }
    if (opts.positive && node.type === 'BARE') {
      if (valuePredicate(node.label)) out.push(node)
    }
    if (node.children) for (const c of node.children) walk(c)
  }
  walk(breakdown)
  return out
}

function matchesLabel(
  label: string,
  field: string[],
  operator: string,
  valuePredicate?: (value: string) => boolean,
): boolean {
  // Display aliases ++ and @@ (Spec 048): match when searching for unique:prints or unique:art
  if (field.some(f => f.toLowerCase() === 'unique') && operator === ':') {
    if (label === '++' && (!valuePredicate || valuePredicate('prints'))) return true
    if (label === '@@' && (!valuePredicate || valuePredicate('art'))) return true
  }
  // Frantic Search–exclusive alias (Spec 057): ** → include:extras
  if (field.some(f => f.toLowerCase() === 'include') && operator === ':') {
    if (label === '**' && (!valuePredicate || valuePredicate('extras'))) return true
  }

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
    let span = target.span
    // Spec 071: extend span to include surrounding parens when target was parsed from (expr)
    if (
      span.start > 0 &&
      span.end < query.length &&
      query[span.start - 1] === '(' &&
      query[span.end] === ')'
    ) {
      span = { start: span.start - 1, end: span.end + 1 }
    }
    const result = spliceQuery(query, span, '')
    return result.replace(/  +/g, ' ').trim()
  }

  return ''
}

// ---------------------------------------------------------------------------
// Append helper (seal + OR-root wrapping)
// ---------------------------------------------------------------------------

export function appendTerm(
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

export function prependTerm(
  query: string,
  term: string,
  breakdown: BreakdownNode | null,
): string {
  const trimmed = query.trim()
  if (!trimmed) return term
  const sealed = sealQuery(trimmed)
  const termBd = parseBreakdown(term.trim())
  const termNeedsParens = termBd?.type === 'OR'
  const liveNeedsParens = breakdown?.type === 'OR'
  const termPart = termNeedsParens ? `(${term})` : term
  const livePart = liveNeedsParens ? `(${sealed})` : sealed
  return `${termPart} ${livePart}`
}

// ---------------------------------------------------------------------------
// Clear field-family filters (generic)
// ---------------------------------------------------------------------------

export function isFieldLabel(
  label: string,
  fields: string[],
  operators: string[],
): boolean {
  const raw = label.startsWith('-') ? label.slice(1) : label
  const lower = raw.toLowerCase()
  for (const f of fields) {
    for (const op of operators) {
      if (lower.startsWith(f + op)) return true
    }
  }
  return false
}

export function clearFieldTerms(
  query: string,
  breakdown: BreakdownNode | null,
  predicate: (label: string) => boolean,
): string {
  if (!breakdown || !query.trim()) return query

  if (predicate(breakdown.label)) return ''

  if (!breakdown.children) return query

  const targets = breakdown.children.filter(
    child => child.span && predicate(child.label),
  )
  if (targets.length === 0) return query

  targets.sort((a, b) => b.span!.start - a.span!.start)
  let result = query
  for (const t of targets) {
    result = spliceQuery(result, t.span!, '')
  }
  return result.replace(/  +/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Recursive clear (Spec 102 — nested structures)
// ---------------------------------------------------------------------------

function collectNodesByPredicate(
  node: BreakdownNode,
  predicate: (label: string) => boolean,
  out: BreakdownNode[],
): void {
  if (node.type === 'FIELD' && predicate(node.label)) {
    out.push(node)
    return
  }
  if (node.type === 'NOT' && !node.children && predicate(node.label)) {
    out.push(node)
    return
  }
  if (node.children) {
    for (const c of node.children) {
      collectNodesByPredicate(c, predicate, out)
    }
  }
}

/**
 * Recursively remove all nodes whose label matches the predicate.
 * Handles nested structures (e.g. edhrec terms inside OR children).
 */
export function clearFieldTermsRecursive(
  query: string,
  breakdown: BreakdownNode | null,
  predicate: (label: string) => boolean,
): string {
  if (!breakdown || !query.trim()) return query
  const nodes: BreakdownNode[] = []
  collectNodesByPredicate(breakdown, predicate, nodes)
  if (nodes.length === 0) return query
  if (nodes.length === 1 && breakdown === nodes[0]) return ''
  nodes.sort((a, b) => (b.span?.end ?? 0) - (a.span?.end ?? 0))
  let result = query
  for (const n of nodes) {
    if (n.span) {
      let span = n.span
      if (
        span.start > 0 &&
        span.end < result.length &&
        result[span.start - 1] === '(' &&
        result[span.end] === ')'
      ) {
        span = { start: span.start - 1, end: span.end + 1 }
      }
      result = spliceQuery(result, span, '')
    }
  }
  return result.replace(/  +/g, ' ').trim()
}
