// SPDX-License-Identifier: Apache-2.0
import type { BareWordNode } from '@frantic-search/shared'
import { spliceQuery } from './query-edit-core'

/** Spec 131: variants for splicing trailing bare tokens into oracle search. */
export type OracleSpliceVariant = 'phrase' | 'per-word' | 'regex'

/** Letters, digits, apostrophe, hyphen only — no regex escaping in o:/…/ pattern (Spec 131). */
const ORACLE_REGEX_SAFE_TOKEN = /^[a-zA-Z0-9'-]+$/

/**
 * True when ordered-regex oracle hint is allowed: at least two trailing tokens and each
 * token is safe to embed in `o:/a.*b.*c/` without backslashes.
 */
export function trailingOracleRegexEligible(trailing: BareWordNode[]): boolean {
  if (trailing.length < 2) return false
  for (const n of trailing) {
    if (!ORACLE_REGEX_SAFE_TOKEN.test(n.value)) return false
  }
  return true
}

function needsQuoting(value: string): boolean {
  return /[\s:]/.test(value)
}

function oracleTerm(value: string): string {
  if (needsQuoting(value)) return `o:"${value.replace(/"/g, '\\"')}"`
  return `o:${value}`
}

function oracleRegexLabel(trailing: BareWordNode[]): string {
  const pattern = trailing.map((n) => n.value).join('.*')
  return `o:/${pattern}/`
}

/** Oracle part only, for button label (e.g. o:deal o:3, o:"deal 3", or o:/deal.*3/). */
export function getOracleLabel(trailing: BareWordNode[], variant: OracleSpliceVariant): string {
  if (variant === 'phrase') {
    return oracleTerm(trailing.map((n) => n.value).join(' '))
  }
  if (variant === 'regex') {
    return oracleRegexLabel(trailing)
  }
  return trailing.map((n) => oracleTerm(n.value)).join(' ')
}

/**
 * Splice trailing bare tokens into oracle field terms.
 * Phrase: replace the entire span with o:"word1 word2 ..."
 * Regex: replace the entire span with o:/word1.*word2.*…/ (Spec 131; caller must check eligibility)
 * Per-word: replace each token with o:value (quoted when needed).
 */
export function spliceBareToOracle(
  query: string,
  trailing: BareWordNode[],
  variant: OracleSpliceVariant,
): string {
  if (trailing.length === 0) return query

  if (variant === 'phrase' || variant === 'regex') {
    const first = trailing[0]
    const last = trailing[trailing.length - 1]
    const span = { start: first.span!.start, end: last.span!.end }
    const replacement =
      variant === 'phrase'
        ? oracleTerm(trailing.map((n) => n.value).join(' '))
        : oracleRegexLabel(trailing)
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

/**
 * Spec 131: single-token hybrid — upgrade only one trailing bare token to oracle;
 * other tokens (including other trailing bare words) stay as typed.
 */
export function spliceBareToOracleSingle(
  query: string,
  trailing: BareWordNode[],
  index: number,
): string {
  if (index < 0 || index >= trailing.length) return query
  const node = trailing[index]
  if (!node?.span) return query
  return spliceQuery(query, node.span, oracleTerm(node.value))
}

/** Spec 131: chip label for hybrid (oracle fragment for the upgraded token only). */
export function getOracleLabelSingleUpgrade(node: BareWordNode): string {
  return oracleTerm(node.value)
}
