// SPDX-License-Identifier: Apache-2.0
import type { ToWorker, FromWorker, BreakdownNode, Histograms, SortDirective, OracleTagData, FlavorTagData, ArtistIndexData } from '@frantic-search/shared'
import { CardIndex, PrintingIndex, NodeCache, EXTRAS_LAYOUT_SET, DEFAULT_OMIT_SET_CODES, CardFlag, PrintingFlag, parse, seededSort, seededSortPrintings, collectBareWords, queryForSortSeed, getUniqueModeFromQuery, sortByField, sortPrintingDomain, reorderPrintingsByCardOrder, fnv1a, normalizeAlphanumeric, astUsesFranticExtensionSyntax } from '@frantic-search/shared'
import { combinePrintingIndices } from './combine-printing-indices'
import { sealQuery, parseBreakdown } from './query-edit'
import { buildEmptyUrlLiveQuerySuggestions } from './worker-empty-url-suggestions'
import { buildSuggestions } from './worker-suggestions'
import { toBreakdown, computeHistograms } from './worker-breakdown'

export type RunSearchParams = {
  msg: Extract<ToWorker, { type: 'search' }>
  cache: NodeCache
  index: CardIndex
  printingIndex: PrintingIndex | null
  sessionSalt: number
  /** Tag data for otag:/atag:/flavor:/artist: (Spec 092, 141, 149). */
  tagData?: { oracle: OracleTagData | null; illustration: Map<string, Uint32Array> | null; flavor: FlavorTagData | null; artist: ArtistIndexData | null }
  /** Spec 151: For empty-list suggestion when query references my:list/# and default list is empty. */
  getListMask?: (listId: string) => { printingIndices?: Uint32Array } | null
  /** Spec 154: domain labels for bare-term-upgrade. */
  keywordLabels?: string[]
}

export type SearchResult = Extract<FromWorker, { type: 'result' }>

export function runSearch(params: RunSearchParams): SearchResult {
  const { msg, cache, index, printingIndex, sessionSalt, tagData, keywordLabels } = params
  const hasPinned = !!msg.pinnedQuery?.trim()
  const hasLive = !!msg.query.trim()
  const allowEmptyUrlLive =
    !!msg.emptyUrlLiveQuery && !msg.query.trim() && !msg.pinnedQuery?.trim()

  if (!hasLive && !hasPinned && !allowEmptyUrlLive) {
    throw new Error('runSearch requires at least one of query or pinnedQuery')
  }

  const emptyHistograms: Histograms = {
    colorIdentity: [0, 0, 0, 0, 0, 0, 0],
    manaValue: [0, 0, 0, 0, 0, 0, 0, 0],
    cardType: [0, 0, 0, 0, 0, 0, 0, 0],
  }

  const nopBreakdown: BreakdownNode = { type: 'NOP', label: '', matchCount: 0 }

  // Spec 155: URL has `q=` but no live or pinned text — starter suggestions only.
  if (allowEmptyUrlLive) {
    const indices = new Uint32Array(0)
    return {
      type: 'result',
      queryId: msg.queryId,
      indices,
      breakdown: nopBreakdown,
      effectiveBreakdown: nopBreakdown,
      histograms: emptyHistograms,
      hasPrintingConditions: false,
      uniqueMode: 'cards',
      usedExtension: false,
      suggestions: buildEmptyUrlLiveQuerySuggestions(sessionSalt),
    }
  }

  // Pinned-only: evaluate for breakdown counts, no results
  if (hasPinned && !hasLive) {
    const pinnedAst = parse(msg.pinnedQuery!)
    const pinnedEval = cache.evaluate(pinnedAst)
    const pinnedBreakdown = toBreakdown(pinnedEval.result)
    let pinnedPrintingCount: number | undefined = (pinnedEval.hasPrintingConditions || pinnedEval.uniqueMode !== "cards")
      ? (pinnedEval.printingIndices?.length ?? 0)
      : undefined
    if (pinnedPrintingCount === undefined && printingIndex && (msg.viewMode === 'images' || msg.viewMode === 'full')) {
      let count = 0
      for (let i = 0; i < pinnedEval.indices.length; i++) {
        count += printingIndex.printingsOf(pinnedEval.indices[i]).length
      }
      pinnedPrintingCount = count
    }
    const indices = new Uint32Array(0)
    const usedExtension = astUsesFranticExtensionSyntax(pinnedAst)
    const result: SearchResult = {
      type: 'result', queryId: msg.queryId, indices,
      breakdown: { type: 'NOP', label: '', matchCount: 0 },
      pinnedBreakdown, effectiveBreakdown: pinnedBreakdown, histograms: emptyHistograms,
      pinnedIndicesCount: pinnedEval.indices.length,
      pinnedPrintingCount,
      hasPrintingConditions: pinnedEval.hasPrintingConditions,
      uniqueMode: pinnedEval.uniqueMode,
      usedExtension,
      includeExtras: pinnedEval.includeExtras,
      suggestions: [],
      ...(pinnedEval.flavorUnavailable && { flavorUnavailable: true }),
      ...(pinnedEval.artistUnavailable && { artistUnavailable: true }),
    }
    return result
  }

  const ast = parse(msg.query)
  const liveEval = cache.evaluate(ast)
  const breakdown = toBreakdown(liveEval.result)

  let deduped: number[]
  let rawPrintingIndices = liveEval.printingIndices
  let hasPrintingConditions = liveEval.hasPrintingConditions
  let uniqueMode = liveEval.uniqueMode
  let includeExtras = liveEval.includeExtras
  let widenExtrasLayout = liveEval.widenExtrasLayout
  let widenContentWarning = liveEval.widenContentWarning
  let widenPlaytest = liveEval.widenPlaytest
  let widenOversized = liveEval.widenOversized
  let positiveSetPrefixes = liveEval.positiveSetPrefixes
  let flavorUnavailable = liveEval.flavorUnavailable
  let artistUnavailable = liveEval.artistUnavailable
  let liveSortBy = liveEval.sortBy
  let pinnedBreakdown: BreakdownNode | undefined
  let pinnedIndicesCount: number | undefined
  let pinnedPrintingCount: number | undefined

  if (hasPinned) {
    const pinnedAst = parse(msg.pinnedQuery!)
    const pinnedEval = cache.evaluate(pinnedAst)
    pinnedBreakdown = toBreakdown(pinnedEval.result)
    pinnedIndicesCount = pinnedEval.indices.length
    if (pinnedEval.hasPrintingConditions || pinnedEval.uniqueMode !== "cards") {
      pinnedPrintingCount = pinnedEval.printingIndices?.length ?? 0
    }
    if (pinnedPrintingCount === undefined && printingIndex && (msg.viewMode === 'images' || msg.viewMode === 'full')) {
      let count = 0
      for (let i = 0; i < pinnedEval.indices.length; i++) {
        count += printingIndex.printingsOf(pinnedEval.indices[i]).length
      }
      pinnedPrintingCount = count
    }

    const pinnedSet = new Set<number>(pinnedEval.indices)
    deduped = Array.from(liveEval.indices).filter(i => pinnedSet.has(i))

    if (printingIndex) {
      rawPrintingIndices = combinePrintingIndices(
        rawPrintingIndices, pinnedEval.printingIndices,
        deduped, printingIndex.canonicalFaceRef, printingIndex.printingCount,
      )
    }

    hasPrintingConditions = hasPrintingConditions || pinnedEval.hasPrintingConditions
    uniqueMode = getUniqueModeFromQuery(`${msg.pinnedQuery} ${msg.query}`)
    includeExtras = includeExtras || pinnedEval.includeExtras
    widenExtrasLayout = widenExtrasLayout || pinnedEval.widenExtrasLayout
    widenContentWarning = widenContentWarning || pinnedEval.widenContentWarning
    widenPlaytest = widenPlaytest || pinnedEval.widenPlaytest
    widenOversized = widenOversized || pinnedEval.widenOversized
    positiveSetPrefixes = positiveSetPrefixes.length > 0
      ? (pinnedEval.positiveSetPrefixes.length > 0
        ? [...positiveSetPrefixes, ...pinnedEval.positiveSetPrefixes]
        : positiveSetPrefixes)
      : pinnedEval.positiveSetPrefixes
    flavorUnavailable = flavorUnavailable || pinnedEval.flavorUnavailable || false
    artistUnavailable = artistUnavailable || pinnedEval.artistUnavailable || false
    if (!liveSortBy) liveSortBy = pinnedEval.sortBy
  } else {
    deduped = Array.from(liveEval.indices)
  }

  // Spec 178: Default inclusion filter — omission passes with wideners.
  let indicesBeforeDefaultFilter: number | undefined
  let printingIndicesBeforeDefaultFilter: number | undefined

  if (!includeExtras) {
    const isSetWidened = (setCode: string): boolean => {
      for (let i = 0; i < positiveSetPrefixes.length; i++) {
        if (setCode.startsWith(positiveSetPrefixes[i])) return true
      }
      return false
    }

    if (hasPrintingConditions && rawPrintingIndices && printingIndex) {
      // Printing-derived path (Issue #58): filter printings first, then derive
      // deduped from them. Cards with no surviving printings are excluded.
      const preLen = rawPrintingIndices.length
      const filtered: number[] = []
      for (let i = 0; i < preLen; i++) {
        const p = rawPrintingIndices[i]
        const cf = printingIndex.canonicalFaceRef[p]
        const setCode = printingIndex.setCodesLower[p]
        const setWide = isSetWidened(setCode)

        // Pass 1: Extras layouts
        if (!setWide && !widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[cf])) continue
        // Pass 2: Playtest promo type (column 1, bit 0)
        if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue
        // Pass 3: Wholesale omit sets
        if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue
        // Pass 4: Content-warning oracles
        if (!setWide && !widenContentWarning && (index.flags[cf] & CardFlag.ContentWarning) !== 0) continue
        // Pass 5: Oversized printings
        if (!setWide && !widenOversized && (printingIndex.printingFlags[p] & PrintingFlag.Oversized) !== 0) continue

        filtered.push(p)
      }
      if (filtered.length < preLen) {
        printingIndicesBeforeDefaultFilter = preLen
      }
      // Derive deduped from filtered printings (unique canonical faces, first-occurrence order)
      const seen = new Set<number>()
      const derived: number[] = []
      for (let i = 0; i < filtered.length; i++) {
        const cf = printingIndex.canonicalFaceRef[filtered[i]]
        if (!seen.has(cf)) {
          seen.add(cf)
          derived.push(cf)
        }
      }
      deduped = derived
      if (deduped.length === 0 && preLen > 0) {
        const unfilteredFaces = new Set<number>()
        for (let i = 0; i < preLen; i++) {
          unfilteredFaces.add(printingIndex.canonicalFaceRef[rawPrintingIndices[i]])
        }
        indicesBeforeDefaultFilter = unfilteredFaces.size
      }
      rawPrintingIndices = new Uint32Array(filtered)
    } else if (printingIndex) {
      // Card-only path with printing data: expand faces to printings and apply
      // all five passes. A face survives only if at least one printing survives.
      const preFaceCount = deduped.length
      const survivingFaces: number[] = []
      for (const fi of deduped) {
        if (!widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[fi])) continue
        if (!widenContentWarning && (index.flags[fi] & CardFlag.ContentWarning) !== 0) continue

        const printings = printingIndex.printingsOf(fi)
        let hasSurvivor = printings.length === 0
        for (const p of printings) {
          const setCode = printingIndex.setCodesLower[p]
          const setWide = isSetWidened(setCode)

          if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue
          if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue
          if (!setWide && !widenOversized && (printingIndex.printingFlags[p] & PrintingFlag.Oversized) !== 0) continue

          hasSurvivor = true
          break
        }
        if (hasSurvivor) survivingFaces.push(fi)
      }
      deduped = survivingFaces
      if (deduped.length < preFaceCount) {
        indicesBeforeDefaultFilter = preFaceCount
      }

      if (rawPrintingIndices) {
        const preLen = rawPrintingIndices.length
        const filtered: number[] = []
        for (let i = 0; i < preLen; i++) {
          const p = rawPrintingIndices[i]
          const cf = printingIndex.canonicalFaceRef[p]
          const setCode = printingIndex.setCodesLower[p]
          const setWide = isSetWidened(setCode)

          if (!setWide && !widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[cf])) continue
          if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue
          if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue
          if (!setWide && !widenContentWarning && (index.flags[cf] & CardFlag.ContentWarning) !== 0) continue
          if (!setWide && !widenOversized && (printingIndex.printingFlags[p] & PrintingFlag.Oversized) !== 0) continue

          filtered.push(p)
        }
        if (filtered.length < preLen) {
          printingIndicesBeforeDefaultFilter = preLen
          rawPrintingIndices = new Uint32Array(filtered)
        }
      }
    } else {
      // No printing data at all: face-level passes only.
      const preFaceCount = deduped.length
      deduped = deduped.filter(fi => {
        if (!widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[fi])) return false
        if (!widenContentWarning && (index.flags[fi] & CardFlag.ContentWarning) !== 0) return false
        return true
      })
      if (deduped.length < preFaceCount) {
        indicesBeforeDefaultFilter = preFaceCount
      }
    }
  }

  const combinedQuery = hasPinned ? `${msg.pinnedQuery} ${msg.query}` : msg.query
  const sortSeed = queryForSortSeed(combinedQuery)
  const seedHash = fnv1a(sortSeed) ^ sessionSalt
  const effectiveSortBy: SortDirective | null = liveSortBy ?? null

  let printingIndices = rawPrintingIndices

  // Spec 087: expand printings for card-level queries so aggregation counts can be shown
  if (!printingIndices && printingIndex && deduped.length > 0) {
    let total = 0
    for (const fi of deduped) total += printingIndex.printingsOf(fi).length
    const expanded = new Uint32Array(total)
    let k = 0
    for (const fi of deduped) {
      for (const p of printingIndex.printingsOf(fi)) expanded[k++] = p
    }
    printingIndices = expanded
  }

  if (effectiveSortBy && effectiveSortBy.isPrintingDomain && printingIndex) {
    // Printing-domain sort: ensure printing stream, sort within card groups,
    // then derive card order from sorted printings.
    if (!printingIndices) {
      // Expand all printings of matching cards for sorting
      let total = 0
      for (const fi of deduped) total += printingIndex.printingsOf(fi).length
      const expanded = new Uint32Array(total)
      let k = 0
      for (const fi of deduped) {
        for (const p of printingIndex.printingsOf(fi)) expanded[k++] = p
      }
      printingIndices = expanded
    }
    const { cardOrder, groupedPrintings } = sortPrintingDomain(
      deduped, printingIndices, effectiveSortBy, index, printingIndex, seedHash,
    )
    deduped.length = 0
    for (const cf of cardOrder) deduped.push(cf)
    printingIndices = groupedPrintings
  } else if (effectiveSortBy && !effectiveSortBy.isPrintingDomain) {
    // Face-domain sort
    sortByField(deduped, effectiveSortBy, index, seedHash)
    if (printingIndices && printingIndex) {
      printingIndices = reorderPrintingsByCardOrder(
        printingIndices,
        deduped,
        printingIndex.canonicalFaceRef,
      )
    }
  } else {
    // No sort directive: fall back to Spec 019 seeded ordering
    const bareWords = collectBareWords(ast)
      .map(w => normalizeAlphanumeric(w))
      .filter(w => w.length > 0)
    seededSort(deduped, sortSeed, index.combinedNamesNormalized, bareWords, sessionSalt)
    if (printingIndices && printingIndex) {
      seededSortPrintings(
        printingIndices, sortSeed,
        printingIndex.canonicalFaceRef,
        index.combinedNamesNormalized, bareWords, sessionSalt,
      )
    }
  }

  const histograms = computeHistograms(deduped, index)
  const indices = new Uint32Array(deduped)

  // Effective breakdown for bug report: when both pinned and live, evaluate
  // the combined query; otherwise use the single-query breakdown.
  let effectiveBreakdown: BreakdownNode
  if (hasPinned) {
    const effectiveQuery = sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(msg.query.trim())
    const effectiveAst = parse(effectiveQuery)
    const effectiveEval = cache.evaluate(effectiveAst)
    effectiveBreakdown = toBreakdown(effectiveEval.result)
  } else {
    effectiveBreakdown = breakdown
  }

  const totalCards = deduped.length
  const effectiveQuery = hasPinned
    ? sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(msg.query.trim())
    : msg.query
  const effectiveBd = parseBreakdown(effectiveQuery)
  const liveBd = parseBreakdown(msg.query)

  const getListMask = params.getListMask ?? (() => null)
  const defaultList = getListMask('default')
  const defaultListEmpty =
    !defaultList ||
    !defaultList.printingIndices ||
    defaultList.printingIndices.length === 0

  let totalPrintingItems = 0
  if (printingIndex && uniqueMode !== 'prints' && deduped.length > 0) {
    for (let i = 0; i < deduped.length; i++) {
      totalPrintingItems += printingIndex.printingsOf(deduped[i]).length
    }
  }
  const totalDisplayItems = uniqueMode === 'prints' && printingIndices
    ? printingIndices.length
    : totalCards

  const extensionAst = hasPinned
    ? parse(sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(msg.query.trim()))
    : ast
  const usedExtension = astUsesFranticExtensionSyntax(extensionAst)

  const suggestions = buildSuggestions({
    msg: { query: msg.query, pinnedQuery: msg.pinnedQuery, viewMode: msg.viewMode },
    ast,
    cache,
    index,
    printingIndex,
    hasPinned,
    hasLive,
    effectiveQuery,
    effectiveBd,
    evalEffectiveBreakdown: effectiveBreakdown,
    liveBd,
    totalCards,
    pinnedIndicesCount,
    includeExtras,
    indicesBeforeDefaultFilter,
    printingIndicesBeforeDefaultFilter,
    printingIndices,
    uniqueMode,
    totalPrintingItems,
    totalDisplayItems,
    defaultListEmpty,
    sealQuery,
    keywordLabels,
    oracleTagLabels: tagData?.oracle ? Object.keys(tagData.oracle) : [],
    illustrationTagLabels: tagData?.illustration ? Array.from(tagData.illustration.keys()) : [],
    artistLabels: tagData?.artist ? Object.keys(tagData.artist) : [],
  })

  const result: SearchResult = {
    type: 'result',
    queryId: msg.queryId,
    indices,
    breakdown,
    histograms,
    printingIndices,
    hasPrintingConditions,
    uniqueMode,
    usedExtension,
    includeExtras,
    effectiveBreakdown,
    suggestions,
    ...(flavorUnavailable && { flavorUnavailable: true }),
    ...(artistUnavailable && { artistUnavailable: true }),
    ...(pinnedBreakdown && { pinnedBreakdown }),
    ...(pinnedIndicesCount !== undefined && { pinnedIndicesCount }),
    ...(pinnedPrintingCount !== undefined && { pinnedPrintingCount }),
    ...(indicesBeforeDefaultFilter !== undefined && { indicesBeforeDefaultFilter }),
    ...(printingIndicesBeforeDefaultFilter !== undefined && { printingIndicesBeforeDefaultFilter }),
  }
  return result
}
