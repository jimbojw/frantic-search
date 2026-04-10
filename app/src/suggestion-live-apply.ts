// SPDX-License-Identifier: Apache-2.0

/**
 * Map a rewritten **effective** query to the **live** query string for `setQuery`
 * (Spec 151 / Spec 054 / Issue #258).
 *
 * When pinned + live are combined as `sealQuery(pinned) + ' ' + sealQuery(live)` and
 * the rewrite leaves the sealed pinned prefix unchanged, strip that prefix so the UI
 * does not duplicate pinned terms in the live buffer.
 */
export function liveQueryForSuggestionApply(
  newEffective: string,
  hasPinned: boolean,
  pinnedTrim: string,
  sealQuery: (q: string) => string,
): string {
  const p = pinnedTrim.trim()
  if (!hasPinned || !p) return newEffective
  const prefix = sealQuery(p) + ' '
  if (newEffective.startsWith(prefix)) return newEffective.slice(prefix.length)
  return newEffective
}
