// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { parse, getTrailingBareNodes } from '@frantic-search/shared'
import {
  spliceBareToOracle,
  spliceBareToOracleSingle,
  getOracleLabelSingleUpgrade,
  trailingOracleRegexEligible,
} from './oracle-hint-edit'

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

  it('lightning ci:r deal 3 — regex variant yields lightning ci:r o:/deal.*3/', () => {
    const query = 'lightning ci:r deal 3'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'regex')).toBe('lightning ci:r o:/deal.*3/')
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

  it('lightning bolt — regex variant yields o:/lightning.*bolt/', () => {
    const query = 'lightning bolt'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracle(query, trailing, 'regex')).toBe('o:/lightning.*bolt/')
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

  it('raptor double — single-token hybrid index 0 yields o:raptor double', () => {
    const query = 'raptor double'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracleSingle(query, trailing, 0)).toBe('o:raptor double')
  })

  it('raptor double — single-token hybrid index 1 yields raptor o:double', () => {
    const query = 'raptor double'
    const ast = parse(query)
    const trailing = getTrailingBareNodes(ast)!
    expect(spliceBareToOracleSingle(query, trailing, 1)).toBe('raptor o:double')
  })

  it('getOracleLabelSingleUpgrade returns o: fragment for token (Spec 131 hybrid)', () => {
    const ast = parse('raptor double')
    const trailing = getTrailingBareNodes(ast)!
    expect(getOracleLabelSingleUpgrade(trailing[1]!)).toBe('o:double')
  })
})

describe('trailingOracleRegexEligible (Spec 131)', () => {
  it('returns false for a single trailing token', () => {
    const ast = parse('damage')
    const trailing = getTrailingBareNodes(ast)!
    expect(trailingOracleRegexEligible(trailing)).toBe(false)
  })

  it('returns true for two alphanumeric tokens', () => {
    const ast = parse('create creature')
    const trailing = getTrailingBareNodes(ast)!
    expect(trailingOracleRegexEligible(trailing)).toBe(true)
  })

  it('returns true for apostrophe and hyphen in tokens', () => {
    const ast = parse("don't self-mill")
    const trailing = getTrailingBareNodes(ast)!
    expect(trailingOracleRegexEligible(trailing)).toBe(true)
  })

  it('returns false when a token contains braces (mana symbols)', () => {
    const ast = parse('add {C}{C}')
    const trailing = getTrailingBareNodes(ast)!
    expect(trailingOracleRegexEligible(trailing)).toBe(false)
  })

  it('returns false when a token contains a slash', () => {
    const ast = parse('foo bar/baz')
    const trailing = getTrailingBareNodes(ast)!
    expect(trailingOracleRegexEligible(trailing)).toBe(false)
  })
})
