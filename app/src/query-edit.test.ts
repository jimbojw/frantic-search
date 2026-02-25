// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { sealQuery } from './query-edit'

describe('sealQuery', () => {
  it('returns an already-valid query unchanged', () => {
    expect(sealQuery('t:creature')).toBe('t:creature')
    expect(sealQuery('ci>=r t:creature')).toBe('ci>=r t:creature')
    expect(sealQuery('')).toBe('')
  })

  it('closes an unclosed double quote', () => {
    expect(sealQuery('name:"ang')).toBe('name:"ang"')
  })

  it('closes an unclosed single quote', () => {
    expect(sealQuery("name:'ang")).toBe("name:'ang'")
  })

  it('closes an unclosed regex', () => {
    expect(sealQuery('name:/ang')).toBe('name:/ang/')
  })

  it('closes an unclosed parenthesis', () => {
    expect(sealQuery('(t:creature')).toBe('(t:creature)')
  })

  it('closes multiple unclosed parentheses', () => {
    expect(sealQuery('((a OR b)')).toBe('((a OR b))')
  })

  it('closes an unclosed quote inside an unclosed paren', () => {
    expect(sealQuery('(name:"ang')).toBe('(name:"ang")')
  })

  it('handles the motivating example with nested unclosed constructs', () => {
    expect(sealQuery('f:commander (t:enchantment OR name:"ang'))
      .toBe('f:commander (t:enchantment OR name:"ang")')
  })

  it('does not double-close a properly closed quote', () => {
    expect(sealQuery('name:"ang"')).toBe('name:"ang"')
  })

  it('does not double-close a properly closed regex', () => {
    expect(sealQuery('name:/ang/')).toBe('name:/ang/')
  })

  it('does not double-close balanced parentheses', () => {
    expect(sealQuery('(a OR b)')).toBe('(a OR b)')
  })

  it('closes an empty unclosed quote', () => {
    expect(sealQuery('name:"')).toBe('name:""')
  })

  it('closes an empty unclosed regex', () => {
    expect(sealQuery('name:/')).toBe('name://')
  })

  it('handles unclosed regex with content after field operator', () => {
    expect(sealQuery('/ang')).toBe('/ang/')
  })

  it('does not treat slash inside a word as a regex opener', () => {
    // The lexer treats 'foo/bar' as a single WORD — no unclosed regex
    expect(sealQuery('foo/bar')).toBe('foo/bar')
  })
})
