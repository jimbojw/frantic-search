// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { FIELD_ALIASES } from '@frantic-search/shared'
import type { BreakdownNode } from '@frantic-search/shared'
import { buildSpans } from './QueryHighlight'
import type { HighlightSpan } from './QueryHighlight'

type HighlightRole = NonNullable<HighlightSpan['role']>

function roles(query: string, breakdown?: BreakdownNode | null): Array<[string, HighlightRole | null]> {
  return buildSpans(query, breakdown).map(s => [s.text, s.role])
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

  it('classifies display: and order: as known fields (Spec 107)', () => {
    expect(roles('display:full')).toEqual([
      ['display', 'field'],
      [':', 'operator'],
      ['full', 'value'],
    ])
    expect(roles('order:name')).toEqual([
      ['order', 'field'],
      [':', 'operator'],
      ['name', 'value'],
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

  it('classifies # metadata tags with metadata role (Spec 123)', () => {
    expect(roles('#combo')).toEqual([['#combo', 'metadata']])
    expect(roles('my:list #combo')).toEqual([
      ['my', 'field'],
      [':', 'operator'],
      ['list', 'value'],
      [' ', null],
      ['#combo', 'metadata'],
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

  it('classifies v: alias as known field (Spec 083)', () => {
    expect(roles('v:slim')).toEqual([
      ['v', 'field'],
      [':', 'operator'],
      ['slim', 'value'],
    ])
  })

  it('classifies all field aliases as known', () => {
    for (const alias of Object.keys(FIELD_ALIASES)) {
      const result = roles(`${alias}:val`)
      expect(result[0]).toEqual([alias, 'field'])
    }
  })

  describe('breakdown overlay (Spec 088)', () => {
    it('overrides value to value-error when breakdown has error on value', () => {
      const query = 'set:us'
      const breakdown: BreakdownNode = {
        type: 'FIELD',
        label: 'set:us',
        matchCount: -1,
        error: 'unknown set "us"',
        span: { start: 0, end: 6 },
        valueSpan: { start: 4, end: 6 },
      }
      expect(roles(query, breakdown)).toEqual([
        ['set', 'field'],
        [':', 'operator'],
        ['us', 'value-error'],
      ])
    })

    it('overrides whole term to value-zero when breakdown has zero matchCount', () => {
      const query = 't:nonexistent'
      const flatBreakdown = {
        type: 'FIELD',
        label: 't:nonexistent',
        matchCount: 0,
        span: { start: 0, end: 13 },
      } as BreakdownNode
      const result = roles(query, flatBreakdown)
      expect(result).toEqual([
        ['t', 'value-zero'],
        [':', 'value-zero'],
        ['nonexistent', 'value-zero'],
      ])
    })

    it('uses full span for error when valueSpan absent', () => {
      const query = 'foo:bar'
      const breakdown: BreakdownNode = {
        type: 'FIELD',
        label: 'foo:bar',
        matchCount: -1,
        error: 'unknown field "foo"',
        span: { start: 0, end: 7 },
      }
      expect(roles(query, breakdown)).toEqual([
        ['foo', 'value-error'],
        [':', 'value-error'],
        ['bar', 'value-error'],
      ])
    })

    it('ignores breakdown when null', () => {
      expect(roles('set:us', null)).toEqual(roles('set:us'))
    })

    it('ignores breakdown when it does not match current query (stale)', () => {
      const query = 'tarmogy'
      const staleBreakdown: BreakdownNode = {
        type: 'BARE',
        label: 'tarmog',
        matchCount: 1,
        span: { start: 0, end: 6 },
      }
      expect(roles(query, staleBreakdown)).toEqual(roles(query))
    })

    it('ignores spans beyond query length', () => {
      const query = 'set:us'
      const breakdown: BreakdownNode = {
        type: 'AND',
        label: 'AND',
        matchCount: 0,
        children: [
          {
            type: 'FIELD',
            label: 'set:us',
            matchCount: -1,
            error: 'unknown set "us"',
            span: { start: 0, end: 10 },
            valueSpan: { start: 4, end: 10 },
          },
        ],
      }
      expect(roles(query, breakdown)).toEqual(roles(query))
    })
  })
})
