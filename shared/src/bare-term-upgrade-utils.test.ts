// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from 'vitest'
import {
  getBareTermAlternatives,
  getMultiWordAlternatives,
  getAdjacentBareWindows,
  type BareTermUpgradeContext,
} from './bare-term-upgrade-utils'
import type { BareWordNode } from './search/ast'

describe('getBareTermAlternatives', () => {
  test('keyword domain matches', () => {
    const ctx: BareTermUpgradeContext = {
      keywordLabels: ['landfall', 'flying', 'deathtouch'],
    }
    const alts = getBareTermAlternatives('landfall', ctx)
    expect(alts).toContainEqual({
      label: 'kw:landfall',
      explain: 'Use kw: for keyword abilities.',
      docRef: 'reference/fields/face/kw',
    })
  })

  test('type-line domain matches', () => {
    const ctx: BareTermUpgradeContext = {
      typeLineWords: new Set(['elf', 'creature', 'noble']),
    }
    const alts = getBareTermAlternatives('elf', ctx)
    expect(alts).toContainEqual({
      label: 't:elf',
      explain: 'Use t: for type line.',
      docRef: 'reference/fields/face/type',
    })
  })

  test('set domain matches', () => {
    const ctx: BareTermUpgradeContext = {
      knownSetCodes: new Set(['mh2', '2xm', 'dmu']),
    }
    const alts = getBareTermAlternatives('mh2', ctx)
    expect(alts).toContainEqual({
      label: 'set:mh2',
      explain: 'Use set: for set code.',
      docRef: 'reference/fields/printing/set',
    })
  })

  test('format domain matches', () => {
    const alts = getBareTermAlternatives('commander', {})
    expect(alts).toContainEqual({
      label: 'f:commander',
      explain: 'Use f: for format legality.',
      docRef: 'reference/fields/face/legal',
    })
  })

  test('is domain matches', () => {
    const alts = getBareTermAlternatives('commander', {})
    expect(alts).toContainEqual({
      label: 'is:commander',
      explain: 'Use is: for card properties.',
      docRef: 'reference/fields/face/is',
    })
  })

  test('commander matches both format and is', () => {
    const alts = getBareTermAlternatives('commander', {})
    const labels = alts.map((a) => a.label)
    expect(labels).toContain('f:commander')
    expect(labels).toContain('is:commander')
    expect(labels.indexOf('f:commander')).toBeLessThan(labels.indexOf('is:commander'))
  })

  test('game domain matches', () => {
    const alts = getBareTermAlternatives('paper', {})
    expect(alts).toContainEqual({
      label: 'game:paper',
      explain: 'Use game: for game availability.',
      docRef: 'reference/fields/printing/game',
    })
  })

  test('rarity domain matches', () => {
    const alts = getBareTermAlternatives('mythic', {})
    expect(alts).toContainEqual({
      label: 'rarity:mythic',
      explain: 'Use rarity: for printing rarity.',
      docRef: 'reference/fields/printing/rarity',
    })
  })

  test('preserves user casing in label', () => {
    const ctx: BareTermUpgradeContext = { keywordLabels: ['landfall'] }
    const alts = getBareTermAlternatives('Landfall', ctx)
    expect(alts[0].label).toBe('kw:Landfall')
  })

  test('skips keyword when keywordLabels absent', () => {
    const alts = getBareTermAlternatives('landfall', {})
    expect(alts.find((a) => a.label.startsWith('kw:'))).toBeUndefined()
  })

  test('skips set when knownSetCodes absent', () => {
    const alts = getBareTermAlternatives('mh2', {})
    expect(alts.find((a) => a.label.startsWith('set:'))).toBeUndefined()
  })

  test('otag domain when oracleTagLabels provided', () => {
    const ctx: BareTermUpgradeContext = {
      oracleTagLabels: ['ramp', 'removal', 'card-draw'],
    }
    const alts = getBareTermAlternatives('ramp', ctx)
    expect(alts).toContainEqual({
      label: 'otag:ramp',
      explain: 'Use otag: for oracle tags.',
      docRef: 'reference/fields/face/otag',
    })
  })

  test('atag domain when illustrationTagLabels provided', () => {
    const ctx: BareTermUpgradeContext = {
      illustrationTagLabels: ['chair', 'spear'],
    }
    const alts = getBareTermAlternatives('chair', ctx)
    expect(alts).toContainEqual({
      label: 'atag:chair',
      explain: 'Use atag: for illustration tags.',
      docRef: 'reference/fields/face/atag',
    })
  })
})

describe('getMultiWordAlternatives', () => {
  test('matches multi-word keyword', () => {
    const ctx: BareTermUpgradeContext = {
      keywordLabels: ['first strike', 'flying', 'double strike'],
    }
    const alts = getMultiWordAlternatives('first strike', ctx)
    expect(alts).toContainEqual({
      label: 'kw:"first strike"',
      explain: 'Use kw: for keyword abilities.',
      docRef: 'reference/fields/face/kw',
    })
  })

  test('matches artist name', () => {
    const ctx: BareTermUpgradeContext = {
      artistLabels: ['dan frazier', 'rebecca guay', 'mark poole'],
    }
    const alts = getMultiWordAlternatives('Dan Frazier', ctx)
    expect(alts).toContainEqual({
      label: 'a:"Dan Frazier"',
      explain: 'Use a: for artist name.',
      docRef: 'reference/fields/printing/artist',
    })
  })

  test('case-insensitive matching for keyword', () => {
    const ctx: BareTermUpgradeContext = {
      keywordLabels: ['double strike'],
    }
    const alts = getMultiWordAlternatives('Double Strike', ctx)
    expect(alts[0].label).toBe('kw:"Double Strike"')
  })

  test('case-insensitive matching for artist', () => {
    const ctx: BareTermUpgradeContext = {
      artistLabels: ['dan frazier'],
    }
    const alts = getMultiWordAlternatives('dan frazier', ctx)
    expect(alts[0].label).toBe('a:"dan frazier"')
  })

  test('no match when phrase not in any domain', () => {
    const ctx: BareTermUpgradeContext = {
      keywordLabels: ['flying', 'landfall'],
      artistLabels: ['dan frazier'],
    }
    const alts = getMultiWordAlternatives('foo bar', ctx)
    expect(alts).toEqual([])
  })

  test('skips keyword when keywordLabels absent', () => {
    const alts = getMultiWordAlternatives('first strike', {})
    expect(alts.find((a) => a.label.startsWith('kw:'))).toBeUndefined()
  })

  test('skips artist when artistLabels absent', () => {
    const alts = getMultiWordAlternatives('Dan Frazier', {})
    expect(alts.find((a) => a.label.startsWith('a:'))).toBeUndefined()
  })

  test('phrase matching both keyword and artist returns both', () => {
    const ctx: BareTermUpgradeContext = {
      keywordLabels: ['dan frazier'],
      artistLabels: ['dan frazier'],
    }
    const alts = getMultiWordAlternatives('Dan Frazier', ctx)
    expect(alts).toHaveLength(2)
    expect(alts.map((a) => a.label)).toContain('kw:"Dan Frazier"')
    expect(alts.map((a) => a.label)).toContain('a:"Dan Frazier"')
  })
})

describe('getAdjacentBareWindows', () => {
  function makeBare(value: string, start: number, end: number): BareWordNode {
    return { type: 'BARE', value, quoted: false, span: { start, end } }
  }

  test('two adjacent bare nodes in "first strike"', () => {
    const query = 'first strike'
    const nodes = [makeBare('first', 0, 5), makeBare('strike', 6, 12)]
    const windows = getAdjacentBareWindows(nodes, query, 3)
    expect(windows).toEqual([[0, 1]])
  })

  test('three adjacent bare nodes produce pairs and a triple', () => {
    const query = 'a b c'
    const nodes = [makeBare('a', 0, 1), makeBare('b', 2, 3), makeBare('c', 4, 5)]
    const windows = getAdjacentBareWindows(nodes, query, 3)
    expect(windows).toContainEqual([0, 1, 2])
    expect(windows).toContainEqual([0, 1])
    expect(windows).toContainEqual([1, 2])
  })

  test('non-adjacent bare nodes (field between them)', () => {
    const query = 'first ci:r strike'
    const nodes = [makeBare('first', 0, 5), makeBare('strike', 11, 17)]
    const windows = getAdjacentBareWindows(nodes, query, 3)
    expect(windows).toEqual([])
  })

  test('single bare node produces no windows', () => {
    const query = 'landfall'
    const nodes = [makeBare('landfall', 0, 8)]
    const windows = getAdjacentBareWindows(nodes, query, 3)
    expect(windows).toEqual([])
  })

  test('two bare nodes separated by multiple spaces are adjacent', () => {
    const query = 'first   strike'
    const nodes = [makeBare('first', 0, 5), makeBare('strike', 8, 14)]
    const windows = getAdjacentBareWindows(nodes, query, 3)
    expect(windows).toEqual([[0, 1]])
  })

  test('maxSize 2 limits to pairs only', () => {
    const query = 'a b c'
    const nodes = [makeBare('a', 0, 1), makeBare('b', 2, 3), makeBare('c', 4, 5)]
    const windows = getAdjacentBareWindows(nodes, query, 2)
    expect(windows).toContainEqual([0, 1])
    expect(windows).toContainEqual([1, 2])
    expect(windows.every((w) => w.length <= 2)).toBe(true)
  })

  test('returns larger windows before smaller ones', () => {
    const query = 'a b c'
    const nodes = [makeBare('a', 0, 1), makeBare('b', 2, 3), makeBare('c', 4, 5)]
    const windows = getAdjacentBareWindows(nodes, query, 3)
    const tripleIdx = windows.findIndex((w) => w.length === 3)
    const firstPairIdx = windows.findIndex((w) => w.length === 2)
    expect(tripleIdx).toBeLessThan(firstPairIdx)
  })
})
