// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import type { JSX } from 'solid-js'
import type {
  DisplayColumns,
  PrintingDisplayColumns,
  Histograms,
  UniqueMode,
  BreakdownNode,
} from '@frantic-search/shared'
import type { ViewMode } from './view-mode'
import type { CardListStore } from './card-list-store'

export interface SearchContextValue {
  query: Accessor<string>
  setQuery: Setter<string>
  display: Accessor<DisplayColumns | null>
  histograms: Accessor<Histograms | null>
  histogramsExpanded: Accessor<boolean>
  toggleHistograms: () => void
  hasPrintingConditions: Accessor<boolean>
  printingDisplay: Accessor<PrintingDisplayColumns | null>
  uniqueMode: Accessor<UniqueMode>
  indicesIncludingExtras: Accessor<number | undefined>
  printingIndicesIncludingExtras: Accessor<number | undefined>
  /** Spec 131: Oracle "did you mean?" hint when zero results and trailing bare tokens. */
  oracleHint?: Accessor<{ query: string; label: string; count: number; printingCount?: number; variant: 'phrase' | 'per-word' } | undefined>
  viewMode: Accessor<ViewMode>
  changeViewMode: (mode: ViewMode) => void
  changeUniqueMode: (mode: UniqueMode) => void
  showOracleText: () => boolean
  facesOf: Accessor<Map<number, number[]>>
  visibleIndices: Accessor<number[]>
  visibleDisplayItems: Accessor<number[] | null>
  firstPrintingForCard: Accessor<Map<number, number>>
  dedupedPrintingItems: Accessor<number[] | null>
  finishGroupMap: Accessor<Map<string, { finish: number; price: number }[]>>
  aggregationCountForCard: (ci: number) => number | undefined
  aggregationCountForPrinting: (pi: number) => number | undefined
  totalCards: () => number
  totalPrintingItems: () => number
  totalDisplayItems: () => number
  hasMore: () => boolean
  batchSize: () => number
  visibleCount: Accessor<number>
  printingExpanded: () => boolean
  showPrintingResults: () => boolean
  scryfallUrl: () => string
  flushPendingCommit: () => void
  setVisibleCount: Setter<number>
  navigateToReport: () => void
  navigateToCard: (scryfallId: string) => void
  navigateToQuery?: (q: string) => void
  /** Navigate to My List page (?list). Spec 126 empty-list CTA. When absent, empty-list CTA not shown. */
  navigateToLists?: () => void
  /** True when default list has no instances (Spec 126). When absent, empty-list CTA not shown. */
  defaultListEmpty?: Accessor<boolean>
  appendTerm: (q: string, term: string, bd: BreakdownNode | null) => string
  parseBreakdown: (q: string) => BreakdownNode | null
  /** List add/remove (Spec 124). When absent, list controls are not rendered. */
  cardListStore?: CardListStore
  listVersion?: Accessor<number>
  /** Unique tags from deck list for MY LIST section (Spec 125). When absent, tag chips not shown. */
  deckTags?: Accessor<string[]>
  listCountForCard?: (ci: number) => number
  listCountForPrinting?: (pi: number, scryfallId?: string, finish?: string) => number
  paneId?: string
}

export const SearchContext = createContext<SearchContextValue | undefined>(undefined)

export function SearchProvider(props: {
  value: SearchContextValue
  children: JSX.Element
}) {
  return (
    <SearchContext.Provider value={props.value}>
      {props.children}
    </SearchContext.Provider>
  )
}

export function useSearchContext(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) {
    throw new Error('useSearchContext must be used within SearchProvider')
  }
  return ctx
}
