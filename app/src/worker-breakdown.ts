// SPDX-License-Identifier: Apache-2.0
import type { BreakdownNode, CardIndex, FieldNode, Histograms, QueryNodeResult } from '@frantic-search/shared'
import { Color } from '@frantic-search/shared'
import { computePrefixBranchHintForLeaf, type PrefixHintContext } from './worker-prefix-hint'

function leafLabel(qnr: QueryNodeResult): string {
  const n = qnr.node
  switch (n.type) {
    case 'FIELD':
      if (n.field.toLowerCase() === 'unique' && n.sourceText) return n.sourceText
      if (n.field.toLowerCase() === 'include' && n.sourceText) return n.sourceText
      return `${n.field}${n.operator}${n.sourceText ?? n.value}`
    case 'BARE': return n.value
    case 'EXACT': return `!"${n.value}"`
    case 'REGEX_FIELD': return `${n.field}${n.operator}/${n.pattern}/`
    case 'NOP': return '(no-op)'
    case 'NOT': return 'NOT'
    case 'AND': return 'AND'
    case 'OR': return 'OR'
  }
}

function isNotLeaf(qnr: QueryNodeResult): boolean {
  if (qnr.node.type !== 'NOT' || !qnr.children || qnr.children.length !== 1) return false
  const child = qnr.children[0]
  return !child.children || child.children.length === 0
}

/**
 * Convert evaluator QueryNodeResult tree to BreakdownNode for display.
 */
export function toBreakdown(qnr: QueryNodeResult, ctx?: PrefixHintContext): BreakdownNode {
  if (qnr.node.type === 'NOP') {
    return { type: 'NOP', label: '(no-op)', matchCount: -1 }
  }
  if (isNotLeaf(qnr)) {
    const child = qnr.children![0]!
    const childLabel = leafLabel(child)
    const node: BreakdownNode = { type: 'NOT', label: `-${childLabel}`, matchCount: qnr.matchCount }
    if (qnr.matchCountCards !== undefined) node.matchCountCards = qnr.matchCountCards
    if (qnr.matchCountPrints !== undefined) node.matchCountPrints = qnr.matchCountPrints
    if (qnr.error) node.error = qnr.error
    if (qnr.node.span) node.span = qnr.node.span
    if (ctx && child.node.type === 'FIELD') {
      const hint = computePrefixBranchHintForLeaf(child.node as FieldNode, child, ctx)
      if (hint) node.prefixBranchHint = hint
    }
    return node
  }
  const node: BreakdownNode = { type: qnr.node.type, label: leafLabel(qnr), matchCount: qnr.matchCount }
  if (qnr.matchCountCards !== undefined) node.matchCountCards = qnr.matchCountCards
  if (qnr.matchCountPrints !== undefined) node.matchCountPrints = qnr.matchCountPrints
  if (qnr.error) node.error = qnr.error
  if (qnr.node.span) node.span = qnr.node.span
  if (qnr.node.type === 'FIELD' && qnr.node.valueSpan) node.valueSpan = qnr.node.valueSpan
  if (ctx && qnr.node.type === 'FIELD') {
    const hint = computePrefixBranchHintForLeaf(qnr.node as FieldNode, qnr, ctx)
    if (hint) node.prefixBranchHint = hint
  }
  if (qnr.children) {
    node.children = qnr.children.map(c => toBreakdown(c, ctx))
  }
  return node
}

function popcount(v: number): number {
  v = (v & 0x55) + ((v >> 1) & 0x55)
  v = (v & 0x33) + ((v >> 2) & 0x33)
  return (v + (v >> 4)) & 0x0f
}

/**
 * Compute histograms for color identity, mana value, and card type from
 * a deduped list of canonical face indices.
 */
export function computeHistograms(deduped: number[], index: CardIndex): Histograms {
  const colorIdentity = [0, 0, 0, 0, 0, 0, 0]
  const manaValue = [0, 0, 0, 0, 0, 0, 0, 0]
  const cardType = [0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 0; i < deduped.length; i++) {
    const idx = deduped[i]
    const ci = index.colorIdentity[idx]
    if (ci === 0) {
      colorIdentity[0]++
    } else {
      if (ci & Color.White) colorIdentity[1]++
      if (ci & Color.Blue) colorIdentity[2]++
      if (ci & Color.Black) colorIdentity[3]++
      if (ci & Color.Red) colorIdentity[4]++
      if (ci & Color.Green) colorIdentity[5]++
      if (popcount(ci) >= 2) colorIdentity[6]++
    }
    const mv = Math.floor(index.manaValue[idx])
    manaValue[Math.min(mv, 7)]++
    const tl = index.typeLinesLower[idx]
    if (tl.includes('legendary'))   cardType[0]++
    if (tl.includes('creature'))    cardType[1]++
    if (tl.includes('instant'))     cardType[2]++
    if (tl.includes('sorcery'))     cardType[3]++
    if (tl.includes('artifact'))    cardType[4]++
    if (tl.includes('enchantment')) cardType[5]++
    if (tl.includes('planeswalker'))cardType[6]++
    if (tl.includes('land'))        cardType[7]++
  }
  return { colorIdentity, manaValue, cardType }
}
