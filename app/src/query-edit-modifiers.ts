// SPDX-License-Identifier: Apache-2.0
import type { BreakdownNode } from '@frantic-search/shared'
import { getUniqueModeFromQuery, DEFAULT_LIST_ID, TRASH_LIST_ID } from '@frantic-search/shared'
import {
  findFieldNode,
  findBareNode,
  extractValue,
  spliceQuery,
  removeNode,
  appendTerm,
  parseBreakdown,
  sealQuery,
  isFieldLabel,
  clearFieldTerms,
} from './query-edit-core'
import { cycleChip } from './query-edit-chips'

// ---------------------------------------------------------------------------
// Bimodal toggle: unique:prints (Spec 048) — deprecated, use setUniqueTerm
// ---------------------------------------------------------------------------

const UNIQUE_FIELDS = ['unique']

export function toggleUniquePrints(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  const node = breakdown
    ? findFieldNode(breakdown, UNIQUE_FIELDS, ':', false, v => v === 'prints')
    : null
  if (node) return removeNode(query, node, breakdown!)
  return appendTerm(query, 'unique:prints', breakdown)
}

export function hasUniquePrints(breakdown: BreakdownNode | null): boolean {
  if (!breakdown) return false
  return findFieldNode(breakdown, UNIQUE_FIELDS, ':', false, v => v === 'prints') !== null
}

/** True when query contains my: (e.g. my:list) in positive form. Used for list-entry aggregation counts (Spec 087). */
export function hasMyInQuery(breakdown: BreakdownNode | null): boolean {
  if (!breakdown) return false
  return findFieldNode(breakdown, ['my'], ':', false) !== null
}

/** True when query contains a positive # metadata term (Spec 123). Used for empty-list CTA (Spec 126). */
export function hasHashInQuery(breakdown: BreakdownNode | null): boolean {
  if (!breakdown) return false
  return findBareNode(breakdown, v => v.startsWith('#'), false) !== null
}

/**
 * Extracts the list ID from the first positive my: node in the breakdown.
 * Used for list-entry aggregation counts (Spec 087) so counts match the queried list.
 * Returns null if no positive my: node exists.
 */
export function getMyListIdFromBreakdown(breakdown: BreakdownNode | null): string | null {
  if (!breakdown) return null
  const node = findFieldNode(breakdown, ['my'], ':', false)
  if (!node) return null
  const raw = node.label.startsWith('-') ? node.label.slice(1) : node.label
  const value = extractValue(raw, ':').toLowerCase() || 'list'
  if (value === 'trash') return TRASH_LIST_ID
  return DEFAULT_LIST_ID
}

// ---------------------------------------------------------------------------
// clearUniqueTerms, setUniqueTerm (Spec 084)
// ---------------------------------------------------------------------------

function isUniqueLabel(label: string): boolean {
  if (label === '++' || label === '@@') return true
  return isFieldLabel(label, UNIQUE_FIELDS, [':'])
}

function collectUniqueNodes(node: BreakdownNode, out: BreakdownNode[]): void {
  if (node.type === 'FIELD' && isUniqueLabel(node.label)) {
    out.push(node)
    return
  }
  if (node.type === 'NOT' && isUniqueLabel(node.label.startsWith('-') ? node.label.slice(1) : node.label)) {
    out.push(node)
    return
  }
  if (node.children) {
    for (const c of node.children) collectUniqueNodes(c, out)
  }
}

/**
 * Remove all unique: terms (including ++, @@) from the query.
 */
export function clearUniqueTerms(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  if (!breakdown || !query.trim()) return query
  const nodes: BreakdownNode[] = []
  collectUniqueNodes(breakdown, nodes)
  if (nodes.length === 0) return query
  if (nodes.length === 1 && breakdown === nodes[0]) return ''
  nodes.sort((a, b) => (b.span?.end ?? 0) - (a.span?.end ?? 0))
  let result = query
  for (const n of nodes) {
    if (n.span) result = spliceQuery(result, n.span, '')
  }
  return result.replace(/  +/g, ' ').trim()
}

type UniqueMode = 'cards' | 'art' | 'prints'

/**
 * Set the effective unique mode. Makes the minimum viable edit to the live query.
 * For unique:cards: append only when pinned overrides; otherwise splice out.
 */
export function setUniqueTerm(
  liveQuery: string,
  liveBreakdown: BreakdownNode | null,
  pinnedQuery: string,
  desiredMode: UniqueMode,
): string {
  const cleared = clearUniqueTerms(liveQuery, liveBreakdown)
  const p = pinnedQuery.trim()
  const combined = p ? `${sealQuery(p)} ${cleared}`.trim() : cleared
  const effectiveAfterClear = getUniqueModeFromQuery(combined)
  if (desiredMode === 'cards') {
    if (effectiveAfterClear === 'cards') return cleared
    return appendTerm(cleared, 'unique:cards', parseBreakdown(cleared))
  }
  return appendTerm(cleared, `unique:${desiredMode}`, parseBreakdown(cleared))
}

// ---------------------------------------------------------------------------
// Bimodal toggle: include:extras (Spec 057)
// ---------------------------------------------------------------------------

const INCLUDE_FIELDS = ['include']

export function toggleIncludeExtras(
  query: string,
  breakdown: BreakdownNode | null,
): string {
  const node = breakdown
    ? findFieldNode(breakdown, INCLUDE_FIELDS, ':', false, v => v === 'extras')
    : null
  if (node) return removeNode(query, node, breakdown!)
  return appendTerm(query, 'include:extras', breakdown)
}

export function hasIncludeExtras(breakdown: BreakdownNode | null): boolean {
  if (!breakdown) return false
  return findFieldNode(breakdown, INCLUDE_FIELDS, ':', false, v => v === 'extras') !== null
}

// ---------------------------------------------------------------------------
// View mode term (Spec 058)
// ---------------------------------------------------------------------------

const VIEW_FIELDS = ['view', 'v', 'display']

function isViewLabel(label: string): boolean {
  return isFieldLabel(label, VIEW_FIELDS, [':'])
}

export function clearViewTerms(query: string, breakdown: BreakdownNode | null): string {
  return clearFieldTerms(query, breakdown, isViewLabel)
}

export function setViewTerm(
  query: string,
  breakdown: BreakdownNode | null,
  mode: 'slim' | 'detail' | 'images' | 'full',
): string {
  const cleared = clearViewTerms(query, breakdown)
  return appendTerm(cleared, `v:${mode}`, parseBreakdown(cleared))
}

// ---------------------------------------------------------------------------
// Sort directive term (Spec 059)
// ---------------------------------------------------------------------------

const SORT_FIELDS_QE = ['sort', 'order']

function isSortLabel(label: string): boolean {
  return isFieldLabel(label, SORT_FIELDS_QE, [':'])
}

export function clearSortTerms(query: string, breakdown: BreakdownNode | null): string {
  return clearFieldTerms(query, breakdown, isSortLabel)
}

/**
 * Cycle a sort chip with exclusive selection: remove any existing sort: term
 * for a different field before cycling the tapped field.
 */
export function cycleSortChip(
  query: string,
  breakdown: BreakdownNode | null,
  chip: { field: string[]; operator: string; value: string; term: string },
): string {
  // Check if there's an existing sort: for a DIFFERENT field
  const positive = breakdown
    ? findFieldNode(breakdown, chip.field, chip.operator, false)
    : null
  const negative = breakdown
    ? findFieldNode(breakdown, chip.field, chip.operator, true)
    : null

  const existingNode = positive || negative
  if (existingNode) {
    const existingValue = extractValue(
      existingNode.label.startsWith('-') ? existingNode.label.slice(1) : existingNode.label,
      chip.operator,
    )
    if (existingValue.toLowerCase() !== chip.value.toLowerCase()) {
      // Different sort field active — clear it first
      const cleared = clearSortTerms(query, breakdown)
      const freshBd = parseBreakdown(cleared)
      return cycleChip(cleared, freshBd, chip)
    }
  }

  return cycleChip(query, breakdown, chip)
}
