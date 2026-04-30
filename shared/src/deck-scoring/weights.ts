// SPDX-License-Identifier: Apache-2.0

/**
 * Assign competition ranks to a pre-sorted array of { index, value } pairs
 * and write weights into a Float32Array. Ties share the best (lowest) rank.
 *
 * @param sorted  Pairs sorted in "best first" order (caller controls direction).
 * @param out     Dense weight array to write into (indexed by original row).
 */
function assignWeights(
  sorted: { index: number; value: number }[],
  out: Float32Array,
): void {
  const N = sorted.length
  if (N === 0) return
  if (N === 1) {
    out[sorted[0].index] = 1.0
    return
  }

  let rank = 1
  for (let i = 0; i < N; ) {
    let j = i + 1
    while (j < N && sorted[j].value === sorted[i].value) j++
    const w = (N - rank) / (N - 1)
    for (let k = i; k < j; k++) {
      out[sorted[k].index] = w
    }
    rank += j - i
    i = j
  }
}

/**
 * Build salt weights: Float32Array indexed by face row.
 * Canonical faces with valid salt get a weight in [0, 1]; others get 0.
 * Returns weights and a validity mask (1 = has data, 0 = missing).
 */
export function buildSaltWeights(
  canonical_face: number[],
  edhrec_salts: (number | null)[],
): { weights: Float32Array; valid: Uint8Array } {
  const faceCount = canonical_face.length
  const weights = new Float32Array(faceCount)
  const valid = new Uint8Array(faceCount)

  const pool: { index: number; value: number }[] = []
  for (let i = 0; i < faceCount; i++) {
    if (canonical_face[i] !== i) continue
    const v = edhrec_salts[i]
    if (v != null) {
      pool.push({ index: i, value: v })
      valid[i] = 1
    }
  }

  pool.sort((a, b) => b.value - a.value)
  assignWeights(pool, weights)
  return { weights, valid }
}

/**
 * Build conformity weights: Float32Array indexed by face row.
 * Canonical faces with valid EDHREC rank get a weight in [0, 1]; others get 0.
 * Returns weights and a validity mask (1 = has data, 0 = missing).
 */
export function buildConformityWeights(
  canonical_face: number[],
  edhrec_ranks: (number | null)[],
): { weights: Float32Array; valid: Uint8Array } {
  const faceCount = canonical_face.length
  const weights = new Float32Array(faceCount)
  const valid = new Uint8Array(faceCount)

  const pool: { index: number; value: number }[] = []
  for (let i = 0; i < faceCount; i++) {
    if (canonical_face[i] !== i) continue
    const v = edhrec_ranks[i]
    if (v != null) {
      pool.push({ index: i, value: v })
      valid[i] = 1
    }
  }

  pool.sort((a, b) => a.value - b.value)
  assignWeights(pool, weights)
  return { weights, valid }
}

/**
 * Build bling weights: Float32Array indexed by printing row.
 * Printings with valid price (price_usd !== 0) get a weight in [0, 1]; others get 0.
 * Returns weights and a validity mask (1 = has price data, 0 = sentinel).
 */
export function buildBlingWeights(
  price_usd: number[],
  _canonical_face_ref: number[],
): { weights: Float32Array; valid: Uint8Array } {
  const printingCount = price_usd.length
  const weights = new Float32Array(printingCount)
  const valid = new Uint8Array(printingCount)

  const pool: { index: number; value: number }[] = []
  for (let k = 0; k < printingCount; k++) {
    if (price_usd[k] !== 0) {
      pool.push({ index: k, value: price_usd[k] })
      valid[k] = 1
    }
  }

  pool.sort((a, b) => b.value - a.value)
  assignWeights(pool, weights)
  return { weights, valid }
}

/**
 * For each canonical face, find the printing row with the cheapest valid-USD
 * price. Tie-break: smallest printing row index. Returns -1 if no valid
 * printing exists for that face.
 */
export function buildCheapestPrintingPerFace(
  canonical_face_ref: number[],
  price_usd: number[],
  faceCount: number,
): Int32Array {
  const out = new Int32Array(faceCount).fill(-1)
  const cheapestPrice = new Float64Array(faceCount).fill(Infinity)

  for (let k = 0; k < canonical_face_ref.length; k++) {
    const price = price_usd[k]
    if (price === 0) continue
    const face = canonical_face_ref[k]
    if (face < 0 || face >= faceCount) continue
    if (price < cheapestPrice[face]) {
      cheapestPrice[face] = price
      out[face] = k
    }
  }

  return out
}
