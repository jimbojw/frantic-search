// SPDX-License-Identifier: Apache-2.0

import type { ASTNode, Span } from './search/ast'
import { parse } from './search/parser'

/** Spec 158: registry row metadata for mistaken field names → canonical `t:` (type line). */
export type NonexistentFieldRegistryEntry = {
  canonical: string
  explain: string
  docRef: string
}

const TYPE_LINE_EXPLAIN =
  'The type field matches anything in the type line, including subtypes and supertypes.'

const NONEXISTENT_FIELD_REGISTRY: Record<string, NonexistentFieldRegistryEntry> = {
  supertype: {
    canonical: 't',
    explain: TYPE_LINE_EXPLAIN,
    docRef: 'reference/fields/face/type',
  },
  subtype: {
    canonical: 't',
    explain: TYPE_LINE_EXPLAIN,
    docRef: 'reference/fields/face/type',
  },
}

export function getNonexistentFieldRewrite(fieldLower: string): NonexistentFieldRegistryEntry | null {
  return NONEXISTENT_FIELD_REGISTRY[fieldLower] ?? null
}

export type NonexistentFieldRewrite = {
  span: Span
  label: string
  explain: string
  docRef: string
}

function spliceQuery(query: string, span: Span, replacement: string): string {
  return query.slice(0, span.start) + replacement + query.slice(span.end)
}

function rewriteFieldClause(
  query: string,
  field: string,
  operator: string,
  value: string,
  valueSpan: Span | undefined,
  negated: boolean,
): { clause: string; meta: NonexistentFieldRegistryEntry } | null {
  const meta = getNonexistentFieldRewrite(field.toLowerCase())
  if (!meta || !value) return null
  const valueLiteral = valueSpan ? query.slice(valueSpan.start, valueSpan.end) : value
  const clause = meta.canonical + operator + valueLiteral
  return { clause: negated ? `-${clause}` : clause, meta }
}

function rewriteRegexClause(
  field: string,
  operator: string,
  pattern: string,
  negated: boolean,
): { clause: string; meta: NonexistentFieldRegistryEntry } | null {
  const meta = getNonexistentFieldRewrite(field.toLowerCase())
  if (!meta || !pattern) return null
  const clause = meta.canonical + operator + '/' + pattern + '/'
  return { clause: negated ? `-${clause}` : clause, meta }
}

function walk(node: ASTNode, query: string, out: NonexistentFieldRewrite[]): void {
  switch (node.type) {
    case 'AND':
    case 'OR':
      for (const c of node.children) walk(c, query, out)
      return
    case 'NOT': {
      const c = node.child
      if (c.type === 'FIELD' && c.span && node.span) {
        const rw = rewriteFieldClause(query, c.field, c.operator, c.value, c.valueSpan, true)
        if (rw) {
          out.push({
            span: node.span,
            label: rw.clause,
            explain: rw.meta.explain,
            docRef: rw.meta.docRef,
          })
        }
        return
      }
      if (c.type === 'REGEX_FIELD' && c.span && node.span) {
        const rw = rewriteRegexClause(c.field, c.operator, c.pattern, true)
        if (rw) {
          out.push({
            span: node.span,
            label: rw.clause,
            explain: rw.meta.explain,
            docRef: rw.meta.docRef,
          })
        }
        return
      }
      walk(c, query, out)
      return
    }
    case 'FIELD':
      if (node.span) {
        const rw = rewriteFieldClause(query, node.field, node.operator, node.value, node.valueSpan, false)
        if (rw) {
          out.push({
            span: node.span,
            label: rw.clause,
            explain: rw.meta.explain,
            docRef: rw.meta.docRef,
          })
        }
      }
      return
    case 'REGEX_FIELD':
      if (node.span) {
        const rw = rewriteRegexClause(node.field, node.operator, node.pattern, false)
        if (rw) {
          out.push({
            span: node.span,
            label: rw.clause,
            explain: rw.meta.explain,
            docRef: rw.meta.docRef,
          })
        }
      }
      return
    default:
      return
  }
}

/**
 * Spec 158: collect rewrite candidates for registry-matched nonexistent fields on the effective query.
 * Uses trim(query) for parse/splice coordinates (same family as parseBreakdown).
 */
export function collectNonexistentFieldRewrites(query: string): NonexistentFieldRewrite[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const raw: NonexistentFieldRewrite[] = []
  walk(parse(trimmed), trimmed, raw)

  const seen = new Set<string>()
  const out: NonexistentFieldRewrite[] = []
  for (const e of raw) {
    const q = spliceQuery(trimmed, e.span, e.label)
    if (seen.has(q)) continue
    seen.add(q)
    out.push(e)
  }
  return out
}
