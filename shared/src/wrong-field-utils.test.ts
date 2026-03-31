// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest'
import {
  isKnownColorValue,
  getColorAlternatives,
  isFormatOrIsValue,
  getFormatOrIsAlternatives,
  getArtistAtagAlternative,
  ARTIST_TRIGGER_FIELDS,
  ATAG_TRIGGER_FIELDS,
  COLOR_EQUALS_RELAX_FIELDS,
  IDENTITY_EQUALS_RELAX_FIELDS,
  getOperatorRelaxAlternatives,
  isUnknownKeywordIsNotError,
  parseIsNotInnerLabel,
  buildIsNotKwTReplacement,
  getIsNotKeywordWrongFieldAlternatives,
} from './wrong-field-utils'

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
    expect(alts[0]).toEqual({ field: 'ci', label: 'ci:w', value: 'w', explain: 'Use ci: for color identity.', docRef: 'reference/fields/card/identity' })
    expect(alts[1]).toEqual({ field: 'c', label: 'c:w', value: 'w', explain: 'Use c: for card color.', docRef: 'reference/fields/face/color' })
    expect(alts[2]).toEqual({ field: 'produces', label: 'produces:w', value: 'w', explain: 'Use produces: for mana the card can produce.', docRef: 'reference/fields/card/produces' })
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
      docRef: 'reference/fields/card/legal',
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

describe('getArtistAtagAlternative (Spec 153)', () => {
  test('a:spear from artist suggests atag:spear', () => {
    const node = { type: 'FIELD' as const, label: 'a:spear', matchCount: 0 }
    const alt = getArtistAtagAlternative(node, 'artist')
    expect(alt).not.toBeNull()
    expect(alt!.field).toBe('atag')
    expect(alt!.label).toBe('atag:spear')
    expect(alt!.explain).toBe('Use atag: for illustration tags.')
    expect(alt!.docRef).toBe('reference/fields/printing/atag')
  })

  test('atag:frazier from atag suggests a:frazier', () => {
    const node = { type: 'FIELD' as const, label: 'atag:frazier', matchCount: 0 }
    const alt = getArtistAtagAlternative(node, 'atag')
    expect(alt).not.toBeNull()
    expect(alt!.field).toBe('a')
    expect(alt!.label).toBe('a:frazier')
    expect(alt!.explain).toBe('Use a: for artist name.')
    expect(alt!.docRef).toBe('reference/fields/face/artist')
  })

  test('NOT node -atag:chair extracts value correctly', () => {
    const node = { type: 'NOT' as const, label: '-atag:chair', matchCount: 0 }
    const alt = getArtistAtagAlternative(node, 'atag')
    expect(alt).not.toBeNull()
    expect(alt!.label).toBe('a:chair')
  })

  test('empty value returns null', () => {
    const node = { type: 'FIELD' as const, label: 'a:', matchCount: 0 }
    expect(getArtistAtagAlternative(node, 'artist')).toBeNull()
  })
})

describe('getOperatorRelaxAlternatives (Spec 156)', () => {
  test('returns [] for digit-only value', () => {
    expect(getOperatorRelaxAlternatives('identity', 'ci', '2')).toEqual([])
    expect(getOperatorRelaxAlternatives('color', 'c', '01')).toEqual([])
  })

  test('returns [] when value is not a known color', () => {
    expect(getOperatorRelaxAlternatives('identity', 'ci', 'xyz')).toEqual([])
    expect(getOperatorRelaxAlternatives('color', 'c', 'foil')).toEqual([])
  })

  test('identity returns : then >= with preserved field token', () => {
    const alts = getOperatorRelaxAlternatives('identity', 'commander', 'u')
    expect(alts).toHaveLength(2)
    expect(alts[0].label).toBe('commander:u')
    expect(alts[1].label).toBe('commander>=u')
    expect(alts[0].explain).toContain('subset')
    expect(alts[1].explain).toContain('superset')
    expect(alts[0].docRef).toBe('reference/fields/card/identity')
    expect(alts[1].docRef).toBe('reference/fields/card/identity')
  })

  test('color returns only colon alternative', () => {
    const alts = getOperatorRelaxAlternatives('color', 'c', 'r')
    expect(alts).toHaveLength(1)
    expect(alts[0].label).toBe('c:r')
    expect(alts[0].docRef).toBe('reference/fields/face/color')
  })

  test('normalizes single color names like wrong-field', () => {
    expect(getOperatorRelaxAlternatives('identity', 'id', 'blue')[0].label).toBe('id:u')
  })
})

describe('COLOR_EQUALS_RELAX_FIELDS and IDENTITY_EQUALS_RELAX_FIELDS', () => {
  test('color keys include c and color', () => {
    expect(COLOR_EQUALS_RELAX_FIELDS).toContain('c')
    expect(COLOR_EQUALS_RELAX_FIELDS).toContain('color')
  })

  test('identity keys include ci, id, commander, cmd', () => {
    expect(IDENTITY_EQUALS_RELAX_FIELDS).toContain('ci')
    expect(IDENTITY_EQUALS_RELAX_FIELDS).toContain('id')
    expect(IDENTITY_EQUALS_RELAX_FIELDS).toContain('commander')
    expect(IDENTITY_EQUALS_RELAX_FIELDS).toContain('cmd')
  })
})

describe('ARTIST_TRIGGER_FIELDS and ATAG_TRIGGER_FIELDS', () => {
  test('artist trigger includes a and artist', () => {
    expect(ARTIST_TRIGGER_FIELDS).toContain('a')
    expect(ARTIST_TRIGGER_FIELDS).toContain('artist')
  })

  test('atag trigger includes atag and art', () => {
    expect(ATAG_TRIGGER_FIELDS).toContain('atag')
    expect(ATAG_TRIGGER_FIELDS).toContain('art')
  })
})

describe('is:/not: unknown keyword wrong-field helpers (Spec 153)', () => {
  test('isUnknownKeywordIsNotError', () => {
    expect(isUnknownKeywordIsNotError('unknown keyword "foo"')).toBe(true)
    expect(isUnknownKeywordIsNotError('unsupported keyword "foo"')).toBe(false)
    expect(isUnknownKeywordIsNotError(undefined)).toBe(false)
  })

  test('parseIsNotInnerLabel', () => {
    expect(parseIsNotInnerLabel('is:instant')).toEqual({ field: 'is', value: 'instant' })
    expect(parseIsNotInnerLabel('not:creature')).toEqual({ field: 'not', value: 'creature' })
    expect(parseIsNotInnerLabel('t:creature')).toBe(null)
    expect(parseIsNotInnerLabel('is:')).toBe(null)
  })

  test('buildIsNotKwTReplacement negation table', () => {
    expect(buildIsNotKwTReplacement('is', false, 'kw', 'fly')).toBe('kw:fly')
    expect(buildIsNotKwTReplacement('is', true, 'kw', 'fly')).toBe('-kw:fly')
    expect(buildIsNotKwTReplacement('not', false, 'kw', 'fly')).toBe('-kw:fly')
    expect(buildIsNotKwTReplacement('not', true, 'kw', 'fly')).toBe('kw:fly')
    expect(buildIsNotKwTReplacement('is', false, 't', 'instant')).toBe('t:instant')
    expect(buildIsNotKwTReplacement('not', false, 't', 'instant')).toBe('-t:instant')
  })

  test('getIsNotKeywordWrongFieldAlternatives skips color values', () => {
    const ctx = {
      keywordLowerSet: new Set(['flying']),
      typeLineWords: new Set(['creature']),
    }
    expect(getIsNotKeywordWrongFieldAlternatives('is', false, 'white', ctx)).toEqual([])
  })

  test('getIsNotKeywordWrongFieldAlternatives kw before t', () => {
    const ctx = {
      keywordLowerSet: new Set(['flying']),
      typeLineWords: new Set(['flying']),
    }
    const alts = getIsNotKeywordWrongFieldAlternatives('is', false, 'Flying', ctx)
    expect(alts).toHaveLength(2)
    expect(alts[0]!.label).toBe('kw:Flying')
    expect(alts[0]!.requirePositiveCount).toBe(false)
    expect(alts[1]!.label).toBe('t:Flying')
    expect(alts[1]!.requirePositiveCount).toBe(true)
  })
})
