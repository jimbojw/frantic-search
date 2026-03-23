// SPDX-License-Identifier: Apache-2.0
import type { ToWorker, FromWorker, BreakdownNode, QueryNodeResult, Histograms, SortDirective, OracleTagData, FlavorTagData, ArtistIndexData, Suggestion } from '@frantic-search/shared'
import { CardIndex, PrintingIndex, NodeCache, Color, NON_TOURNAMENT_MASK, parse, seededSort, seededSortPrintings, collectBareWords, queryForSortSeed, getUniqueModeFromQuery, sortByField, sortPrintingDomain, reorderPrintingsByCardOrder, fnv1a, normalizeAlphanumeric, getTrailingBareNodes } from '@frantic-search/shared'
import { combinePrintingIndices } from './combine-printing-indices'
import { sealQuery, hasMyInQuery, hasHashInQuery, parseBreakdown, appendTerm } from './query-edit'
import { spliceBareToOracle, getOracleLabel } from './oracle-hint-edit'

function leafLabel(qnr: QueryNodeResult): string {
  const n = qnr.node
  switch (n.type) {
    case 'FIELD':
      if (n.field.toLowerCase() === 'unique' && n.sourceText) return n.sourceText
      if (n.field.toLowerCase() === 'include' && n.sourceText) return n.sourceText
      return `${n.field}${n.operator}${n.sourceText ?? n.value}`
    case 'BARE': return n.value
    case 'EXACT': return `!"${n.value}"`
    case 'REGEX_FIELD': return `${n.field}${n.operator}/${n.pattern}/`
    case 'NOP': return '(no-op)'
    case 'NOT': return 'NOT'
    case 'AND': return 'AND'
    case 'OR': return 'OR'
  }
}

function isNotLeaf(qnr: QueryNodeResult): boolean {
  if (qnr.node.type !== 'NOT' || !qnr.children || qnr.children.length !== 1) return false
  const child = qnr.children[0]
  return !child.children || child.children.length === 0
}

function toBreakdown(qnr: QueryNodeResult): BreakdownNode {
  if (qnr.node.type === 'NOP') {
    return { type: 'NOP', label: '(no-op)', matchCount: -1 }
  }
  if (isNotLeaf(qnr)) {
    const childLabel = leafLabel(qnr.children![0])
    const node: BreakdownNode = { type: 'NOT', label: `-${childLabel}`, matchCount: qnr.matchCount }
    if (qnr.matchCountCards !== undefined) node.matchCountCards = qnr.matchCountCards
    if (qnr.matchCountPrints !== undefined) node.matchCountPrints = qnr.matchCountPrints
    if (qnr.error) node.error = qnr.error
    if (qnr.node.span) node.span = qnr.node.span
    return node
  }
  const node: BreakdownNode = { type: qnr.node.type, label: leafLabel(qnr), matchCount: qnr.matchCount }
  if (qnr.matchCountCards !== undefined) node.matchCountCards = qnr.matchCountCards
  if (qnr.matchCountPrints !== undefined) node.matchCountPrints = qnr.matchCountPrints
  if (qnr.error) node.error = qnr.error
  if (qnr.node.span) node.span = qnr.node.span
  if (qnr.node.type === 'FIELD' && qnr.node.valueSpan) node.valueSpan = qnr.node.valueSpan
  if (qnr.children) {
    node.children = qnr.children.map(toBreakdown)
  }
  return node
}

function popcount(v: number): number {
  v = (v & 0x55) + ((v >> 1) & 0x55)
  v = (v & 0x33) + ((v >> 2) & 0x33)
  return (v + (v >> 4)) & 0x0f
}

function computeHistograms(deduped: number[], index: CardIndex): Histograms {
  const colorIdentity = [0, 0, 0, 0, 0, 0, 0]
  const manaValue = [0, 0, 0, 0, 0, 0, 0, 0]
  const cardType = [0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 0; i < deduped.length; i++) {
    const idx = deduped[i]
    const ci = index.colorIdentity[idx]
    if (ci === 0) {
      colorIdentity[0]++
    } else {
      if (ci & Color.White) colorIdentity[1]++
      if (ci & Color.Blue) colorIdentity[2]++
      if (ci & Color.Black) colorIdentity[3]++
      if (ci & Color.Red) colorIdentity[4]++
      if (ci & Color.Green) colorIdentity[5]++
      if (popcount(ci) >= 2) colorIdentity[6]++
    }
    const mv = Math.floor(index.manaValue[idx])
    manaValue[Math.min(mv, 7)]++
    const tl = index.typeLinesLower[idx]
    if (tl.includes('legendary'))   cardType[0]++
    if (tl.includes('creature'))    cardType[1]++
    if (tl.includes('instant'))     cardType[2]++
    if (tl.includes('sorcery'))     cardType[3]++
    if (tl.includes('artifact'))    cardType[4]++
    if (tl.includes('enchantment')) cardType[5]++
    if (tl.includes('planeswalker'))cardType[6]++
    if (tl.includes('land'))        cardType[7]++
  }
  return { colorIdentity, manaValue, cardType }
}

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
}

export type SearchResult = Extract<FromWorker, { type: 'result' }>

export function runSearch(params: RunSearchParams): SearchResult {
  const { msg, cache, index, printingIndex, sessionSalt, tagData: _tagData } = params
  const hasPinned = !!msg.pinnedQuery?.trim()
  const hasLive = !!msg.query.trim()

  if (!hasLive && !hasPinned) {
    throw new Error('runSearch requires at least one of query or pinnedQuery')
  }

  const emptyHistograms: Histograms = {
    colorIdentity: [0, 0, 0, 0, 0, 0, 0],
    manaValue: [0, 0, 0, 0, 0, 0, 0, 0],
    cardType: [0, 0, 0, 0, 0, 0, 0, 0],
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

  // Spec 131: Oracle "Did you mean?" hint when zero results and trailing bare tokens
  let oracleSuggestion: Suggestion | null = null
  if (deduped.length === 0 && hasLive) {
    if (!(hasPinned && pinnedIndicesCount === 0)) {
      const root = ast.type === 'AND' || ast.type === 'BARE'
      if (root) {
        const trailing = getTrailingBareNodes(ast)
        if (trailing && trailing.length > 0) {
          const variants: Array<'phrase' | 'per-word'> =
            trailing.length === 1 && trailing[0].quoted ? ['phrase'] : ['phrase', 'per-word']
          let best: { query: string; label: string; count: number; printingCount?: number } | null = null
          for (const variant of variants) {
            const altLiveQuery = spliceBareToOracle(msg.query, trailing, variant)
            const altCombinedQuery = hasPinned
              ? sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(altLiveQuery)
              : altLiveQuery
            const altEval = cache.evaluate(parse(altCombinedQuery))
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
            if (cardCount > 0) {
              let printingCount: number | undefined
              if (altPrintingIndices && printingIndex && (msg.viewMode === 'images' || msg.viewMode === 'full')) {
                printingCount = altPrintingIndices.length
              } else if (printingIndex && altDeduped.length > 0) {
                let total = 0
                for (const fi of altDeduped) total += printingIndex.printingsOf(fi).length
                printingCount = total
              }
              const fullQuery = hasPinned
                ? sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(altLiveQuery)
                : altLiveQuery
              best = {
                query: fullQuery,
                label: getOracleLabel(trailing, variant),
                count: cardCount,
                printingCount,
              }
              if (variant === 'phrase') break
            }
          }
          if (best) {
            oracleSuggestion = {
              id: 'oracle',
              query: best.query,
              label: best.label,
              count: best.count,
              printingCount: best.printingCount,
              docRef: 'reference/fields/face/oracle',
              priority: 20,
              variant: 'rewrite',
            }
          }
        }
      }
    }
  }

  // Spec 151: Build unified suggestions array
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

  const suggestions: Suggestion[] = []

  // Empty-list (Spec 126): query references my:list/#, default list empty, zero results
  if (
    totalCards === 0 &&
    (hasMyInQuery(effectiveBd) || hasHashInQuery(effectiveBd)) &&
    defaultListEmpty
  ) {
    suggestions.push({
      id: 'empty-list',
      label: 'Import a deck',
      variant: 'cta',
      ctaAction: 'navigateToLists',
      priority: 0,
    })
  }

  // include:extras - empty state
  if (indicesIncludingExtras !== undefined && totalCards === 0) {
    const query = appendTerm(msg.query, 'include:extras', liveBd)
    const count = indicesIncludingExtras
    const printingCount = printingIndicesIncludingExtras
    suggestions.push({
      id: 'include-extras',
      query,
      label: 'include:extras',
      count,
      printingCount,
      docRef: 'reference/modifiers/include-extras',
      priority: 10,
      variant: 'rewrite',
    })
  }

  // include:extras - rider (totalCards > 0 and hidden playable-filtered results)
  const hiddenCards = indicesIncludingExtras !== undefined ? indicesIncludingExtras - totalCards : 0
  const hiddenPrintings =
    printingIndicesIncludingExtras !== undefined && printingIndices
      ? printingIndicesIncludingExtras - printingIndices.length
      : 0
  if (totalCards > 0 && (hiddenCards > 0 || hiddenPrintings > 0)) {
    const query = appendTerm(msg.query, 'include:extras', liveBd)
    const count = indicesIncludingExtras ?? totalCards
    const printingCount = printingIndicesIncludingExtras
    suggestions.push({
      id: 'include-extras',
      query,
      label: 'include:extras',
      count,
      printingCount,
      docRef: 'reference/modifiers/include-extras',
      priority: 10,
      variant: 'rewrite',
    })
  }

  // unique:prints - rider only
  if (
    uniqueMode !== 'prints' &&
    totalPrintingItems > 0 &&
    totalPrintingItems > totalDisplayItems
  ) {
    suggestions.push({
      id: 'unique-prints',
      query: appendTerm(msg.query, 'unique:prints', liveBd),
      label: 'unique:prints',
      docRef: 'reference/modifiers/unique',
      priority: 30,
      variant: 'rewrite',
    })
  }

  // Oracle hint - empty state only
  if (oracleSuggestion) {
    suggestions.push(oracleSuggestion)
  }

  // Sort: empty-state by priority; rider uses fixed order in SearchResults
  suggestions.sort((a, b) => a.priority - b.priority)

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
