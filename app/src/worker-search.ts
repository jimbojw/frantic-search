// SPDX-License-Identifier: Apache-2.0
import type { ToWorker, FromWorker, BreakdownNode, Histograms, SortDirective, OracleTagData, FlavorTagData, ArtistIndexData } from '@frantic-search/shared'
import { CardIndex, PrintingIndex, NodeCache, NON_TOURNAMENT_MASK, parse, seededSort, seededSortPrintings, collectBareWords, queryForSortSeed, getUniqueModeFromQuery, sortByField, sortPrintingDomain, reorderPrintingsByCardOrder, fnv1a, normalizeAlphanumeric } from '@frantic-search/shared'
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
    const result: SearchResult = {
      type: 'result', queryId: msg.queryId, indices,
      breakdown: { type: 'NOP', label: '', matchCount: 0 },
      pinnedBreakdown, effectiveBreakdown: pinnedBreakdown, histograms: emptyHistograms,
      pinnedIndicesCount: pinnedEval.indices.length,
      pinnedPrintingCount,
      hasPrintingConditions: pinnedEval.hasPrintingConditions,
      uniqueMode: pinnedEval.uniqueMode,
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
    flavorUnavailable = flavorUnavailable || pinnedEval.flavorUnavailable || false
    artistUnavailable = artistUnavailable || pinnedEval.artistUnavailable || false
    if (!liveSortBy) liveSortBy = pinnedEval.sortBy
  } else {
    deduped = Array.from(liveEval.indices)
  }

  // Default playable filter (Spec 057): exclude non-playable cards and
  // non-tournament printings unless include:extras is in the query.
  let indicesIncludingExtras: number | undefined
  let printingIndicesIncludingExtras: number | undefined

  if (!includeExtras) {
    if (hasPrintingConditions && rawPrintingIndices && printingIndex) {
      // Printing-derived path (Issue #58): filter printings first, then derive
      // deduped from them. Cards with no surviving printings are excluded.
      const preLen = rawPrintingIndices.length
      const filtered: number[] = []
      for (let i = 0; i < preLen; i++) {
        const p = rawPrintingIndices[i]
        if (
          !(printingIndex.printingFlags[p] & NON_TOURNAMENT_MASK) &&
          (index.legalitiesLegal[printingIndex.canonicalFaceRef[p]] |
            index.legalitiesRestricted[printingIndex.canonicalFaceRef[p]]) !== 0
        ) {
          filtered.push(p)
        }
      }
      if (filtered.length < preLen) {
        printingIndicesIncludingExtras = preLen
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
      // When derived is empty but unfiltered had results, populate indicesIncludingExtras for hint
      if (deduped.length === 0 && preLen > 0) {
        const unfilteredFaces = new Set<number>()
        for (let i = 0; i < preLen; i++) {
          unfilteredFaces.add(printingIndex.canonicalFaceRef[rawPrintingIndices[i]])
        }
        indicesIncludingExtras = unfilteredFaces.size
      }
      rawPrintingIndices = new Uint32Array(filtered)
    } else {
      // Card-only path: filter deduped by card playability; filter printings when present
      const preFaceCount = deduped.length
      deduped = deduped.filter(fi =>
        (index.legalitiesLegal[fi] | index.legalitiesRestricted[fi]) !== 0
      )
      if (deduped.length < preFaceCount) {
        indicesIncludingExtras = preFaceCount
      }

      if (rawPrintingIndices && printingIndex) {
        const preLen = rawPrintingIndices.length
        const filtered: number[] = []
        for (let i = 0; i < preLen; i++) {
          const p = rawPrintingIndices[i]
          if (
            !(printingIndex.printingFlags[p] & NON_TOURNAMENT_MASK) &&
            (index.legalitiesLegal[printingIndex.canonicalFaceRef[p]] |
              index.legalitiesRestricted[printingIndex.canonicalFaceRef[p]]) !== 0
          ) {
            filtered.push(p)
          }
        }
        if (filtered.length < preLen) {
          printingIndicesIncludingExtras = preLen
          rawPrintingIndices = new Uint32Array(filtered)
        }
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
    liveBd,
    totalCards,
    pinnedIndicesCount,
    includeExtras,
    indicesIncludingExtras,
    printingIndicesIncludingExtras,
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
    includeExtras,
    effectiveBreakdown,
    suggestions,
    ...(flavorUnavailable && { flavorUnavailable: true }),
    ...(artistUnavailable && { artistUnavailable: true }),
    ...(pinnedBreakdown && { pinnedBreakdown }),
    ...(pinnedIndicesCount !== undefined && { pinnedIndicesCount }),
    ...(pinnedPrintingCount !== undefined && { pinnedPrintingCount }),
  }
  return result
}
