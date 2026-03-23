// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from 'vitest'
import {
  getBareTermAlternatives,
  type BareTermUpgradeContext,
} from './bare-term-upgrade-utils'

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
