// SPDX-License-Identifier: Apache-2.0
import type { BreakdownNode } from '@frantic-search/shared'
import { findFieldNode, removeNode, appendTerm, parseBreakdown } from './query-edit-core'

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
// Tri-state cycle: neutral → positive → negative → neutral  (Spec 044)
// ---------------------------------------------------------------------------

export function cycleChip(
  query: string,
  breakdown: BreakdownNode | null,
  opts: { field: string[]; operator: string; value: string; term: string },
): string {
  const positive = breakdown
    ? findFieldNode(breakdown, opts.field, opts.operator, false, v => v === opts.value)
    : null
  const negative = breakdown
    ? findFieldNode(breakdown, opts.field, opts.operator, true, v => v === opts.value)
    : null

  if (positive) {
    const negatedTerm = `-${positive.label}`
    const removed = removeNode(query, positive, breakdown!)
    const freshBd = parseBreakdown(removed)
    return appendTerm(removed, negatedTerm, freshBd)
  }

  if (negative) {
    return removeNode(query, negative, breakdown!)
  }

  return appendTerm(query, opts.term, breakdown)
}
