// SPDX-License-Identifier: Apache-2.0
import type { Accessor, Setter } from 'solid-js'
import type {
  DisplayColumns,
  PrintingDisplayColumns,
  Histograms,
  UniqueMode,
  BreakdownNode,
  Suggestion,
} from '@frantic-search/shared'
import type { ViewMode } from './view-mode'
import { BATCH_SIZES } from './view-mode'
import {
  appendTerm,
  prependTerm,
  removeNode,
  parseBreakdown,
  sealQuery,
  clearViewTerms,
  setViewTerm,
  setUniqueTerm,
} from './query-edit'
import { extractViewMode } from './view-query'
import { reconstructQuery } from './InlineBreakdown'
import { captureUiInteracted } from './analytics'
import type { PaneState } from './DualWieldLayout'

function findAndRemoveNode(q: string, bd: BreakdownNode, nodeLabel: string): string {
  if (reconstructQuery(bd) === nodeLabel) {
    return removeNode(q, bd, bd)
  }
  if (bd.children) {
    for (const child of bd.children) {
      if (reconstructQuery(child) === nodeLabel) {
        return removeNode(q, child, bd)
      }
    }
  }
  return q
}

export interface CreatePaneStateOpts {
  query: Accessor<string>
  setQuery: Setter<string>
  pinnedQuery: Accessor<string>
  setPinnedQuery: Setter<string>
  indices: Accessor<Uint32Array>
  breakdown: Accessor<BreakdownNode | null>
  pinnedBreakdown: Accessor<BreakdownNode | null>
  effectiveBreakdown: Accessor<BreakdownNode | null>
  pinnedIndicesCount: Accessor<number | undefined>
  pinnedPrintingCount: Accessor<number | undefined>
  histograms: Accessor<Histograms | null>
  printingIndices: Accessor<Uint32Array | undefined>
  hasPrintingConditions: Accessor<boolean>
  uniqueMode: Accessor<UniqueMode>
  includeExtras: Accessor<boolean>
  usedExtension: Accessor<boolean>
  /** Spec 151: Unified suggestions (include:extras, oracle, empty-list, unique:prints). */
  suggestions: Accessor<Suggestion[]>
  /** Spec 175: pre-playable-filter counts from worker `result`. */
  indicesIncludingExtras: Accessor<number | undefined>
  printingIndicesIncludingExtras: Accessor<number | undefined>
  display: Accessor<DisplayColumns | null>
  printingDisplay: Accessor<PrintingDisplayColumns | null>
  oracleTagLabels: Accessor<string[]>
  illustrationTagLabels: Accessor<string[]>
  keywordLabels: Accessor<string[]>
  artistNames: Accessor<string[]>
  breakdownExpanded: Accessor<boolean>
  setBreakdownExpanded: Setter<boolean>
  histogramsExpanded: Accessor<boolean>
  setHistogramsExpanded: Setter<boolean>
  visibleCount: Accessor<number>
  setVisibleCount: Setter<number>
  flushPendingCommit: () => void
  navigateToReport: () => void
  navigateToCard: (scryfallId: string) => void
  navigateToQuery?: (q: string) => void
  /** Navigate to docs (Spec 133). */
  navigateToDocs?: (docParam?: string) => void
  /** Navigate to Lists page (Spec 126). */
  navigateToLists?: () => void
  /** When my:list is in query, list entry count per canonical face (Spec 087). */
  listEntryCountPerCard?: () => Map<number, number> | null
}

export function createPaneState(opts: CreatePaneStateOpts): PaneState {
  const handlePin = (nodeLabel: string) => {
    const liveQ = opts.query().trim()
    const pinnedQ = opts.pinnedQuery()
    const bd = parseBreakdown(liveQ)
    if (!bd) return
    const newLive = findAndRemoveNode(liveQ, bd, nodeLabel)
    opts.setQuery(newLive)
    const pinnedBd = parseBreakdown(pinnedQ)
    opts.setPinnedQuery(appendTerm(pinnedQ, nodeLabel, pinnedBd))
  }

  const handleUnpin = (nodeLabel: string) => {
    const pinnedQ = opts.pinnedQuery().trim()
    const liveQ = opts.query()
    const bd = parseBreakdown(pinnedQ)
    if (!bd) return
    const newPinned = findAndRemoveNode(pinnedQ, bd, nodeLabel)
    opts.setPinnedQuery(newPinned)
    const liveBd = parseBreakdown(liveQ)
    opts.setQuery(prependTerm(liveQ, nodeLabel, liveBd))
  }

  const handlePinnedRemove = (newPinnedQuery: string) => {
    opts.setPinnedQuery(newPinnedQuery)
  }

  const toggleBreakdown = () => {
    opts.setBreakdownExpanded((prev) => {
      const next = !prev
      localStorage.setItem('frantic-breakdown-expanded', String(next))
      captureUiInteracted({ element_name: 'breakdown', action: 'toggled', state: next ? 'expanded' : 'collapsed' })
      return next
    })
  }

  const toggleHistograms = () => {
    opts.setHistogramsExpanded((prev) => {
      const next = !prev
      localStorage.setItem('frantic-results-options-expanded', String(next))
      captureUiInteracted({ element_name: 'histograms', action: 'toggled', state: next ? 'expanded' : 'collapsed' })
      return next
    })
  }

  const changeViewMode = (mode: ViewMode) => {
    opts.flushPendingCommit()
    const bd = parseBreakdown(opts.query())
    const cleared = clearViewTerms(opts.query(), bd)
    const p = opts.pinnedQuery().trim()
    const q = cleared.trim()
    const effectiveAfter = !p ? q : !q ? p : sealQuery(p) + ' ' + sealQuery(q)
    if (extractViewMode(effectiveAfter) === mode) {
      opts.setQuery(cleared)
    } else {
      opts.setQuery(setViewTerm(cleared, parseBreakdown(cleared), mode))
    }
    opts.setVisibleCount(BATCH_SIZES[mode])
  }

  const changeUniqueMode = (mode: UniqueMode) => {
    opts.flushPendingCommit()
    const bd = parseBreakdown(opts.query())
    opts.setQuery(setUniqueTerm(opts.query(), bd, opts.pinnedQuery(), mode))
  }

  return {
    query: opts.query,
    setQuery: opts.setQuery,
    pinnedQuery: opts.pinnedQuery,
    setPinnedQuery: opts.setPinnedQuery,
    indices: opts.indices,
    breakdown: opts.breakdown,
    pinnedBreakdown: opts.pinnedBreakdown,
    effectiveBreakdown: opts.effectiveBreakdown,
    pinnedIndicesCount: opts.pinnedIndicesCount,
    pinnedPrintingCount: opts.pinnedPrintingCount,
    histograms: opts.histograms,
    printingIndices: opts.printingIndices,
    hasPrintingConditions: opts.hasPrintingConditions,
    uniqueMode: opts.uniqueMode,
    includeExtras: opts.includeExtras,
    usedExtension: opts.usedExtension,
    suggestions: opts.suggestions,
    indicesIncludingExtras: opts.indicesIncludingExtras,
    printingIndicesIncludingExtras: opts.printingIndicesIncludingExtras,
    display: opts.display,
    printingDisplay: opts.printingDisplay,
    oracleTagLabels: opts.oracleTagLabels,
    illustrationTagLabels: opts.illustrationTagLabels,
    keywordLabels: opts.keywordLabels,
    artistNames: opts.artistNames,
    breakdownExpanded: opts.breakdownExpanded,
    toggleBreakdown,
    histogramsExpanded: opts.histogramsExpanded,
    toggleHistograms,
    visibleCount: opts.visibleCount,
    setVisibleCount: opts.setVisibleCount,
    handlePin,
    handleUnpin,
    handlePinnedRemove,
    flushPendingCommit: opts.flushPendingCommit,
    changeViewMode,
    changeUniqueMode,
    navigateToReport: opts.navigateToReport,
    navigateToCard: opts.navigateToCard,
    navigateToQuery: opts.navigateToQuery,
    navigateToDocs: opts.navigateToDocs,
    navigateToLists: opts.navigateToLists,
    appendTerm,
    parseBreakdown,
    listEntryCountPerCard: opts.listEntryCountPerCard ?? (() => null),
  }
}
