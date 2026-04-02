// SPDX-License-Identifier: Apache-2.0
import type { CardIndex, PrintingIndex, NodeCache } from '@frantic-search/shared'
import { NON_TOURNAMENT_MASK, EXTRAS_LAYOUT_SET, DEFAULT_OMIT_SET_CODES, CardFlag, parse } from '@frantic-search/shared'

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
 * Evaluate an alternative query, apply Spec 178 default inclusion filter when
 * !includeExtras, and return card and printing counts. Used by oracle hint and
 * wrong-field suggestion builders (Spec 131, Spec 153).
 */
export function evaluateAlternative(params: AlternativeEvalParams): AlternativeEvalResult {
  const { altQuery, cache, index, printingIndex, includeExtras, viewMode } = params
  const altEval = cache.evaluate(parse(altQuery))
  let altDeduped = Array.from(altEval.indices)
  let altPrintingIndices = altEval.printingIndices

  if (!includeExtras) {
    const { widenExtrasLayout, widenContentWarning, widenPlaytest, positiveSetPrefixes } = altEval

    const isSetWidened = (setCode: string): boolean => {
      for (let i = 0; i < positiveSetPrefixes.length; i++) {
        if (setCode.startsWith(positiveSetPrefixes[i])) return true
      }
      return false
    }

    if (altEval.hasPrintingConditions && altPrintingIndices && printingIndex) {
      const filtered: number[] = []
      for (let i = 0; i < altPrintingIndices.length; i++) {
        const p = altPrintingIndices[i]
        const cf = printingIndex.canonicalFaceRef[p]
        const setCode = printingIndex.setCodesLower[p]
        const setWide = isSetWidened(setCode)

        if (!setWide && !widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[cf])) continue
        if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue
        if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue
        if (!setWide && !widenContentWarning && (index.flags[cf] & CardFlag.ContentWarning) !== 0) continue
        if (!setWide && (printingIndex.printingFlags[p] & NON_TOURNAMENT_MASK) !== 0) continue

        filtered.push(p)
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
      altDeduped = altDeduped.filter((fi) => {
        if (!widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[fi])) return false
        if (!widenContentWarning && (index.flags[fi] & CardFlag.ContentWarning) !== 0) return false
        return true
      })
      if (altPrintingIndices && printingIndex) {
        const filtered: number[] = []
        for (let i = 0; i < altPrintingIndices.length; i++) {
          const p = altPrintingIndices[i]
          const cf = printingIndex.canonicalFaceRef[p]
          const setCode = printingIndex.setCodesLower[p]
          const setWide = isSetWidened(setCode)

          if (!setWide && !widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[cf])) continue
          if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue
          if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue
          if (!setWide && !widenContentWarning && (index.flags[cf] & CardFlag.ContentWarning) !== 0) continue
          if (!setWide && (printingIndex.printingFlags[p] & NON_TOURNAMENT_MASK) !== 0) continue

          filtered.push(p)
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
