// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { shouldShowMatchesShowingSplit } from './UnifiedBreakdown'

describe('shouldShowMatchesShowingSplit (Spec 175)', () => {
  it('is false when postCards is 0', () => {
    expect(shouldShowMatchesShowingSplit({ postCards: 0, preCards: 100 })).toBe(false)
  })
  it('is false when nothing hidden', () => {
    expect(shouldShowMatchesShowingSplit({ postCards: 3, preCards: 3 })).toBe(false)
  })
  it('is true when non-empty post and hidden cards', () => {
    expect(shouldShowMatchesShowingSplit({ postCards: 3, preCards: 4 })).toBe(true)
  })
  it('is true when hidden printings only', () => {
    expect(shouldShowMatchesShowingSplit({ postCards: 5, postPrints: 10, prePrints: 20 })).toBe(true)
  })
})
