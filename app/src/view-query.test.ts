// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { extractViewMode, isValidViewValue } from './view-query'

describe('extractViewMode', () => {
  it('returns slim when query is empty', () => {
    expect(extractViewMode('')).toBe('slim')
    expect(extractViewMode('   ')).toBe('slim')
  })

  it('returns the value for a single view: term', () => {
    expect(extractViewMode('view:detail')).toBe('detail')
    expect(extractViewMode('view:images')).toBe('images')
    expect(extractViewMode('view:full')).toBe('full')
    expect(extractViewMode('view:slim')).toBe('slim')
  })

  it('returns the value for v: alias (Spec 083)', () => {
    expect(extractViewMode('v:detail')).toBe('detail')
    expect(extractViewMode('v:images')).toBe('images')
    expect(extractViewMode('v:slim t:creature')).toBe('slim')
  })

  it('resolves abbreviated view values (Spec 103)', () => {
    expect(extractViewMode('view:i')).toBe('images')
    expect(extractViewMode('v:i')).toBe('images')
    expect(extractViewMode('view:s')).toBe('slim')
  })

  it('returns the last valid view: when multiple exist', () => {
    expect(extractViewMode('a view:slim b view:images')).toBe('images')
    expect(extractViewMode('view:detail view:full')).toBe('full')
    expect(extractViewMode('view:full view:slim view:detail')).toBe('detail')
  })

  it('ignores invalid view: values and uses last valid', () => {
    expect(extractViewMode('view:invalid')).toBe('slim')
    expect(extractViewMode('view:images view:invalid')).toBe('images')
    expect(extractViewMode('view:invalid view:detail')).toBe('detail')
    expect(extractViewMode('view:foo view:bar view:images')).toBe('images')
  })

  it('defaults to slim when no valid view: term', () => {
    expect(extractViewMode('t:creature')).toBe('slim')
    expect(extractViewMode('lightning bolt')).toBe('slim')
  })

  it('handles combined pinned+live style queries', () => {
    expect(extractViewMode('f:commander view:images t:creature')).toBe('images')
    expect(extractViewMode('f:commander t:creature view:slim')).toBe('slim')
  })
})

describe('isValidViewValue', () => {
  it('returns true for valid values', () => {
    expect(isValidViewValue('slim')).toBe(true)
    expect(isValidViewValue('detail')).toBe(true)
    expect(isValidViewValue('images')).toBe(true)
    expect(isValidViewValue('full')).toBe(true)
  })

  it('returns false for invalid values', () => {
    expect(isValidViewValue('invalid')).toBe(false)
    expect(isValidViewValue('')).toBe(false)
    expect(isValidViewValue('foo')).toBe(false)
  })
})
