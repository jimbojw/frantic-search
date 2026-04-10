// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { sealQuery } from './query-edit'
import { liveQueryForSuggestionApply } from './suggestion-live-apply'

describe('liveQueryForSuggestionApply', () => {
  it('returns full string when no pinned query', () => {
    expect(liveQueryForSuggestionApply('f:commander kw:landfall', false, '', sealQuery)).toBe(
      'f:commander kw:landfall',
    )
  })

  it('strips sealed pinned prefix when unchanged (issue #258)', () => {
    const pinned = 'f:commander'
    const newEff = `${sealQuery(pinned)} ${sealQuery('kw:landfall')}`
    expect(liveQueryForSuggestionApply(newEff, true, pinned, sealQuery)).toBe('kw:landfall')
  })

  it('returns new effective unchanged when prefix strip does not match', () => {
    const q = 'only-live-no-prefix-match'
    expect(liveQueryForSuggestionApply(q, true, 'f:commander', sealQuery)).toBe(q)
  })
})
