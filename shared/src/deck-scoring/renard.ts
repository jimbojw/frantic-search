// SPDX-License-Identifier: Apache-2.0

const B1 = 21.5
const B2 = 46.4
const B3 = 100.0
const B4 = 215.4
const B5 = 464.2

function ceilGrid(s: number, minOut: number, maxOut: number, step: number): number {
  if (s <= minOut) return minOut
  const k = Math.ceil((s - minOut) / step)
  return Math.min(maxOut, minOut + k * step)
}

/**
 * Map a scaled score s ∈ [0, 1000] to a Renard-bucketed display integer.
 * See Spec 185 § Step 3 for the full specification.
 */
export function renardScale(s: number): number {
  if (s <= 0) return 0
  if (s <= B1) return Math.min(22, Math.ceil(s))
  if (s <= B2) return ceilGrid(s, 24, 48, 2)
  if (s <= B3) return ceilGrid(s, 50, 100, 5)
  if (s <= B4) return ceilGrid(s, 110, 220, 10)
  if (s <= B5) return ceilGrid(s, 240, 480, 20)
  return ceilGrid(s, 500, 1000, 50)
}
