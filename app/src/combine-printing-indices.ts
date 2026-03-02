// SPDX-License-Identifier: Apache-2.0

/**
 * Combine printing indices from separately-evaluated pinned and live queries.
 *
 * Returns the combined printingIndices, or undefined if neither evaluation
 * produced any. The `deduped` array is the already-intersected card-level
 * face indices. Uses bitmask-based pre-allocation to avoid dynamic arrays.
 */
export function combinePrintingIndices(
  live: Uint32Array | undefined,
  pinned: Uint32Array | undefined,
  deduped: number[],
  canonicalFaceRef: number[],
  printingCount: number,
): Uint32Array | undefined {
  if (live && pinned) {
    const mask = new Uint8Array(printingCount)
    for (let i = 0; i < pinned.length; i++) mask[pinned[i]] = 1
    let count = 0
    for (let i = 0; i < live.length; i++) if (mask[live[i]]) count++
    const result = new Uint32Array(count)
    let j = 0
    for (let i = 0; i < live.length; i++) if (mask[live[i]]) result[j++] = live[i]
    return result
  }

  const source = live ?? pinned
  if (!source) return undefined

  const faceMask = buildFaceMask(deduped)
  let count = 0
  for (let i = 0; i < source.length; i++) if (faceMask[canonicalFaceRef[source[i]]]) count++
  const result = new Uint32Array(count)
  let j = 0
  for (let i = 0; i < source.length; i++) if (faceMask[canonicalFaceRef[source[i]]]) result[j++] = source[i]
  return result
}

function buildFaceMask(deduped: number[]): Uint8Array {
  let max = 0
  for (let i = 0; i < deduped.length; i++) if (deduped[i] > max) max = deduped[i]
  const mask = new Uint8Array(max + 1)
  for (let i = 0; i < deduped.length; i++) mask[deduped[i]] = 1
  return mask
}
