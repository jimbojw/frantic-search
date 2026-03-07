// SPDX-License-Identifier: Apache-2.0
import { createSignal, createMemo, Show, onMount, onCleanup } from 'solid-js'
import type { DisplayColumns, PrintingDisplayColumns, Histograms, UniqueMode, BreakdownNode } from '@frantic-search/shared'
import { toScryfallQuery, parse } from '@frantic-search/shared'
import { buildFacesOf } from './app-utils'
import { dedupePrintingItems, aggregationCounts } from './dedup-printing-items'
import { sealQuery } from './query-edit'
import { extractViewMode } from './view-query'
import type { ViewMode } from './view-mode'
import { BATCH_SIZES } from './view-mode'
import { SearchProvider } from './SearchContext'
import MenuDrawer from './MenuDrawer'
import QueryHighlight from './QueryHighlight'
import UnifiedBreakdown from './UnifiedBreakdown'
import SearchResults from './SearchResults'
import type { SearchContextValue } from './SearchContext'

const DUAL_WIELD_BREAKPOINT = 1024
const SPLIT_STORAGE_KEY = 'frantic-dual-wield-split'
const SPLIT_MIN = 0.25
const SPLIT_MAX = 0.75
const HANDLE_WIDTH = 8

function parseStoredSplit(): number {
  const stored = localStorage.getItem(SPLIT_STORAGE_KEY)
  if (stored === null) return 0.5
  const n = Number.parseFloat(stored)
  if (!Number.isFinite(n) || n < SPLIT_MIN || n > SPLIT_MAX) return 0.5
  return n
}

export function useViewportWide(breakpoint = DUAL_WIELD_BREAKPOINT) {
  const [wide, setWide] = createSignal(
    typeof window !== 'undefined' && window.matchMedia(`(min-width: ${breakpoint}px)`).matches
  )
  onMount(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    setWide(mq.matches)
    const handler = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  })
  return wide
}

export type PaneState = {
  query: () => string
  setQuery: (q: string | ((prev: string) => string)) => void
  pinnedQuery: () => string
  setPinnedQuery: (q: string | ((prev: string) => string)) => void
  indices: () => Uint32Array
  breakdown: () => BreakdownNode | null
  pinnedBreakdown: () => BreakdownNode | null
  effectiveBreakdown: () => BreakdownNode | null
  pinnedIndicesCount: () => number | undefined
  pinnedPrintingCount: () => number | undefined
  histograms: () => Histograms | null
  printingIndices: () => Uint32Array | undefined
  hasPrintingConditions: () => boolean
  uniqueMode: () => UniqueMode
  indicesIncludingExtras: () => number | undefined
  printingIndicesIncludingExtras: () => number | undefined
  display: () => DisplayColumns | null
  printingDisplay: () => PrintingDisplayColumns | null
  breakdownExpanded: () => boolean
  toggleBreakdown: () => void
  histogramsExpanded: () => boolean
  toggleHistograms: () => void
  visibleCount: () => number
  setVisibleCount: (n: number | ((prev: number) => number)) => void
  handlePin: (nodeLabel: string) => void
  handleUnpin: (nodeLabel: string) => void
  handlePinnedRemove: (q: string) => void
  flushPendingCommit: () => void
  changeViewMode: (mode: ViewMode) => void
  changeUniqueMode: (mode: UniqueMode) => void
  navigateToReport: () => void
  navigateToCard: (scryfallId: string) => void
  appendTerm: (q: string, term: string, bd: BreakdownNode | null) => string
  parseBreakdown: (q: string) => BreakdownNode | null
  /** When my:list is in query, list entry count per canonical face (Spec 097). */
  listEntryCountPerCard?: () => Map<number, number> | null
}

function buildPaneContext(state: PaneState): SearchContextValue {
  const effectiveQuery = () => {
    const p = state.pinnedQuery().trim()
    const q = state.query().trim()
    if (!p) return q
    if (!q) return p
    return sealQuery(p) + ' ' + sealQuery(q)
  }
  const viewMode = () => extractViewMode(effectiveQuery())
  const facesOf = createMemo(() => {
    const d = state.display()
    return d ? buildFacesOf(d.canonical_face) : new Map<number, number[]>()
  })
  const batchSize = () => BATCH_SIZES[viewMode()]
  const visibleIndices = createMemo(() => {
    const idx = state.indices()
    const len = Math.min(idx.length, state.visibleCount())
    const result: number[] = new Array(len)
    for (let i = 0; i < len; i++) result[i] = idx[i]
    return result
  })
  const showPrintingResults = () => {
    const pi = state.printingIndices()
    return pi !== undefined && pi.length > 0
  }
  const firstPrintingForCard = createMemo(() => {
    const pi = state.printingIndices()
    const pd = state.printingDisplay()
    if (!pi || !pd) return new Map<number, number>()
    const map = new Map<number, number>()
    for (const idx of pi) {
      const ci = pd.canonical_face_ref[idx]
      if (!map.has(ci)) map.set(ci, idx)
    }
    return map
  })
  const totalPrintingItems = () => {
    const pi = state.printingIndices()
    return pi ? pi.length : 0
  }
  const dedupedPrintingItems = createMemo(() => {
    const pi = state.printingIndices()
    const pd = state.printingDisplay()
    if (!pi || !pd) return null
    return dedupePrintingItems(
      Array.from(pi),
      (idx) => pd.canonical_face_ref[idx],
      state.uniqueMode(),
      pd.illustration_id_index ? (idx) => pd.illustration_id_index![idx] : undefined,
    )
  })
  const finishGroupMap = createMemo(() => {
    const pi = state.printingIndices()
    const pd = state.printingDisplay()
    if (!pi || !pd) return new Map<string, { finish: number; price: number }[]>()
    const map = new Map<string, { finish: number; price: number }[]>()
    for (const idx of pi) {
      const sid = pd.scryfall_ids[idx]
      let group = map.get(sid)
      if (!group) { group = []; map.set(sid, group) }
      group.push({ finish: pd.finish[idx], price: pd.price_usd[idx] })
    }
    return map
  })
  const aggregationCountMaps = createMemo(() => {
    const pi = state.printingIndices()
    const pd = state.printingDisplay()
    if (!pi || !pd) return { byCard: new Map<number, number>(), byPrinting: new Map<number, number>() }
    return aggregationCounts(
      Array.from(pi),
      (idx) => pd.canonical_face_ref[idx],
      state.uniqueMode(),
      pd.illustration_id_index ? (idx) => pd.illustration_id_index![idx] : undefined,
    )
  })
  const printingExpanded = () =>
    showPrintingResults() && (viewMode() === 'images' || viewMode() === 'full')
  const totalDisplayItems = () => {
    if (!printingExpanded()) return state.indices().length
    const d = dedupedPrintingItems()
    return d ? d.length : 0
  }
  const visibleDisplayItems = createMemo(() => {
    if (!printingExpanded()) return null
    const items = dedupedPrintingItems()
    if (!items) return null
    const len = Math.min(items.length, state.visibleCount())
    return items.slice(0, len)
  })
  const hasMore = () => totalDisplayItems() > state.visibleCount()
  const totalCards = () => state.indices().length
  const scryfallUrl = () => {
    const q = effectiveQuery().trim()
    if (!q) return ''
    const canonical = toScryfallQuery(parse(q))
    return canonical ? `https://scryfall.com/search?q=${encodeURIComponent(canonical)}` : ''
  }

  return {
    query: state.query,
    setQuery: state.setQuery,
    display: state.display,
    histograms: state.histograms,
    histogramsExpanded: state.histogramsExpanded,
    toggleHistograms: state.toggleHistograms,
    hasPrintingConditions: state.hasPrintingConditions,
    printingDisplay: state.printingDisplay,
    uniqueMode: state.uniqueMode,
    indicesIncludingExtras: state.indicesIncludingExtras,
    printingIndicesIncludingExtras: state.printingIndicesIncludingExtras,
    viewMode,
    changeViewMode: state.changeViewMode,
    changeUniqueMode: state.changeUniqueMode,
    showOracleText: () => viewMode() === 'detail' || viewMode() === 'full',
    facesOf,
    visibleIndices,
    visibleDisplayItems,
    firstPrintingForCard,
    dedupedPrintingItems,
    finishGroupMap,
    aggregationCountForCard: (ci: number) => {
      const listCount = state.listEntryCountPerCard?.()?.get(ci)
      if (listCount !== undefined) return listCount
      return aggregationCountMaps().byCard.get(ci)
    },
    aggregationCountForPrinting: (pi: number) => {
      const pd = state.printingDisplay()
      const cf = pd?.canonical_face_ref[pi]
      const listCount = cf !== undefined ? state.listEntryCountPerCard?.()?.get(cf) : undefined
      if (listCount !== undefined) return listCount
      return aggregationCountMaps().byPrinting.get(pi)
    },
    totalCards,
    totalPrintingItems,
    totalDisplayItems,
    hasMore,
    batchSize,
    visibleCount: state.visibleCount,
    printingExpanded,
    showPrintingResults,
    scryfallUrl,
    flushPendingCommit: state.flushPendingCommit,
    setVisibleCount: state.setVisibleCount,
    navigateToReport: state.navigateToReport,
    navigateToCard: state.navigateToCard,
    appendTerm: state.appendTerm,
    parseBreakdown: state.parseBreakdown,
  }
}

export function SearchPane(props: {
  state: PaneState
  setTextareaRef: (el: HTMLTextAreaElement) => void
  setTextareaHlRef: (el: HTMLDivElement) => void
  setUserEngaged: (v: boolean) => void
  onInput: (e: Event) => void
  onScroll: (e: Event) => void
  onFocus: (e: FocusEvent) => void
  onBlur: () => void
  workerStatus: () => 'loading' | 'ready' | 'error'
  class?: string
}) {
  const ctx = buildPaneContext(props.state)
  return (
    <SearchProvider value={ctx}>
      <div class={`flex flex-col min-h-0 ${props.class ?? ''}`}>
        <div class="overflow-hidden rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
          <div class="relative bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <div class="absolute left-0 top-0 flex items-center pl-2.5 pr-1 py-3 text-gray-400 dark:text-gray-500 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <div class="grid overflow-hidden">
              <div ref={props.setTextareaHlRef} class="hl-layer overflow-hidden whitespace-pre-wrap break-words px-4 py-3 pl-11 pr-4">
                <QueryHighlight query={props.state.query()} breakdown={props.state.breakdown()} class="text-base leading-normal whitespace-pre-wrap break-words" />
              </div>
              <textarea
                ref={props.setTextareaRef}
                rows={1}
                placeholder="Search cards…"
                autocapitalize="none"
                autocomplete="off"
                autocorrect="off"
                spellcheck={false}
                value={props.state.query()}
                onInput={props.onInput}
                onScroll={props.onScroll}
                onFocus={props.onFocus}
                onBlur={props.onBlur}
                disabled={props.workerStatus() === 'error'}
                class="hl-input w-full bg-transparent px-4 py-3 pl-11 pr-4 text-base leading-normal font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all disabled:opacity-50 resize-y"
              />
            </div>
          </div>
          <Show when={props.state.pinnedBreakdown() || (props.state.query().trim() !== '' && props.state.breakdown())}>
            <UnifiedBreakdown
              pinnedBreakdown={props.state.pinnedBreakdown()}
              pinnedCardCount={props.state.pinnedIndicesCount() ?? 0}
              pinnedPrintingCount={props.state.pinnedPrintingCount()}
              liveBreakdown={props.state.query().trim() !== '' ? props.state.breakdown() : null}
              liveCardCount={props.state.indices().length}
              livePrintingCount={(props.state.printingIndices()?.length ?? 0) > 0 ? props.state.printingIndices()!.length : undefined}
              expanded={props.state.breakdownExpanded()}
              onToggle={props.state.toggleBreakdown}
              onPin={(nodeLabel) => { props.state.flushPendingCommit(); props.state.handlePin(nodeLabel) }}
              onUnpin={(nodeLabel) => { props.state.flushPendingCommit(); props.state.handleUnpin(nodeLabel) }}
              onPinnedRemove={(q) => { props.state.flushPendingCommit(); props.state.handlePinnedRemove(q) }}
              onLiveRemove={(q) => { props.state.flushPendingCommit(); props.state.setQuery(q) }}
            />
          </Show>
        </div>
        <div class="flex-1 min-h-0 overflow-auto">
          <SearchResults />
        </div>
      </div>
    </SearchProvider>
  )
}

export function DualWieldLayout(props: {
  leftState: PaneState
  rightState: PaneState
  leftTextareaRef?: (el: HTMLTextAreaElement) => void
  leftTextareaHlRef?: (el: HTMLDivElement) => void
  rightTextareaRef?: (el: HTMLTextAreaElement) => void
  rightTextareaHlRef?: (el: HTMLDivElement) => void
  setUserEngaged: (v: boolean) => void
  workerStatus: () => 'loading' | 'ready' | 'error'
  navigateToHelp: () => void
  onNavigateHome: () => void
  onLeaveDualWield: () => void
}) {
  const [drawerOpen, setDrawerOpen] = createSignal<'left' | 'right' | null>(null)
  const [split, setSplit] = createSignal(parseStoredSplit())

  let leftHlRef: HTMLDivElement | undefined
  let rightHlRef: HTMLDivElement | undefined
  let gridRef: HTMLDivElement | undefined

  const onResizeStart = (e: MouseEvent) => {
    e.preventDefault()

    const onMove = (moveE: MouseEvent) => {
      if (!gridRef) return
      const rect = gridRef.getBoundingClientRect()
      const railWidth = 48
      const centerLeft = rect.left + railWidth
      const centerRight = rect.right - railWidth
      const centerWidth = centerRight - centerLeft - HANDLE_WIDTH
      if (centerWidth <= 0) return
      const leftPaneWidth = moveE.clientX - centerLeft
      let next = leftPaneWidth / centerWidth
      next = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, next))
      setSplit(next)
    }

    const onEnd = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem(SPLIT_STORAGE_KEY, String(split()))
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  onCleanup(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  const leftOnInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement
    props.leftState.setQuery(target.value)
    props.setUserEngaged(true)
  }
  const leftOnScroll = (e: Event) => {
    const target = e.target as HTMLTextAreaElement
    if (leftHlRef) { leftHlRef.scrollTop = target.scrollTop; leftHlRef.scrollLeft = target.scrollLeft }
  }
  const rightOnInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement
    props.rightState.setQuery(target.value)
    props.setUserEngaged(true)
  }
  const rightOnScroll = (e: Event) => {
    const target = e.target as HTMLTextAreaElement
    if (rightHlRef) { rightHlRef.scrollTop = target.scrollTop; rightHlRef.scrollLeft = target.scrollLeft }
  }

  return (
    <div
      ref={gridRef}
      class="grid min-h-dvh"
      style={{
        'grid-template-columns': `48px minmax(200px, ${split()}fr) ${HANDLE_WIDTH}px minmax(200px, ${1 - split()}fr) 48px`,
      }}
    >
      {/* Left rail */}
      <div class="flex flex-col items-center pt-4 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => (prev === 'left' ? null : 'left'))}
          class="flex h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Menu (left pane)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={props.onNavigateHome}
          class="mt-2 flex h-8 min-w-8 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Go to home"
          title="Frantic Search"
        >
          <img src="/pwa-192x192.png" alt="" class="size-6 rounded" />
        </button>
      </div>

      {/* Left pane */}
      <div class="min-w-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <SearchPane
          state={props.leftState}
          setTextareaRef={props.leftTextareaRef ?? ((_el: HTMLTextAreaElement) => {})}
          setTextareaHlRef={(el) => { leftHlRef = el; props.leftTextareaHlRef?.(el) }}
          setUserEngaged={props.setUserEngaged}
          onInput={leftOnInput}
          onScroll={leftOnScroll}
          onFocus={() => props.setUserEngaged(true)}
          onBlur={() => {}}
          workerStatus={props.workerStatus}
          class="flex-1 min-h-0"
        />
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        tabIndex={-1}
        onMouseDown={onResizeStart}
        class="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-col-resize group min-w-0"
      >
        <div class="w-1 h-12 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-400 dark:group-hover:bg-blue-500 transition-colors" />
      </div>

      {/* Right pane */}
      <div class="min-w-0 flex flex-col bg-gray-50 dark:bg-gray-950">
        <SearchPane
          state={props.rightState}
          setTextareaRef={props.rightTextareaRef ?? ((_el: HTMLTextAreaElement) => {})}
          setTextareaHlRef={(el) => { rightHlRef = el; props.rightTextareaHlRef?.(el) }}
          setUserEngaged={props.setUserEngaged}
          onInput={rightOnInput}
          onScroll={rightOnScroll}
          onFocus={() => props.setUserEngaged(true)}
          onBlur={() => {}}
          workerStatus={props.workerStatus}
          class="flex-1 min-h-0"
        />
      </div>

      {/* Right rail */}
      <div class="flex flex-col items-center pt-4 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => (prev === 'right' ? null : 'right'))}
          class="flex h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Menu (right pane)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={props.onLeaveDualWield}
          class="mt-2 flex h-8 min-w-8 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Leave split view"
          title="Leave split view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Left drawer */}
      <Show when={drawerOpen() === 'left'}>
        <div
          role="presentation"
          class="fixed inset-0 z-40 bg-black/30"
          onClick={() => setDrawerOpen(null)}
        />
        <aside
          class="fixed top-0 left-0 bottom-0 z-50 w-[min(100%,20rem)] overflow-hidden flex flex-col bg-white dark:bg-gray-900 shadow-xl"
          aria-label="Filters menu (left pane)"
        >
          <div class="flex flex-col flex-1 min-h-0 pt-[env(safe-area-inset-top)]">
            <SearchProvider value={buildPaneContext(props.leftState)}>
              <MenuDrawer
                query={props.leftState.query()}
                onSetQuery={(q) => { props.leftState.flushPendingCommit(); props.leftState.setQuery(q) }}
                onHelpClick={props.navigateToHelp}
                onReportClick={props.leftState.navigateToReport}
                onClose={() => setDrawerOpen(null)}
              />
            </SearchProvider>
          </div>
        </aside>
      </Show>

      {/* Right drawer */}
      <Show when={drawerOpen() === 'right'}>
        <div
          role="presentation"
          class="fixed inset-0 z-40 bg-black/30"
          onClick={() => setDrawerOpen(null)}
        />
        <aside
          class="fixed top-0 right-0 bottom-0 z-50 w-[min(100%,20rem)] overflow-hidden flex flex-col bg-white dark:bg-gray-900 shadow-xl"
          aria-label="Filters menu (right pane)"
        >
          <div class="flex flex-col flex-1 min-h-0 pt-[env(safe-area-inset-top)]">
            <SearchProvider value={buildPaneContext(props.rightState)}>
              <MenuDrawer
                query={props.rightState.query()}
                onSetQuery={(q) => { props.rightState.flushPendingCommit(); props.rightState.setQuery(q) }}
                onHelpClick={props.navigateToHelp}
                onReportClick={props.rightState.navigateToReport}
                onClose={() => setDrawerOpen(null)}
              />
            </SearchProvider>
          </div>
        </aside>
      </Show>
    </div>
  )
}
