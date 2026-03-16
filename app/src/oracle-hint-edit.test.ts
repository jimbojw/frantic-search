// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { parse, getTrailingBareNodes } from '@frantic-search/shared'
import { spliceBareToOracle } from './oracle-hint-edit'

describe('spliceBareToOracle', () => {
  it('lightning ci:r deal 3 — phrase variant yields lightning ci:r o:"deal 3"', () => {
    const query = 'lightning ci:r deal 3'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'phrase')).toBe('lightning ci:r o:"deal 3"')
  })

  it('lightning ci:r deal 3 — per-word variant yields lightning ci:r o:deal o:3', () => {
    const query = 'lightning ci:r deal 3'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'per-word')).toBe('lightning ci:r o:deal o:3')
  })

  it('"deal 3" — phrase variant yields o:"deal 3"', () => {
    const query = '"deal 3"'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'phrase')).toBe('o:"deal 3"')
  })

  it('lightning bolt — phrase variant yields o:"lightning bolt"', () => {
    const query = 'lightning bolt'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'phrase')).toBe('o:"lightning bolt"')
  })

  it('lightning bolt — per-word variant yields o:lightning o:bolt', () => {
    const query = 'lightning bolt'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'per-word')).toBe('o:lightning o:bolt')
  })

  it('single word damage — phrase yields o:damage', () => {
    const query = 'damage'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'phrase')).toBe('o:damage')
  })

  it('single word damage — per-word yields o:damage', () => {
    const query = 'damage'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'per-word')).toBe('o:damage')
  })
})
