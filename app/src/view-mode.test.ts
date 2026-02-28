// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { VIEW_MODES, VIEW_MODE_LABELS, BATCH_SIZES, isViewMode } from './view-mode'

describe('isViewMode', () => {
  it.each(VIEW_MODES)('returns true for valid mode "%s"', (mode) => {
    expect(isViewMode(mode)).toBe(true)
  })

  it.each(['grid', '', 'SLIM', 'Detail', 'unknown', 'image'])('returns false for invalid value "%s"', (val) => {
    expect(isViewMode(val)).toBe(false)
  })
})

describe('BATCH_SIZES', () => {
  it('has a positive entry for every VIEW_MODE', () => {
    for (const mode of VIEW_MODES) {
      expect(BATCH_SIZES[mode]).toBeGreaterThan(0)
    }
  })
})

describe('VIEW_MODE_LABELS', () => {
  it('covers every VIEW_MODE exactly once', () => {
    const labelModes = VIEW_MODE_LABELS.map(l => l.mode)
    expect(labelModes).toEqual(VIEW_MODES)
  })

  it('has non-empty label strings', () => {
    for (const { label } of VIEW_MODE_LABELS) {
      expect(label.length).toBeGreaterThan(0)
    }
  })
})
