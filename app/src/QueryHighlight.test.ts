// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { lex, TokenType, FIELD_ALIASES } from '@frantic-search/shared'
import type { Token } from '@frantic-search/shared'

type HighlightRole =
  | 'field'
  | 'field-unknown'
  | 'operator'
  | 'value'
  | 'bare'
  | 'quoted'
  | 'regex'
  | 'not'
  | 'paren'
  | 'keyword'

const EXTRA_KNOWN_FIELDS = new Set(['unique'])

const OPERATORS = new Set<string>([
  TokenType.COLON,
  TokenType.EQ,
  TokenType.NEQ,
  TokenType.LT,
  TokenType.GT,
  TokenType.LTE,
  TokenType.GTE,
])

function classifyToken(token: Token, prev: Token | undefined, next: Token | undefined): HighlightRole {
  switch (token.type) {
    case TokenType.DASH:
    case TokenType.BANG:
      return 'not'
    case TokenType.LPAREN:
    case TokenType.RPAREN:
      return 'paren'
    case TokenType.OR:
      return 'keyword'
    case TokenType.QUOTED:
      return 'quoted'
    case TokenType.REGEX:
      return 'regex'
    case TokenType.COLON:
    case TokenType.EQ:
    case TokenType.NEQ:
    case TokenType.LT:
    case TokenType.GT:
    case TokenType.LTE:
    case TokenType.GTE:
      return 'operator'
    case TokenType.WORD:
      if (prev && OPERATORS.has(prev.type)) return 'value'
      if (next && OPERATORS.has(next.type)) {
        const lower = token.value.toLowerCase()
        return (lower in FIELD_ALIASES || EXTRA_KNOWN_FIELDS.has(lower)) ? 'field' : 'field-unknown'
      }
      return 'bare'
    default:
      return 'bare'
  }
}

interface HighlightSpan {
  text: string
  role: HighlightRole | null
}

function buildSpans(query: string): HighlightSpan[] {
  if (!query) return []
  const tokens = lex(query)
  const spans: HighlightSpan[] = []
  let cursor = 0

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type === TokenType.EOF) break

    if (tok.start > cursor) {
      spans.push({ text: query.slice(cursor, tok.start), role: null })
    }

    const prev = i > 0 ? tokens[i - 1] : undefined
    const next = i + 1 < tokens.length ? tokens[i + 1] : undefined
    const role = classifyToken(tok, prev, next)
    spans.push({ text: query.slice(tok.start, tok.end), role })
    cursor = tok.end
  }

  if (cursor < query.length) {
    spans.push({ text: query.slice(cursor), role: null })
  }

  return spans
}

function roles(query: string): Array<[string, HighlightRole | null]> {
  return buildSpans(query).map(s => [s.text, s.role])
}

describe('buildSpans', () => {
  it('returns empty for empty query', () => {
    expect(buildSpans('')).toEqual([])
  })

  it('classifies a bare word', () => {
    expect(roles('lightning')).toEqual([['lightning', 'bare']])
  })

  it('classifies field:value', () => {
    expect(roles('t:creature')).toEqual([
      ['t', 'field'],
      [':', 'operator'],
      ['creature', 'value'],
    ])
  })

  it('classifies unknown field', () => {
    expect(roles('xyz:bad')).toEqual([
      ['xyz', 'field-unknown'],
      [':', 'operator'],
      ['bad', 'value'],
    ])
  })

  it('classifies operators', () => {
    expect(roles('pow>=3')).toEqual([
      ['pow', 'field'],
      ['>=', 'operator'],
      ['3', 'value'],
    ])
  })

  it('classifies NOT with dash', () => {
    expect(roles('-t:instant')).toEqual([
      ['-', 'not'],
      ['t', 'field'],
      [':', 'operator'],
      ['instant', 'value'],
    ])
  })

  it('classifies quoted strings', () => {
    expect(roles('"lightning bolt"')).toEqual([
      ['"lightning bolt"', 'quoted'],
    ])
  })

  it('classifies quoted strings after operators as quoted', () => {
    expect(roles('o:"enters the"')).toEqual([
      ['o', 'field'],
      [':', 'operator'],
      ['"enters the"', 'quoted'],
    ])
  })

  it('classifies regex', () => {
    expect(roles('/^{T}:/')).toEqual([
      ['/^{T}:/', 'regex'],
    ])
  })

  it('classifies parens', () => {
    expect(roles('(a OR b)')).toEqual([
      ['(', 'paren'],
      ['a', 'bare'],
      [' ', null],
      ['OR', 'keyword'],
      [' ', null],
      ['b', 'bare'],
      [')', 'paren'],
    ])
  })

  it('classifies OR keyword', () => {
    expect(roles('a OR b')).toEqual([
      ['a', 'bare'],
      [' ', null],
      ['OR', 'keyword'],
      [' ', null],
      ['b', 'bare'],
    ])
  })

  it('preserves whitespace between tokens', () => {
    expect(roles('t:creature  c:green')).toEqual([
      ['t', 'field'],
      [':', 'operator'],
      ['creature', 'value'],
      ['  ', null],
      ['c', 'field'],
      [':', 'operator'],
      ['green', 'value'],
    ])
  })

  it('handles complex queries', () => {
    expect(roles('-t:instant "bolt" OR xyz:bad')).toEqual([
      ['-', 'not'],
      ['t', 'field'],
      [':', 'operator'],
      ['instant', 'value'],
      [' ', null],
      ['"bolt"', 'quoted'],
      [' ', null],
      ['OR', 'keyword'],
      [' ', null],
      ['xyz', 'field-unknown'],
      [':', 'operator'],
      ['bad', 'value'],
    ])
  })

  it('classifies bang for exact name', () => {
    expect(roles('!"Lightning Bolt"')).toEqual([
      ['!', 'not'],
      ['"Lightning Bolt"', 'quoted'],
    ])
  })

  it('classifies unique:prints as known field', () => {
    expect(roles('unique:prints')).toEqual([
      ['unique', 'field'],
      [':', 'operator'],
      ['prints', 'value'],
    ])
  })

  it('classifies all field aliases as known', () => {
    for (const alias of Object.keys(FIELD_ALIASES)) {
      const result = roles(`${alias}:val`)
      expect(result[0]).toEqual([alias, 'field'])
    }
  })
})
