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
  viewMode: Accessor<ViewMode>
  changeViewMode: (mode: ViewMode) => void
  showOracleText: () => boolean
  facesOf: Accessor<Map<number, number[]>>
  visibleIndices: Accessor<number[]>
  visibleDisplayItems: Accessor<number[] | null>
  firstPrintingForCard: Accessor<Map<number, number>>
  dedupedPrintingItems: Accessor<number[] | null>
  finishGroupMap: Accessor<Map<string, { finish: number; price: number }[]>>
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
  appendTerm: (q: string, term: string, bd: BreakdownNode | null) => string
  parseBreakdown: (q: string) => BreakdownNode | null
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
