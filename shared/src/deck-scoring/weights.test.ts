// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import {
  buildSaltWeights,
  buildConformityWeights,
  buildBlingWeights,
  buildCheapestPrintingPerFace,
} from './weights'

describe('buildSaltWeights', () => {
  it('returns empty array for empty data', () => {
    const { weights } = buildSaltWeights([], [])
    expect(weights.length).toBe(0)
  })

  it('assigns weight 1.0 when N = 1', () => {
    const { weights } = buildSaltWeights([0], [2.5])
    expect(weights[0]).toBeCloseTo(1.0)
  })

  it('assigns 0 for null salt and marks as invalid', () => {
    const { weights, valid } = buildSaltWeights([0, 0], [null, 3.0])
    expect(weights[0]).toBe(0)
    expect(valid[0]).toBe(0)
  })

  it('ranks descending by salt (saltiest = best rank)', () => {
    // 3 canonical faces with salts: 1.0, 3.0, 2.0
    // Sorted desc: 3.0 (R=1), 2.0 (R=2), 1.0 (R=3)
    // N=3: w = (3-R)/(3-1) = (3-R)/2
    const canonical_face = [0, 1, 2]
    const edhrec_salts: (number | null)[] = [1.0, 3.0, 2.0]
    const { weights } = buildSaltWeights(canonical_face, edhrec_salts)
    expect(weights[0]).toBeCloseTo(0.0)
    expect(weights[1]).toBeCloseTo(1.0)
    expect(weights[2]).toBeCloseTo(0.5)
  })

  it('handles competition ranking ties', () => {
    // 4 canonical faces, salts: 5, 3, 3, 1
    // Sorted desc: 5 (R=1), 3 (R=2), 3 (R=2), 1 (R=4)
    // N=4: w = (4-R)/3
    const canonical_face = [0, 1, 2, 3]
    const edhrec_salts: (number | null)[] = [5, 3, 3, 1]
    const { weights } = buildSaltWeights(canonical_face, edhrec_salts)
    expect(weights[0]).toBeCloseTo(1.0)
    expect(weights[1]).toBeCloseTo(2 / 3)
    expect(weights[2]).toBeCloseTo(2 / 3)
    expect(weights[3]).toBeCloseTo(0.0)
  })

  it('skips non-canonical face rows', () => {
    const canonical_face = [0, 0]
    const edhrec_salts: (number | null)[] = [2.0, 99.0]
    const { weights, valid } = buildSaltWeights(canonical_face, edhrec_salts)
    expect(weights[0]).toBeCloseTo(1.0)
    expect(weights[1]).toBe(0)
    expect(valid[0]).toBe(1)
    expect(valid[1]).toBe(0)
  })

  it('handles all-same-value degenerate case', () => {
    const canonical_face = [0, 1, 2]
    const edhrec_salts: (number | null)[] = [4, 4, 4]
    const { weights } = buildSaltWeights(canonical_face, edhrec_salts)
    expect(weights[0]).toBeCloseTo(1.0)
    expect(weights[1]).toBeCloseTo(1.0)
    expect(weights[2]).toBeCloseTo(1.0)
  })

  it('handles mix of null and valid', () => {
    const canonical_face = [0, 1, 2]
    const edhrec_salts: (number | null)[] = [null, 5.0, 3.0]
    const { weights, valid } = buildSaltWeights(canonical_face, edhrec_salts)
    expect(weights[0]).toBe(0)
    expect(valid[0]).toBe(0)
    expect(weights[1]).toBeCloseTo(1.0)
    expect(valid[1]).toBe(1)
    expect(weights[2]).toBeCloseTo(0.0)
    expect(valid[2]).toBe(1)
  })
})

describe('buildConformityWeights', () => {
  it('ranks ascending by EDHREC rank (rank 1 = most popular = best)', () => {
    // 3 canonical faces, ranks: 100, 1, 50
    // Sorted asc: 1 (R=1), 50 (R=2), 100 (R=3)
    // N=3: w = (3-R)/2
    const canonical_face = [0, 1, 2]
    const edhrec_ranks: (number | null)[] = [100, 1, 50]
    const { weights } = buildConformityWeights(canonical_face, edhrec_ranks)
    expect(weights[0]).toBeCloseTo(0.0)
    expect(weights[1]).toBeCloseTo(1.0)
    expect(weights[2]).toBeCloseTo(0.5)
  })

  it('assigns 0 for null rank and marks as invalid', () => {
    const canonical_face = [0, 1]
    const edhrec_ranks: (number | null)[] = [null, 5]
    const { weights, valid } = buildConformityWeights(canonical_face, edhrec_ranks)
    expect(weights[0]).toBe(0)
    expect(valid[0]).toBe(0)
    expect(weights[1]).toBeCloseTo(1.0)
    expect(valid[1]).toBe(1)
  })
})

describe('buildBlingWeights', () => {
  it('returns empty array for empty data', () => {
    const { weights } = buildBlingWeights([], [])
    expect(weights.length).toBe(0)
  })

  it('ranks descending by USD (most expensive = best rank)', () => {
    const price_usd = [1000, 0, 500]
    const canonical_face_ref = [0, 0, 0]
    const { weights, valid } = buildBlingWeights(price_usd, canonical_face_ref)
    expect(weights[0]).toBeCloseTo(1.0)
    expect(weights[1]).toBe(0)
    expect(valid[1]).toBe(0)
    expect(weights[2]).toBeCloseTo(0.0)
    expect(valid[2]).toBe(1)
  })

  it('handles ties in USD price', () => {
    const price_usd = [500, 500, 500]
    const canonical_face_ref = [0, 1, 2]
    const { weights } = buildBlingWeights(price_usd, canonical_face_ref)
    expect(weights[0]).toBeCloseTo(1.0)
    expect(weights[1]).toBeCloseTo(1.0)
    expect(weights[2]).toBeCloseTo(1.0)
  })

  it('assigns 0 for sentinel price and marks as invalid', () => {
    const price_usd = [0, 100]
    const canonical_face_ref = [0, 0]
    const { weights, valid } = buildBlingWeights(price_usd, canonical_face_ref)
    expect(weights[0]).toBe(0)
    expect(valid[0]).toBe(0)
    expect(weights[1]).toBeCloseTo(1.0)
    expect(valid[1]).toBe(1)
  })
})

describe('buildCheapestPrintingPerFace', () => {
  it('returns -1 for faces with no valid-USD printing', () => {
    // face 0 has one printing with price 0 (invalid)
    const result = buildCheapestPrintingPerFace([0], [0], 1)
    expect(result[0]).toBe(-1)
  })

  it('picks the cheapest valid-USD printing', () => {
    // face 0: printing 0 ($10), printing 1 ($5), printing 2 ($0 invalid)
    const canonical_face_ref = [0, 0, 0]
    const price_usd = [1000, 500, 0]
    const result = buildCheapestPrintingPerFace(canonical_face_ref, price_usd, 1)
    expect(result[0]).toBe(1) // printing 1 is cheapest valid
  })

  it('tie-breaks by smallest printing row index', () => {
    // face 0: printing 0 ($5), printing 1 ($5) — both $5, pick row 0
    const canonical_face_ref = [0, 0]
    const price_usd = [500, 500]
    const result = buildCheapestPrintingPerFace(canonical_face_ref, price_usd, 1)
    expect(result[0]).toBe(0)
  })

  it('handles multiple faces', () => {
    // face 0: printing 0 ($10), printing 1 ($3)
    // face 1: printing 2 ($7)
    // face 2: no printings
    const canonical_face_ref = [0, 0, 1]
    const price_usd = [1000, 300, 700]
    const result = buildCheapestPrintingPerFace(canonical_face_ref, price_usd, 3)
    expect(result[0]).toBe(1)  // face 0 cheapest is printing 1 ($3)
    expect(result[1]).toBe(2)  // face 1 cheapest is printing 2 ($7)
    expect(result[2]).toBe(-1) // face 2 has no printings
  })

  it('returns empty for empty data', () => {
    const result = buildCheapestPrintingPerFace([], [], 0)
    expect(result.length).toBe(0)
  })
})
