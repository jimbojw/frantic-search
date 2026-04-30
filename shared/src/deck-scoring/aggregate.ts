// SPDX-License-Identifier: Apache-2.0

export interface GaugeResult {
  raw: number
  scoredCopies: number
  totalCopies: number
}

/**
 * Compute the generalized p-mean over per-instance weights with coverage.
 *
 * @param weights   Precomputed weight array (face- or printing-indexed).
 * @param indices   One index per deck instance into `weights`.
 * @param missing   Parallel to `indices`: true when that instance has no data
 *                  for this gauge (weight forced to 0, excluded from coverage).
 * @param p         Power parameter (> 0).
 */
export function aggregateGauge(
  weights: Float32Array,
  indices: number[],
  missing: boolean[],
  p: number,
): GaugeResult {
  const D = indices.length
  if (D === 0) return { raw: 0, scoredCopies: 0, totalCopies: 0 }

  let sum = 0
  let scoredCopies = 0
  for (let i = 0; i < D; i++) {
    if (!missing[i]) scoredCopies++
    const w = missing[i] ? 0 : weights[indices[i]]
    sum += w ** p
  }

  if (sum === 0) return { raw: 0, scoredCopies, totalCopies: D }

  const raw = (sum / D) ** (1 / p)
  return { raw, scoredCopies, totalCopies: D }
}
