// SPDX-License-Identifier: Apache-2.0
import { FORMAT_NAMES, GAME_NAMES, FRAME_NAMES, RARITY_NAMES } from './bits'
import { IS_KEYWORDS } from './search/eval-is'
import type { BareWordNode } from './search/ast'

export type BareTermUpgradeContext = {
  keywordLabels?: string[]
  typeLineWords?: Set<string>
  knownSetCodes?: Set<string>
  oracleTagLabels?: string[]
  illustrationTagLabels?: string[]
  artistLabels?: string[]
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

const MULTI_WORD_DOMAINS: Array<{
  field: string
  explain: string
  docRef: string
  check: (phrase: string, ctx: BareTermUpgradeContext) => boolean
}> = [
  {
    field: 'kw',
    explain: 'Use kw: for keyword abilities.',
    docRef: 'reference/fields/face/kw',
    check: (p, ctx) =>
      !!ctx.keywordLabels?.length &&
      new Set(ctx.keywordLabels.map((l) => l.toLowerCase())).has(p),
  },
  {
    field: 'a',
    explain: 'Use a: for artist name.',
    docRef: 'reference/fields/printing/artist',
    check: (p, ctx) =>
      !!ctx.artistLabels?.length &&
      new Set(ctx.artistLabels.map((l) => l.toLowerCase())).has(p),
  },
]

/**
 * For a multi-word phrase (joined from adjacent bare nodes), returns
 * alternatives for domains that support multi-word values: keyword and artist.
 */
export function getMultiWordAlternatives(
  phrase: string,
  context: BareTermUpgradeContext,
): BareTermAlternative[] {
  const lower = phrase.toLowerCase()
  const result: BareTermAlternative[] = []
  for (const d of MULTI_WORD_DOMAINS) {
    if (d.check(lower, context)) {
      result.push({
        label: `${d.field}:"${phrase}"`,
        explain: d.explain,
        docRef: d.docRef,
      })
    }
  }
  return result
}

/**
 * Find windows of 2..maxSize adjacent bare nodes. "Adjacent" means only
 * whitespace exists between consecutive nodes in the source query.
 * Returns arrays of node indices, largest windows first (so callers can
 * give precedence to longer matches).
 */
export function getAdjacentBareWindows(
  bareNodes: BareWordNode[],
  query: string,
  maxSize: number,
): number[][] {
  if (bareNodes.length < 2) return []

  const isAdjacentPair = (i: number, j: number): boolean => {
    const prev = bareNodes[i]
    const curr = bareNodes[j]
    if (!prev.span || !curr.span) return false
    const gap = query.slice(prev.span.end, curr.span.start)
    return gap.length > 0 && /^\s+$/.test(gap)
  }

  const windows: number[][] = []
  for (let size = Math.min(maxSize, bareNodes.length); size >= 2; size--) {
    for (let start = 0; start <= bareNodes.length - size; start++) {
      let allAdjacent = true
      for (let k = start; k < start + size - 1; k++) {
        if (!isAdjacentPair(k, k + 1)) {
          allAdjacent = false
          break
        }
      }
      if (allAdjacent) {
        const indices: number[] = []
        for (let k = start; k < start + size; k++) indices.push(k)
        windows.push(indices)
      }
    }
  }
  return windows
}
