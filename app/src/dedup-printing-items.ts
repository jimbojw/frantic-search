// SPDX-License-Identifier: Apache-2.0

/**
 * Deduplication mode for printing results (Spec 048, Issue #67, #75).
 * Aligns with Scryfall's unique display keywords: cards (default), prints, art.
 */
export type UniqueMode = 'cards' | 'prints' | 'art'

const SENTINEL = 0xffffffff

/**
 * Deduplicate printing indices by unique mode.
 * - `cards`: one printing per oracle card (canonical face). First occurrence wins.
 * - `prints`: no deduplication; return all printings.
 * - `art`: one printing per unique artwork per card. Requires illustrationIdIndex.
 *
 * Used by Images and Full view modes when printingIndices are present.
 */
export function dedupePrintingItems(
  printingIndices: number[],
  canonicalFaceRef: (idx: number) => number,
  uniqueMode: UniqueMode,
  illustrationIdIndex?: (idx: number) => number,
): number[] {
  if (uniqueMode === 'prints') return [...printingIndices]
  if (uniqueMode === 'art' && illustrationIdIndex) {
    // Group by canonical_face_ref, then one per illustration_id_index per group
    const byFace = new Map<number, number[]>()
    for (const idx of printingIndices) {
      const cf = canonicalFaceRef(idx)
      let arr = byFace.get(cf)
      if (!arr) {
        arr = []
        byFace.set(cf, arr)
      }
      arr.push(idx)
    }
    const result: number[] = []
    for (const [, group] of byFace) {
      let maxIdx = 0
      for (const idx of group) {
        const ill = illustrationIdIndex(idx)
        if (ill > maxIdx) maxIdx = ill
      }
      const slots = new Uint32Array(maxIdx + 1)
      slots.fill(SENTINEL)
      for (const idx of group) {
        const ill = illustrationIdIndex(idx)
        if (slots[ill] === SENTINEL) slots[ill] = idx
      }
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] !== SENTINEL) result.push(slots[i])
      }
    }
    return result
  }
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
