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

/**
 * Aggregation counts for displayed items (Spec 097).
 * When deduplication occurs, each displayed item represents N printings.
 * Returns maps from (canonical face index | printing index) to count.
 * - byCard: for Slim/Detail — count of printings per canonical_face_ref.
 * - byPrinting: for Images/Full — count per displayed printing index.
 *   unique:cards = per canonical_face_ref; unique:art = per (face, illustration);
 *   unique:prints = empty (each item = 1, no count shown).
 */
export function aggregationCounts(
  printingIndices: number[],
  canonicalFaceRef: (idx: number) => number,
  uniqueMode: UniqueMode,
  illustrationIdIndex?: (idx: number) => number,
): { byCard: Map<number, number>; byPrinting: Map<number, number> } {
  const byCard = new Map<number, number>()
  for (const idx of printingIndices) {
    const cf = canonicalFaceRef(idx)
    byCard.set(cf, (byCard.get(cf) ?? 0) + 1)
  }

  const byPrinting = new Map<number, number>()
  if (uniqueMode === 'prints') return { byCard, byPrinting }

  if (uniqueMode === 'art' && illustrationIdIndex) {
    const byArt = new Map<string, number>()
    for (const idx of printingIndices) {
      const cf = canonicalFaceRef(idx)
      const ill = illustrationIdIndex(idx)
      const key = `${cf}:${ill}`
      byArt.set(key, (byArt.get(key) ?? 0) + 1)
    }
    for (const idx of printingIndices) {
      const cf = canonicalFaceRef(idx)
      const ill = illustrationIdIndex(idx)
      const key = `${cf}:${ill}`
      const count = byArt.get(key)!
      if (count > 1) byPrinting.set(idx, count)
    }
    return { byCard, byPrinting }
  }

  for (const idx of printingIndices) {
    const cf = canonicalFaceRef(idx)
    const count = byCard.get(cf)!
    if (count > 1) byPrinting.set(idx, count)
  }
  return { byCard, byPrinting }
}
