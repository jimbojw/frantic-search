// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest'
import { isKnownColorValue, getColorAlternatives, isFormatOrIsValue, getFormatOrIsAlternatives } from './wrong-field-utils'

describe('isKnownColorValue', () => {
  test('single color names', () => {
    expect(isKnownColorValue('white')).toBe(true)
    expect(isKnownColorValue('blue')).toBe(true)
    expect(isKnownColorValue('black')).toBe(true)
    expect(isKnownColorValue('red')).toBe(true)
    expect(isKnownColorValue('green')).toBe(true)
  })

  test('guild names', () => {
    expect(isKnownColorValue('azorius')).toBe(true)
    expect(isKnownColorValue('dimir')).toBe(true)
    expect(isKnownColorValue('rakdos')).toBe(true)
  })

  test('special predicates', () => {
    expect(isKnownColorValue('colorless')).toBe(true)
    expect(isKnownColorValue('c')).toBe(true)
    expect(isKnownColorValue('multicolor')).toBe(true)
    expect(isKnownColorValue('m')).toBe(true)
  })

  test('WUBRG letter sequences', () => {
    expect(isKnownColorValue('w')).toBe(true)
    expect(isKnownColorValue('wubrg')).toBe(true)
    expect(isKnownColorValue('wu')).toBe(true)
    expect(isKnownColorValue('WUBRG')).toBe(true)
  })

  test('rejects non-color values', () => {
    expect(isKnownColorValue('xyz')).toBe(false)
    expect(isKnownColorValue('is')).toBe(false)
    expect(isKnownColorValue('foil')).toBe(false)
    expect(isKnownColorValue('')).toBe(false)
  })

  test('rejects invalid letter sequences', () => {
    expect(isKnownColorValue('wx')).toBe(false)
    expect(isKnownColorValue('wubrgy')).toBe(false)
  })
})

describe('getColorAlternatives', () => {
  test('FIELD node is:white returns ci/c/produces alternatives', () => {
    const node = { type: 'FIELD' as const, label: 'is:white', matchCount: 0 }
    const alts = getColorAlternatives(node)
    expect(alts).toHaveLength(3)
    expect(alts[0]).toEqual({ field: 'ci', label: 'ci:w', value: 'w', explain: 'Use ci: for color identity.', docRef: 'reference/fields/face/identity' })
    expect(alts[1]).toEqual({ field: 'c', label: 'c:w', value: 'w', explain: 'Use c: for card color.', docRef: 'reference/fields/face/color' })
    expect(alts[2]).toEqual({ field: 'produces', label: 'produces:w', value: 'w', explain: 'Use produces: for mana the card can produce.', docRef: 'reference/fields/face/produces' })
  })

  test('NOT node -is:white returns positive-form alternatives', () => {
    const node = { type: 'NOT' as const, label: '-is:white', matchCount: 0 }
    const alts = getColorAlternatives(node)
    expect(alts).toHaveLength(3)
    expect(alts[0].label).toBe('ci:w')
    expect(alts[1].label).toBe('c:w')
    expect(alts[2].label).toBe('produces:w')
  })

  test('in:azorius keeps full name for multicolor', () => {
    const node = { type: 'FIELD' as const, label: 'in:azorius', matchCount: 0 }
    const alts = getColorAlternatives(node)
    expect(alts[0].label).toBe('ci:azorius')
    expect(alts[0].value).toBe('azorius')
    expect(alts[1].label).toBe('c:azorius')
    expect(alts[2].label).toBe('produces:azorius')
  })

  test('type:wubrg keeps letter sequence', () => {
    const node = { type: 'FIELD' as const, label: 'type:wubrg', matchCount: 0 }
    const alts = getColorAlternatives(node)
    expect(alts[0].label).toBe('ci:wubrg')
    expect(alts[0].value).toBe('wubrg')
  })

  test('is:c keeps colorless shorthand', () => {
    const node = { type: 'FIELD' as const, label: 'is:c', matchCount: 0 }
    const alts = getColorAlternatives(node)
    expect(alts[0].label).toBe('ci:c')
    expect(alts[0].value).toBe('c')
  })
})

describe('isFormatOrIsValue', () => {
  test('format names', () => {
    expect(isFormatOrIsValue('commander')).toBe(true)
    expect(isFormatOrIsValue('modern')).toBe(true)
    expect(isFormatOrIsValue('edh')).toBe(true)
    expect(isFormatOrIsValue('standard')).toBe(true)
  })

  test('is: keywords', () => {
    expect(isFormatOrIsValue('vanilla')).toBe(true)
    expect(isFormatOrIsValue('foil')).toBe(true)
    expect(isFormatOrIsValue('dfc')).toBe(true)
  })

  test('rejects non-format non-is values', () => {
    expect(isFormatOrIsValue('xyz')).toBe(false)
    expect(isFormatOrIsValue('white')).toBe(false)
    expect(isFormatOrIsValue('')).toBe(false)
  })
})

describe('getFormatOrIsAlternatives', () => {
  test('type:commander returns both f: and is: (commander is format + is keyword)', () => {
    const node = { type: 'FIELD' as const, label: 'type:commander', matchCount: 0 }
    const alts = getFormatOrIsAlternatives(node)
    expect(alts).toHaveLength(2)
    expect(alts[0]).toEqual({
      field: 'f',
      label: 'f:commander',
      value: 'commander',
      explain: 'Use f: for format legality.',
      docRef: 'reference/fields/face/legal',
    })
    expect(alts[1]).toEqual({
      field: 'is',
      label: 'is:commander',
      value: 'commander',
      explain: 'Use is: for card properties.',
      docRef: 'reference/fields/face/is',
    })
  })

  test('type:modern returns f: only', () => {
    const node = { type: 'FIELD' as const, label: 'type:modern', matchCount: 0 }
    const alts = getFormatOrIsAlternatives(node)
    expect(alts).toHaveLength(1)
    expect(alts[0].label).toBe('f:modern')
  })

  test('type:vanilla returns is: only', () => {
    const node = { type: 'FIELD' as const, label: 'type:vanilla', matchCount: 0 }
    const alts = getFormatOrIsAlternatives(node)
    expect(alts).toHaveLength(1)
    expect(alts[0].label).toBe('is:vanilla')
  })

  test('NOT node -type:commander returns positive-form alternatives', () => {
    const node = { type: 'NOT' as const, label: '-type:commander', matchCount: 0 }
    const alts = getFormatOrIsAlternatives(node)
    expect(alts).toHaveLength(2)
    expect(alts[0].label).toBe('f:commander')
    expect(alts[1].label).toBe('is:commander')
  })
})
