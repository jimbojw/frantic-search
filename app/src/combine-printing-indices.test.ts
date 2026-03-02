// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { combinePrintingIndices } from './combine-printing-indices'

// Synthetic canonical_face_ref: 6 printing rows mapping to face indices.
// Row 0 → face 1, row 1 → face 1, row 2 → face 1,
// row 3 → face 3, row 4 → face 3, row 5 → face 1
const canonicalFaceRef = [1, 1, 1, 3, 3, 1]
const printingCount = 6

describe('combinePrintingIndices', () => {
  it('intersects when both have printing indices', () => {
    const live = new Uint32Array([0, 1, 2])
    const pinned = new Uint32Array([1, 2, 3])
    const deduped = [1, 3]
    const result = combinePrintingIndices(live, pinned, deduped, canonicalFaceRef, printingCount)
    expect(Array.from(result!)).toEqual([1, 2])
  })

  it('filters live by pinned card set when only live has printing indices', () => {
    const live = new Uint32Array([0, 1, 3, 4])
    const deduped = [1] // only face 1 in intersection
    const result = combinePrintingIndices(live, undefined, deduped, canonicalFaceRef, printingCount)
    expect(Array.from(result!)).toEqual([0, 1])
  })

  it('filters pinned by intersected card set when only pinned has printing indices', () => {
    const pinned = new Uint32Array([0, 1, 2, 3, 4, 5])
    const deduped = [1] // only face 1 in intersection
    const result = combinePrintingIndices(undefined, pinned, deduped, canonicalFaceRef, printingCount)
    expect(Array.from(result!)).toEqual([0, 1, 2, 5])
  })

  it('returns undefined when neither has printing indices', () => {
    const deduped = [1, 3]
    const result = combinePrintingIndices(undefined, undefined, deduped, canonicalFaceRef, printingCount)
    expect(result).toBeUndefined()
  })

  it('pinned unique:prints with card-only live yields same as combined query', () => {
    const pinned = new Uint32Array([0, 1, 2, 3, 4, 5])
    const deduped = [1] // live matched face 1 only
    const result = combinePrintingIndices(undefined, pinned, deduped, canonicalFaceRef, printingCount)
    expect(Array.from(result!)).toEqual([0, 1, 2, 5])
  })

  it('returns empty array when deduped is empty', () => {
    const pinned = new Uint32Array([0, 1, 2])
    const result = combinePrintingIndices(undefined, pinned, [], canonicalFaceRef, printingCount)
    expect(Array.from(result!)).toEqual([])
  })
})
