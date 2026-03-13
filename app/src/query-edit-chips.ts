// SPDX-License-Identifier: Apache-2.0
import type { BreakdownNode } from '@frantic-search/shared'
import { normalizeAlphanumeric } from '@frantic-search/shared'
import { findFieldNode, findBareNode, removeNode, appendTerm, parseBreakdown, clearFieldTermsRecursive } from './query-edit-core'

/** Normalize for # metadata matching. Spec 123 / Spec 125. */
function normalizeMetadata(s: string): string {
  return normalizeAlphanumeric(s)
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

// ---------------------------------------------------------------------------
// Tri-state cycle for #metadata tag chips (Spec 125)
// ---------------------------------------------------------------------------

function metadataTagValuePredicate(tag: string) {
  const targetNorm = normalizeMetadata(tag)
  return (v: string) =>
    v.startsWith('#') && normalizeMetadata(v.slice(1)) === targetNorm
}

export function getMetadataTagChipState(
  breakdown: BreakdownNode | null,
  tag: string,
): 'neutral' | 'positive' | 'negative' {
  if (!breakdown) return 'neutral'
  const pred = metadataTagValuePredicate(tag)
  if (findBareNode(breakdown, pred, false)) return 'positive'
  if (findBareNode(breakdown, pred, true)) return 'negative'
  return 'neutral'
}

export function cycleMetadataTagChip(
  query: string,
  breakdown: BreakdownNode | null,
  opts: { tag: string; term: string },
): string {
  const pred = metadataTagValuePredicate(opts.tag)
  const positive = breakdown ? findBareNode(breakdown, pred, false) : null
  const negative = breakdown ? findBareNode(breakdown, pred, true) : null

  if (positive) {
    const negatedTerm = `-${opts.term}`
    const removed = removeNode(query, positive, breakdown!)
    const freshBd = parseBreakdown(removed)
    return appendTerm(removed, negatedTerm, freshBd)
  }
  if (negative) {
    return removeNode(query, negative, breakdown!)
  }
  return appendTerm(query, opts.term, breakdown)
}

// ---------------------------------------------------------------------------
// Percentile chips: mutually exclusive per section (Spec 102)
// ---------------------------------------------------------------------------

const SALT_FIELDS = ['salt', 'edhrecsalt', 'saltiness']

export function popularityClearPredicate(label: string): boolean {
  const raw = label.startsWith('-') ? label.slice(1) : label
  const lower = raw.toLowerCase()
  return lower.startsWith('edhrecrank') || (lower.startsWith('edhrec') && !lower.startsWith('edhrecsalt'))
}

export function saltClearPredicate(label: string): boolean {
  const raw = label.startsWith('-') ? label.slice(1) : label
  return SALT_FIELDS.some(f => raw.toLowerCase().startsWith(f))
}

export function cyclePercentileChip(
  query: string,
  breakdown: BreakdownNode | null,
  opts: {
    field: string[]
    operator: string
    value: string
    term: string
    clearPredicate: (label: string) => boolean
  },
): string {
  const positive = breakdown
    ? findFieldNode(breakdown, opts.field, opts.operator, false, v => v === opts.value)
    : null
  const negative = breakdown
    ? findFieldNode(breakdown, opts.field, opts.operator, true, v => v === opts.value)
    : null

  const cleared = clearFieldTermsRecursive(query, breakdown, opts.clearPredicate)
  const freshBd = parseBreakdown(cleared)

  if (positive) {
    return appendTerm(cleared, `-${opts.term}`, freshBd)
  }
  if (negative) {
    return cleared
  }
  return appendTerm(cleared, opts.term, freshBd)
}
