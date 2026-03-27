// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { ghostCompletionPreconditionsMet } from './useDebouncedGhostText'
import type { AutocompleteData } from './query-autocomplete'

const dummyData: AutocompleteData = {
  fieldAliases: { t: 'type' },
  names: [],
  typeLines: [],
  setCodes: [],
  rarityNames: {},
  formatNames: {},
  colorNames: {},
  isKeywords: [],
  oracleTagLabels: [],
  illustrationTagLabels: [],
  keywordLabels: [],
}

describe('ghostCompletionPreconditionsMet', () => {
  it('requires caret at end of query', () => {
    expect(
      ghostCompletionPreconditionsMet('set:u', 4, 4, false, dummyData, true),
    ).toBe(false)
    expect(
      ghostCompletionPreconditionsMet('set:u', 5, 5, false, dummyData, true),
    ).toBe(true)
  })

  it('requires collapsed selection', () => {
    expect(
      ghostCompletionPreconditionsMet('abc', 1, 3, false, dummyData, true),
    ).toBe(false)
  })

  it('blocks when composing or no data', () => {
    expect(
      ghostCompletionPreconditionsMet('x', 1, 1, true, dummyData, true),
    ).toBe(false)
    expect(ghostCompletionPreconditionsMet('x', 1, 1, false, null, true)).toBe(
      false,
    )
  })

  it('respects focus when provided', () => {
    expect(
      ghostCompletionPreconditionsMet('x', 1, 1, false, dummyData, false),
    ).toBe(false)
    expect(
      ghostCompletionPreconditionsMet('x', 1, 1, false, dummyData, undefined),
    ).toBe(true)
  })
})
