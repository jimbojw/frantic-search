// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { dedupePrintingItems } from './dedup-printing-items'

describe('dedupePrintingItems', () => {
  it('returns all printings when mode is prints', () => {
    const printingIndices = [0, 1, 2, 3, 4]
    const canonicalFaceRef = (idx: number) => [1, 1, 1, 3, 3][idx]!
    const result = dedupePrintingItems(printingIndices, canonicalFaceRef, 'prints')
    expect(result).toEqual([0, 1, 2, 3, 4])
  })

  it('returns one printing per canonical face when mode is cards', () => {
    // Face 1: printings 0, 1, 2. Face 3: printings 3, 4.
    const printingIndices = [0, 1, 2, 3, 4]
    const canonicalFaceRef = (idx: number) => [1, 1, 1, 3, 3][idx]!
    const result = dedupePrintingItems(printingIndices, canonicalFaceRef, 'cards')
    expect(result).toEqual([0, 3])
  })

  it('preserves first-occurrence order when mode is cards', () => {
    const printingIndices = [4, 2, 0, 3, 1]
    const canonicalFaceRef = (idx: number) => [1, 1, 1, 3, 3][idx]!
    const result = dedupePrintingItems(printingIndices, canonicalFaceRef, 'cards')
    expect(result).toEqual([4, 2])
  })

  it('handles empty input', () => {
    const result = dedupePrintingItems([], (_idx) => 0, 'cards')
    expect(result).toEqual([])
  })

  it('handles single printing', () => {
    const result = dedupePrintingItems([5], (_idx) => 1, 'cards')
    expect(result).toEqual([5])
  })
})
