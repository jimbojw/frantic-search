// SPDX-License-Identifier: Apache-2.0
import type { BareWordNode } from '@frantic-search/shared'
import { spliceQuery } from './query-edit-core'

function needsQuoting(value: string): boolean {
  return /[\s:]/.test(value)
}

function oracleTerm(value: string): string {
  if (needsQuoting(value)) return `o:"${value.replace(/"/g, '\\"')}"`
  return `o:${value}`
}

/** Oracle part only, for button label (e.g. o:deal o:3 or o:"deal 3"). */
export function getOracleLabel(trailing: BareWordNode[], variant: 'phrase' | 'per-word'): string {
  if (variant === 'phrase') {
    return oracleTerm(trailing.map((n) => n.value).join(' '))
  }
  return trailing.map((n) => oracleTerm(n.value)).join(' ')
}

/**
 * Splice trailing bare tokens into oracle field terms.
 * Phrase: replace the entire span with o:"word1 word2 ..."
 * Per-word: replace each token with o:value (quoted when needed).
 */
export function spliceBareToOracle(
  query: string,
  trailing: BareWordNode[],
  variant: 'phrase' | 'per-word',
): string {
  if (trailing.length === 0) return query

  if (variant === 'phrase') {
    const first = trailing[0]
    const last = trailing[trailing.length - 1]
    const span = { start: first.span!.start, end: last.span!.end }
    const phrase = trailing.map((n) => n.value).join(' ')
    const replacement = oracleTerm(phrase)
    return spliceQuery(query, span, replacement)
  }

  let result = query
  const sorted = [...trailing].sort((a, b) => b.span!.start - a.span!.start)
  for (const node of sorted) {
    const replacement = oracleTerm(node.value)
    result = spliceQuery(result, node.span!, replacement)
  }
  return result
}
