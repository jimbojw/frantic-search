// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { renardScale } from './renard'

describe('renardScale', () => {
  it('returns 0 for s = 0', () => {
    expect(renardScale(0)).toBe(0)
  })

  describe('band 1: (0, 21.5], step 1, outputs 1–22', () => {
    it.each([
      [0.001, 1],
      [0.5, 1],
      [1, 1],
      [1.001, 2],
      [5, 5],
      [10, 10],
      [21, 21],
      [21.001, 22],
      [21.5, 22],
    ])('renardScale(%f) = %d', (s, expected) => {
      expect(renardScale(s)).toBe(expected)
    })
  })

  describe('band 2: (21.5, 46.4], step 2, outputs 24–48', () => {
    it.each([
      [21.501, 24],
      [23, 24],
      [24, 24],
      [24.001, 26],
      [25, 26],
      [26, 26],
      [26.001, 28],
      [46, 46],
      [46.001, 48],
      [46.4, 48],
    ])('renardScale(%f) = %d', (s, expected) => {
      expect(renardScale(s)).toBe(expected)
    })
  })

  describe('band 3: (46.4, 100], step 5, outputs 50–100', () => {
    it.each([
      [46.401, 50],
      [49, 50],
      [50, 50],
      [50.001, 55],
      [55, 55],
      [75, 75],
      [99, 100],
      [100, 100],
    ])('renardScale(%f) = %d', (s, expected) => {
      expect(renardScale(s)).toBe(expected)
    })
  })

  describe('band 4: (100, 215.4], step 10, outputs 110–220', () => {
    it.each([
      [100.001, 110],
      [109, 110],
      [110, 110],
      [110.001, 120],
      [150, 150],
      [215, 220],
      [215.4, 220],
    ])('renardScale(%f) = %d', (s, expected) => {
      expect(renardScale(s)).toBe(expected)
    })
  })

  describe('band 5: (215.4, 464.2], step 20, outputs 240–480', () => {
    it.each([
      [215.401, 240],
      [239, 240],
      [240, 240],
      [240.001, 260],
      [350, 360],
      [464, 480],
      [464.2, 480],
    ])('renardScale(%f) = %d', (s, expected) => {
      expect(renardScale(s)).toBe(expected)
    })
  })

  describe('band 6: (464.2, 1000], step 50, outputs 500–1000', () => {
    it.each([
      [464.201, 500],
      [499, 500],
      [500, 500],
      [500.001, 550],
      [750, 750],
      [950, 950],
      [950.001, 1000],
      [1000, 1000],
    ])('renardScale(%f) = %d', (s, expected) => {
      expect(renardScale(s)).toBe(expected)
    })
  })

  describe('breakpoint boundaries', () => {
    it.each([
      [21.5, 22],
      [46.4, 48],
      [100, 100],
      [215.4, 220],
      [464.2, 480],
      [1000, 1000],
    ])('breakpoint s=%f maps to %d', (s, expected) => {
      expect(renardScale(s)).toBe(expected)
    })
  })
})
