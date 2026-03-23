// SPDX-License-Identifier: Apache-2.0
import type { CardIndex, PrintingIndex, NodeCache } from '@frantic-search/shared'
import { NON_TOURNAMENT_MASK, parse } from '@frantic-search/shared'

export type ViewMode = 'slim' | 'detail' | 'images' | 'full'

export type AlternativeEvalParams = {
  altQuery: string
  cache: NodeCache
  index: CardIndex
  printingIndex: PrintingIndex | null
  includeExtras: boolean
  viewMode: ViewMode
}

export type AlternativeEvalResult = {
  cardCount: number
  printingCount: number | undefined
}

/**
 * Evaluate an alternative query, apply playable filter when !includeExtras,
 * and return card and printing counts. Used by oracle hint and wrong-field
 * suggestion builders (Spec 131, Spec 153).
 */
export function evaluateAlternative(params: AlternativeEvalParams): AlternativeEvalResult {
  const { altQuery, cache, index, printingIndex, includeExtras, viewMode } = params
  const altEval = cache.evaluate(parse(altQuery))
  let altDeduped = Array.from(altEval.indices)
  let altPrintingIndices = altEval.printingIndices

  if (!includeExtras) {
    if (altEval.hasPrintingConditions && altPrintingIndices && printingIndex) {
      const filtered: number[] = []
      for (let i = 0; i < altPrintingIndices.length; i++) {
        const p = altPrintingIndices[i]
        if (
          !(printingIndex.printingFlags[p] & NON_TOURNAMENT_MASK) &&
          (index.legalitiesLegal[printingIndex.canonicalFaceRef[p]] |
            index.legalitiesRestricted[printingIndex.canonicalFaceRef[p]]) !== 0
        ) {
          filtered.push(p)
        }
      }
      const seen = new Set<number>()
      altDeduped = []
      for (let i = 0; i < filtered.length; i++) {
        const cf = printingIndex.canonicalFaceRef[filtered[i]]
        if (!seen.has(cf)) {
          seen.add(cf)
          altDeduped.push(cf)
        }
      }
      altPrintingIndices = new Uint32Array(filtered)
    } else {
      altDeduped = altDeduped.filter(
        (fi) => (index.legalitiesLegal[fi] | index.legalitiesRestricted[fi]) !== 0,
      )
      if (altPrintingIndices && printingIndex) {
        const filtered: number[] = []
        for (let i = 0; i < altPrintingIndices.length; i++) {
          const p = altPrintingIndices[i]
          if (
            !(printingIndex.printingFlags[p] & NON_TOURNAMENT_MASK) &&
            (index.legalitiesLegal[printingIndex.canonicalFaceRef[p]] |
              index.legalitiesRestricted[printingIndex.canonicalFaceRef[p]]) !== 0
          ) {
            filtered.push(p)
          }
        }
        altPrintingIndices = new Uint32Array(filtered)
      }
    }
  }

  const cardCount = altDeduped.length
  let printingCount: number | undefined
  if (altPrintingIndices && printingIndex && (viewMode === 'images' || viewMode === 'full')) {
    printingCount = altPrintingIndices.length
  } else if (printingIndex && altDeduped.length > 0) {
    let total = 0
    for (const fi of altDeduped) total += printingIndex.printingsOf(fi).length
    printingCount = total
  }

  return { cardCount, printingCount }
}
