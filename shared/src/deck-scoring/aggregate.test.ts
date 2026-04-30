// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { aggregateGauge } from './aggregate'

describe('aggregateGauge', () => {
  describe('empty deck (D = 0)', () => {
    it('returns raw 0 with zero coverage', () => {
      const result = aggregateGauge(new Float32Array(0), [], [], 2)
      expect(result).toEqual({ raw: 0, scoredCopies: 0, totalCopies: 0 })
    })
  })

  describe('single instance (D = 1)', () => {
    it('returns the weight directly regardless of p', () => {
      const weights = Float32Array.from([0.75])
      const result = aggregateGauge(weights, [0], [false], 3)
      expect(result.raw).toBeCloseTo(0.75, 10)
      expect(result.scoredCopies).toBe(1)
      expect(result.totalCopies).toBe(1)
    })

    it('returns 0 for a missing instance', () => {
      const weights = Float32Array.from([0.75])
      const result = aggregateGauge(weights, [0], [true], 2)
      expect(result.raw).toBe(0)
      expect(result.scoredCopies).toBe(0)
      expect(result.totalCopies).toBe(1)
    })
  })

  describe('p-mean math', () => {
    it('p=2 (quadratic mean) with known values', () => {
      // weights: [1.0, 0.5, 0.0], p=2
      // raw = ((1/3)(1^2 + 0.5^2 + 0^2))^(1/2)
      //     = ((1/3)(1 + 0.25 + 0))^0.5
      //     = (0.41666...)^0.5
      //     ≈ 0.6454972...
      const weights = Float32Array.from([1.0, 0.5, 0.0])
      const result = aggregateGauge(weights, [0, 1, 2], [false, false, false], 2)
      expect(result.raw).toBeCloseTo(Math.sqrt(1.25 / 3), 5)
      expect(result.scoredCopies).toBe(3)
      expect(result.totalCopies).toBe(3)
    })

    it('p=3 (cubic mean) emphasizes outliers', () => {
      // weights: [1.0, 0.0, 0.0, 0.0, 0.0], p=3
      // raw = ((1/5)(1^3 + 0 + 0 + 0 + 0))^(1/3)
      //     = (0.2)^(1/3)
      //     ≈ 0.58480...
      const weights = Float32Array.from([1.0, 0.0, 0.0, 0.0, 0.0])
      const result = aggregateGauge(weights, [0, 1, 2, 3, 4], [false, false, false, false, false], 3)
      expect(result.raw).toBeCloseTo(Math.pow(0.2, 1 / 3), 5)
      expect(result.totalCopies).toBe(5)
    })

    it('all weights 1.0 yields raw = 1.0', () => {
      const weights = Float32Array.from([1.0, 1.0, 1.0])
      const result = aggregateGauge(weights, [0, 1, 2], [false, false, false], 2)
      expect(result.raw).toBeCloseTo(1.0, 10)
    })
  })

  describe('logical true zero', () => {
    it('all weights zero yields raw exactly 0', () => {
      const weights = Float32Array.from([0, 0, 0])
      const result = aggregateGauge(weights, [0, 1, 2], [false, false, false], 2)
      expect(result.raw).toBe(0)
    })

    it('mix of missing (w=0) and scored-but-zero-weight yields raw 0', () => {
      const weights = Float32Array.from([0, 0, 0.5])
      // indices 0 and 1 are scored (not missing) but weight 0; index 2 is missing
      const result = aggregateGauge(weights, [0, 1, 2], [false, false, true], 2)
      expect(result.raw).toBe(0)
      expect(result.scoredCopies).toBe(2)
      expect(result.totalCopies).toBe(3)
    })
  })

  describe('coverage', () => {
    it('counts scored vs total correctly with mixed missing', () => {
      const weights = Float32Array.from([0.8, 0.0, 0.6, 0.0])
      const result = aggregateGauge(weights, [0, 1, 2, 3], [false, true, false, true], 2)
      expect(result.scoredCopies).toBe(2)
      expect(result.totalCopies).toBe(4)
    })
  })

  describe('duplicate indices', () => {
    it('handles multiple instances referencing the same weight index', () => {
      // 3 copies of face 0 (weight 0.8), 1 copy of face 1 (weight 0.2)
      const weights = Float32Array.from([0.8, 0.2])
      const result = aggregateGauge(weights, [0, 0, 0, 1], [false, false, false, false], 2)
      // raw = ((1/4)(0.8^2 + 0.8^2 + 0.8^2 + 0.2^2))^0.5
      //     = ((1/4)(0.64*3 + 0.04))^0.5
      //     = ((1/4)(1.96))^0.5
      //     = (0.49)^0.5
      //     = 0.7
      expect(result.raw).toBeCloseTo(0.7, 5)
      expect(result.totalCopies).toBe(4)
    })
  })
})
