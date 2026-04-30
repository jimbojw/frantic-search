// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { scoreDeck } from './score-deck'
import { renardScale } from './renard'
import type { ResolvedInstance, DeckScoringWeights } from './types'

function makeWeights(opts: {
  saltWeights?: number[]
  conformityWeights?: number[]
  blingWeights?: number[]
  cheapestPrintingPerFace?: number[]
  saltValid?: number[]
  conformityValid?: number[]
  blingValid?: number[]
}): DeckScoringWeights {
  return {
    saltWeights: Float32Array.from(opts.saltWeights ?? []),
    conformityWeights: Float32Array.from(opts.conformityWeights ?? []),
    blingWeights: Float32Array.from(opts.blingWeights ?? []),
    cheapestPrintingPerFace: Int32Array.from(opts.cheapestPrintingPerFace ?? []),
    saltValid: Uint8Array.from(opts.saltValid ?? (opts.saltWeights ?? []).map(() => 1)),
    conformityValid: Uint8Array.from(opts.conformityValid ?? (opts.conformityWeights ?? []).map(() => 1)),
    blingValid: Uint8Array.from(opts.blingValid ?? (opts.blingWeights ?? []).map((w) => w !== 0 ? 1 : 0)),
  }
}

/** Compute the expected Renard output from Float32 weights via the actual p-mean. */
function expectedRenard(float32Weights: number[], p: number): number {
  const ws = Float32Array.from(float32Weights)
  const D = ws.length
  if (D === 0) return 0
  let sum = 0
  for (let i = 0; i < D; i++) sum += ws[i] ** p
  if (sum === 0) return 0
  const raw = (sum / D) ** (1 / p)
  return renardScale(raw * 1000)
}

describe('scoreDeck', () => {
  it('returns all zeros for empty deck', () => {
    const weights = makeWeights({})
    const result = scoreDeck([], weights)
    expect(result.salt).toBe(0)
    expect(result.conformity).toBe(0)
    expect(result.bling).toBe(0)
    expect(result.saltCoverage).toEqual({ scoredCopies: 0, totalCopies: 0 })
    expect(result.conformityCoverage).toEqual({ scoredCopies: 0, totalCopies: 0 })
    expect(result.blingCoverage).toEqual({ scoredCopies: 0, totalCopies: 0 })
  })

  describe('synthetic 5-card deck', () => {
    // Salt weights:       [1.0, 0.5, 0.0]  (3 faces, all valid)
    // Conformity weights: [0.0, 0.75, 1.0]  (3 faces, all valid)
    // Bling weights:      [0.8, 0.2, 0.6, 0.0, 0.4]  (5 printings)
    //   blingValid:       [1,   1,   1,   0,   1]     (printing 3 = sentinel)
    //
    // Instances:
    //   face 0, printing 0  (salt 1.0, conf 0.0, bling 0.8)
    //   face 0, printing 3  (salt 1.0, conf 0.0, bling missing — sentinel)
    //   face 1, printing 1  (salt 0.5, conf 0.75, bling 0.2)
    //   face 2, printing 2  (salt 0.0, conf 1.0, bling 0.6)
    //   face 2, printing 4  (salt 0.0, conf 1.0, bling 0.4)

    const weights = makeWeights({
      saltWeights: [1.0, 0.5, 0.0],
      conformityWeights: [0.0, 0.75, 1.0],
      blingWeights: [0.8, 0.2, 0.6, 0.0, 0.4],
      cheapestPrintingPerFace: [0, 1, 2],
      saltValid: [1, 1, 1],
      conformityValid: [1, 1, 1],
      blingValid: [1, 1, 1, 0, 1],
    })

    const instances: ResolvedInstance[] = [
      { canonicalFaceIndex: 0, printingRowIndex: 0 },
      { canonicalFaceIndex: 0, printingRowIndex: 3 },
      { canonicalFaceIndex: 1, printingRowIndex: 1 },
      { canonicalFaceIndex: 2, printingRowIndex: 2 },
      { canonicalFaceIndex: 2, printingRowIndex: 4 },
    ]

    it('computes salt score with p=3', () => {
      const result = scoreDeck(instances, weights)
      // Salt weights per instance (Float32): [1.0, 1.0, 0.5, 0.0, 0.0]
      const expected = expectedRenard([1.0, 1.0, 0.5, 0.0, 0.0], 3)
      expect(result.salt).toBe(expected)
      expect(result.saltCoverage).toEqual({ scoredCopies: 5, totalCopies: 5 })
    })

    it('computes conformity score with p=2', () => {
      const result = scoreDeck(instances, weights)
      // Conformity weights per instance (Float32): [0.0, 0.0, 0.75, 1.0, 1.0]
      const expected = expectedRenard([0.0, 0.0, 0.75, 1.0, 1.0], 2)
      expect(result.conformity).toBe(expected)
      expect(result.conformityCoverage).toEqual({ scoredCopies: 5, totalCopies: 5 })
    })

    it('computes bling score with p=2 and handles sentinel-price printing', () => {
      const result = scoreDeck(instances, weights)
      // Bling weights per instance: [0.8, 0(missing), 0.2, 0.6, 0.4]
      // Missing instances get w=0 in the mean, scored=4
      const expected = expectedRenard([0.8, 0.0, 0.2, 0.6, 0.4], 2)
      expect(result.bling).toBe(expected)
      expect(result.blingCoverage).toEqual({ scoredCopies: 4, totalCopies: 5 })
    })
  })

  describe('oracle-only bling resolution', () => {
    it('uses cheapestPrintingPerFace for oracle-only instances', () => {
      // face 0 has cheapest printing at row 2 with bling weight 0.6
      const weights = makeWeights({
        saltWeights: [1.0],
        conformityWeights: [1.0],
        blingWeights: [0.8, 0.2, 0.6],
        cheapestPrintingPerFace: [2],
        blingValid: [1, 1, 1],
      })
      const instances: ResolvedInstance[] = [
        { canonicalFaceIndex: 0, printingRowIndex: -1 },
      ]
      const result = scoreDeck(instances, weights)
      // Bling: uses cheapest printing (row 2), weight 0.6 in Float32
      const expected = expectedRenard([0.6], 2)
      expect(result.bling).toBe(expected)
      expect(result.blingCoverage).toEqual({ scoredCopies: 1, totalCopies: 1 })
    })

    it('treats oracle-only with no valid printing as missing for bling', () => {
      const weights = makeWeights({
        saltWeights: [0.5],
        conformityWeights: [0.5],
        blingWeights: [],
        cheapestPrintingPerFace: [-1],
        blingValid: [],
      })
      const instances: ResolvedInstance[] = [
        { canonicalFaceIndex: 0, printingRowIndex: -1 },
      ]
      const result = scoreDeck(instances, weights)
      expect(result.bling).toBe(0)
      expect(result.blingCoverage).toEqual({ scoredCopies: 0, totalCopies: 1 })
    })
  })

  describe('logical true zero', () => {
    it('returns display 0 when all salt weights are zero (valid data, worst rank)', () => {
      const weights = makeWeights({
        saltWeights: [0, 0],
        conformityWeights: [1.0, 0.5],
        blingWeights: [0.5, 0.3],
        cheapestPrintingPerFace: [0, 1],
        saltValid: [1, 1],
        blingValid: [1, 1],
      })
      const instances: ResolvedInstance[] = [
        { canonicalFaceIndex: 0, printingRowIndex: 0 },
        { canonicalFaceIndex: 1, printingRowIndex: 1 },
      ]
      const result = scoreDeck(instances, weights)
      expect(result.salt).toBe(0)
      // Coverage still counts them as scored since valid[i] = 1
      expect(result.saltCoverage).toEqual({ scoredCopies: 2, totalCopies: 2 })
    })
  })

  describe('coverage distinguishes missing from worst-rank', () => {
    it('worst-ranked face (weight 0) counts as scored; null face does not', () => {
      const weights = makeWeights({
        saltWeights: [0.0, 0.0],
        conformityWeights: [0.5, 0.5],
        blingWeights: [0.5, 0.5],
        cheapestPrintingPerFace: [0, 1],
        saltValid: [1, 0],    // face 0: valid (worst rank), face 1: missing
        blingValid: [1, 1],
      })
      const instances: ResolvedInstance[] = [
        { canonicalFaceIndex: 0, printingRowIndex: 0 },
        { canonicalFaceIndex: 1, printingRowIndex: 1 },
      ]
      const result = scoreDeck(instances, weights)
      expect(result.saltCoverage).toEqual({ scoredCopies: 1, totalCopies: 2 })
    })
  })
})
