// SPDX-License-Identifier: Apache-2.0

/**
 * Deduplication mode for printing results (Spec 048, Issue #67).
 * Aligns with Scryfall's unique display keywords: cards (default), prints, art (planned).
 */
export type UniqueMode = 'cards' | 'prints'

/**
 * Deduplicate printing indices by unique mode.
 * - `cards`: one printing per oracle card (canonical face). First occurrence wins.
 * - `prints`: no deduplication; return all printings.
 *
 * Used by Images and Full view modes when printingIndices are present.
 * Extensible for future `unique:art` (one per unique artwork).
 */
export function dedupePrintingItems(
  printingIndices: number[],
  canonicalFaceRef: (idx: number) => number,
  uniqueMode: UniqueMode,
): number[] {
  if (uniqueMode === 'prints') return [...printingIndices]
  const seen = new Set<number>()
  const result: number[] = []
  for (const idx of printingIndices) {
    const cf = canonicalFaceRef(idx)
    if (!seen.has(cf)) {
      seen.add(cf)
      result.push(idx)
    }
  }
  return result
}
