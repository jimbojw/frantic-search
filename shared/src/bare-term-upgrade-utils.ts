// SPDX-License-Identifier: Apache-2.0
import { FORMAT_NAMES, GAME_NAMES, FRAME_NAMES, RARITY_NAMES } from './bits'
import { IS_KEYWORDS } from './search/eval-is'

export type BareTermUpgradeContext = {
  keywordLabels?: string[]
  typeLineWords?: Set<string>
  knownSetCodes?: Set<string>
  oracleTagLabels?: string[]
  illustrationTagLabels?: string[]
}

export type BareTermAlternative = {
  label: string
  explain: string
  docRef: string
}

const DOMAINS: Array<{
  field: string
  explain: string
  docRef: string
  check: (value: string, ctx: BareTermUpgradeContext) => boolean
}> = [
  {
    field: 'kw',
    explain: 'Use kw: for keyword abilities.',
    docRef: 'reference/fields/face/kw',
    check: (v, ctx) =>
      !!ctx.keywordLabels?.length &&
      new Set(ctx.keywordLabels.map((l) => l.toLowerCase())).has(v),
  },
  {
    field: 't',
    explain: 'Use t: for type line.',
    docRef: 'reference/fields/face/type',
    check: (v, ctx) => !!ctx.typeLineWords?.has(v),
  },
  {
    field: 'set',
    explain: 'Use set: for set code.',
    docRef: 'reference/fields/printing/set',
    check: (v, ctx) => !!ctx.knownSetCodes?.has(v),
  },
  {
    field: 'f',
    explain: 'Use f: for format legality.',
    docRef: 'reference/fields/face/legal',
    check: (v) => v in FORMAT_NAMES,
  },
  {
    field: 'is',
    explain: 'Use is: for card properties.',
    docRef: 'reference/fields/face/is',
    check: (v) => IS_KEYWORDS.includes(v),
  },
  {
    field: 'otag',
    explain: 'Use otag: for oracle tags.',
    docRef: 'reference/fields/face/otag',
    check: (v, ctx) =>
      !!ctx.oracleTagLabels?.length &&
      new Set(ctx.oracleTagLabels.map((l) => l.toLowerCase())).has(v),
  },
  {
    field: 'atag',
    explain: 'Use atag: for illustration tags.',
    docRef: 'reference/fields/face/atag',
    check: (v, ctx) =>
      !!ctx.illustrationTagLabels?.length &&
      new Set(ctx.illustrationTagLabels.map((l) => l.toLowerCase())).has(v),
  },
  {
    field: 'game',
    explain: 'Use game: for game availability.',
    docRef: 'reference/fields/printing/game',
    check: (v) => v in GAME_NAMES,
  },
  {
    field: 'frame',
    explain: 'Use frame: for card frame.',
    docRef: 'reference/fields/printing/frame',
    check: (v) => v in FRAME_NAMES,
  },
  {
    field: 'rarity',
    explain: 'Use rarity: for printing rarity.',
    docRef: 'reference/fields/printing/rarity',
    check: (v) => v in RARITY_NAMES,
  },
]

/**
 * For a bare term value, returns alternatives for each matching domain
 * (Spec 154). Domain order: keyword → type-line → set → format → is →
 * otag → atag → game → frame → rarity.
 */
export function getBareTermAlternatives(
  value: string,
  context: BareTermUpgradeContext,
): BareTermAlternative[] {
  const lower = value.toLowerCase()
  const result: BareTermAlternative[] = []
  for (const d of DOMAINS) {
    if (d.check(lower, context)) {
      result.push({
        label: `${d.field}:${value}`,
        explain: d.explain,
        docRef: d.docRef,
      })
    }
  }
  return result
}
