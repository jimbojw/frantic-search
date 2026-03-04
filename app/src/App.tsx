// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, createMemo, Show, onCleanup } from 'solid-js'
import type { FromWorker, DisplayColumns, PrintingDisplayColumns, UniqueMode, BreakdownNode, Histograms } from '@frantic-search/shared'
import { parse, toScryfallQuery } from '@frantic-search/shared'
import SearchWorker from './worker?worker'
import SyntaxHelp from './SyntaxHelp'
import CardDetail from './CardDetail'
import BugReport from './BugReport'
import InlineBreakdown from './InlineBreakdown'
import PinnedBreakdown from './PinnedBreakdown'
import TermsDrawer from './TermsDrawer'
import QueryHighlight from './QueryHighlight'
import { SearchProvider } from './SearchContext'
import SearchResults from './SearchResults'
import type { ViewMode } from './view-mode'
import { BATCH_SIZES, isViewMode } from './view-mode'
import { dedupePrintingItems } from './dedup-printing-items'
import {
  buildFacesOf, buildScryfallIndex, buildPrintingScryfallIndex,
  buildPrintingScryfallGroupIndex,
  parseView,
} from './app-utils'
import type { View } from './app-utils'
import {
  saveScrollPosition, pushIfNeeded, scheduleDebouncedCommit,
  flushPendingCommit, cancelPendingCommit,
} from './history-debounce'
import { appendTerm, prependTerm, removeNode, parseBreakdown, sealQuery, clearViewTerms } from './query-edit'
import { extractViewMode } from './view-query'
import { reconstructQuery } from './InlineBreakdown'

declare const __REPO_URL__: string
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __THUMBS_FILENAME__: string

const HEADER_ART_BLUR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACAWGBwYFCAcGhwkIiAmMFA0MCwsMGJGSjpQdGZ6eHJmcG6AkLicgIiuim5woNqirr7EztDOfJri8uDI8LjKzsb/2wBDASIkJDAqMF40NF7GhHCExsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsb/wAARCAAYACADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAEDAv/EACEQAAICAQQCAwAAAAAAAAAAAAECABEDEhMhMUFhIjJR/8QAFgEBAQEAAAAAAAAAAAAAAAAAAgED/8QAFxEBAQEBAAAAAAAAAAAAAAAAAQACEf/aAAwDAQACEQMRAD8AxjUKTY9VXUGofYH1xK7QxqWZwx8yOVRQYZCwsCqkVGIDIhdttKgauO+jM5kBz6EHYHQjVWuwAteY8iH4kmzVWDDnT3lpoA7UymlJUDn3InKNKrxYu7hCLVlmQzNq45M0wORTuAjT+DsQhIBLS3//2Q=='

function App() {
  history.scrollRestoration = 'manual'

  const initialParams = new URLSearchParams(location.search)
  const [query, setQuery] = createSignal(initialParams.get('q') ?? '')
  const [view, setView] = createSignal<View>(parseView(initialParams))
  const [cardId, setCardId] = createSignal(initialParams.get('card') ?? '')
  const [headerArtLoaded, setHeaderArtLoaded] = createSignal(false)
  const [dataProgress, setDataProgress] = createSignal(0)
  const [workerStatus, setWorkerStatus] = createSignal<'loading' | 'ready' | 'error'>('loading')
  const [workerError, setWorkerError] = createSignal('')
  const [errorCause, setErrorCause] = createSignal<'stale' | 'network' | 'unknown'>('unknown')
  const [display, setDisplay] = createSignal<DisplayColumns | null>(null)
  const [indices, setIndices] = createSignal<Uint32Array>(new Uint32Array(0))
  const [pinnedQuery, setPinnedQuery] = createSignal(
    localStorage.getItem('frantic-pinned-query') ?? ''
  )
  createEffect(() => {
    const stored = localStorage.getItem('frantic-view-mode')
    if (!stored || !isViewMode(stored)) return
    const pq = pinnedQuery()
    if (extractViewMode(pq) !== 'slim') return
    setPinnedQuery(appendTerm(pq, `view:${stored}`, parseBreakdown(pq)))
    localStorage.removeItem('frantic-view-mode')
  })
  const [breakdown, setBreakdown] = createSignal<BreakdownNode | null>(null)
  const [histograms, setHistograms] = createSignal<Histograms | null>(null)
  const [printingDisplay, setPrintingDisplay] = createSignal<PrintingDisplayColumns | null>(null)
  const [printingIndices, setPrintingIndices] = createSignal<Uint32Array | undefined>(undefined)
  const [hasPrintingConditions, setHasPrintingConditions] = createSignal(false)
  const [uniqueMode, setUniqueMode] = createSignal<UniqueMode>('cards')
  const [indicesIncludingExtras, setIndicesIncludingExtras] = createSignal<number | undefined>(undefined)
  const [printingIndicesIncludingExtras, setPrintingIndicesIncludingExtras] = createSignal<number | undefined>(undefined)
  const [pinnedBreakdown, setPinnedBreakdown] = createSignal<BreakdownNode | null>(null)
  const [pinnedIndicesCount, setPinnedIndicesCount] = createSignal<number | undefined>(undefined)
  const [pinnedPrintingCount, setPinnedPrintingCount] = createSignal<number | undefined>(undefined)
  const [pinnedExpanded, setPinnedExpanded] = createSignal(
    localStorage.getItem('frantic-pinned-expanded') !== 'false'
  )
  function togglePinned() {
    setPinnedExpanded(prev => {
      const next = !prev
      localStorage.setItem('frantic-pinned-expanded', String(next))
      return next
    })
  }
  const [breakdownExpanded, setBreakdownExpanded] = createSignal(
    localStorage.getItem('frantic-breakdown-expanded') !== 'false'
  )
  function toggleBreakdown() {
    setBreakdownExpanded(prev => {
      const next = !prev
      localStorage.setItem('frantic-breakdown-expanded', String(next))
      return next
    })
  }
  const [histogramsExpanded, setHistogramsExpanded] = createSignal(
    localStorage.getItem('frantic-results-options-expanded') === 'true'
  )
  function toggleHistograms() {
    setHistogramsExpanded(prev => {
      const next = !prev
      localStorage.setItem('frantic-results-options-expanded', String(next))
      return next
    })
  }
  const [termsExpanded, setTermsExpanded] = createSignal(
    localStorage.getItem('frantic-terms-expanded') === 'true'
  )
  function toggleTerms() {
    setTermsExpanded(prev => {
      const next = !prev
      localStorage.setItem('frantic-terms-expanded', String(next))
      return next
    })
  }
  const [inputFocused, setInputFocused] = createSignal(false)
  const [userEngaged, setUserEngaged] = createSignal(false)
  let programmaticFocusInProgress = false
  let textareaRef: HTMLTextAreaElement | undefined
  let textareaHlRef: HTMLDivElement | undefined

  const effectiveQuery = createMemo(() => {
    const p = pinnedQuery().trim()
    const q = query().trim()
    if (!p) return q
    if (!q) return p
    return sealQuery(p) + ' ' + sealQuery(q)
  })
  const viewMode = createMemo(() => extractViewMode(effectiveQuery()))
  function changeViewMode(mode: ViewMode) {
    flushPendingCommit()
    const bd = parseBreakdown(query())
    const cleared = clearViewTerms(query(), bd)
    const p = pinnedQuery().trim()
    const q = cleared.trim()
    const effectiveAfter = !p ? q : !q ? p : sealQuery(p) + ' ' + sealQuery(q)
    if (extractViewMode(effectiveAfter) === mode) {
      setQuery(cleared)
    } else {
      setQuery(appendTerm(cleared, `view:${mode}`, parseBreakdown(cleared)))
    }
    setVisibleCount(BATCH_SIZES[mode])
  }
  const showOracleText = () => viewMode() === 'detail' || viewMode() === 'full'

  const facesOf = createMemo(() => {
    const d = display()
    return d ? buildFacesOf(d.canonical_face) : new Map<number, number[]>()
  })

  const scryfallIndex = createMemo(() => {
    const d = display()
    return d ? buildScryfallIndex(d.scryfall_ids, d.canonical_face) : new Map<string, number>()
  })

  const printingScryfallIndex = createMemo(() => {
    const pd = printingDisplay()
    return pd ? buildPrintingScryfallIndex(pd) : new Map<string, number>()
  })

  const printingScryfallGroupIndex = createMemo(() => {
    const pd = printingDisplay()
    return pd ? buildPrintingScryfallGroupIndex(pd) : new Map<string, number[]>()
  })

  const batchSize = () => BATCH_SIZES[viewMode()]
  const [visibleCount, setVisibleCount] = createSignal(BATCH_SIZES[viewMode()])

  createEffect(() => {
    indices()
    printingIndices()
    viewMode()
    setVisibleCount(batchSize())
  })

  const visibleIndices = createMemo(() => {
    const idx = indices()
    const len = Math.min(idx.length, visibleCount())
    const result: number[] = new Array(len)
    for (let i = 0; i < len; i++) result[i] = idx[i]
    return result
  })

  const showPrintingResults = () => {
    const pi = printingIndices()
    return pi !== undefined && pi.length > 0
  }

  const firstPrintingForCard = createMemo(() => {
    const pi = printingIndices()
    const pd = printingDisplay()
    if (!pi || !pd) return new Map<number, number>()
    const map = new Map<number, number>()
    for (const idx of pi) {
      const ci = pd.canonical_face_ref[idx]
      if (!map.has(ci)) map.set(ci, idx)
    }
    return map
  })

  const totalPrintingItems = () => {
    const pi = printingIndices()
    return pi ? pi.length : 0
  }

  const dedupedPrintingItems = createMemo(() => {
    const pi = printingIndices()
    const pd = printingDisplay()
    if (!pi || !pd) return null
    return dedupePrintingItems(
      Array.from(pi),
      (idx) => pd.canonical_face_ref[idx],
      uniqueMode(),
      pd.illustration_id_index ? (idx) => pd.illustration_id_index![idx] : undefined,
    )
  })

  const finishGroupMap = createMemo(() => {
    const pi = printingIndices()
    const pd = printingDisplay()
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

  const printingExpanded = () =>
    showPrintingResults() && (viewMode() === 'images' || viewMode() === 'full')

  const totalDisplayItems = () => {
    if (!printingExpanded()) return indices().length
    const d = dedupedPrintingItems()
    return d ? d.length : 0
  }

  const visibleDisplayItems = createMemo(() => {
    if (!printingExpanded()) return null
    const items = dedupedPrintingItems()
    if (!items) return null
    const len = Math.min(items.length, visibleCount())
    return items.slice(0, len)
  })

  const hasMore = () => totalDisplayItems() > visibleCount()

  const totalCards = () => indices().length

  const headerCollapsed = () =>
    query().trim() !== '' ||
    termsExpanded() ||
    (inputFocused() && userEngaged())
  const scryfallUrl = () => {
    const q = query().trim()
    if (!q) return ''
    const canonical = toScryfallQuery(parse(q))
    return canonical ? `https://scryfall.com/search?q=${encodeURIComponent(canonical)}` : ''
  }

  async function fetchThumbHashes(): Promise<void> {
    try {
      const url = new URL(__THUMBS_FILENAME__, location.href)
      const resp = await fetch(url)
      if (!resp.ok) return
      const data: { art_crop: string[]; card: string[] } = await resp.json()
      setDisplay(prev => prev ? {
        ...prev,
        art_crop_thumb_hashes: data.art_crop,
        card_thumb_hashes: data.card,
      } : prev)
    } catch {
      // Thumb hashes are optional; gracefully degrade to gradients.
    }
  }

  const worker = new SearchWorker()
  let latestQueryId = 0

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data
    switch (msg.type) {
      case 'status':
        if (msg.status === 'progress') {
          setDataProgress(msg.fraction)
        } else if (msg.status === 'printings-ready') {
          setPrintingDisplay(msg.printingDisplay)
        } else {
          setWorkerStatus(msg.status)
          if (msg.status === 'ready') {
            setDataProgress(1)
            setDisplay(msg.display)
            fetchThumbHashes()
          }
          if (msg.status === 'error') {
            setWorkerError(msg.error)
            setErrorCause(msg.cause)
          }
        }
        break
      case 'result':
        if (msg.queryId === latestQueryId) {
          setIndices(msg.indices)
          setBreakdown(msg.breakdown)
          setPinnedBreakdown(msg.pinnedBreakdown ?? null)
          setPinnedIndicesCount(msg.pinnedIndicesCount)
          setPinnedPrintingCount(msg.pinnedPrintingCount)
          setHistograms(msg.histograms)
          setPrintingIndices(msg.printingIndices)
          setHasPrintingConditions(msg.hasPrintingConditions)
          setUniqueMode(msg.uniqueMode)
          setIndicesIncludingExtras(msg.indicesIncludingExtras)
          setPrintingIndicesIncludingExtras(msg.printingIndicesIncludingExtras)
        }
        break
    }
  }

  createEffect(() => {
    const pq = pinnedQuery()
    if (pq) localStorage.setItem('frantic-pinned-query', pq)
    else localStorage.removeItem('frantic-pinned-query')
  })

  createEffect(() => {
    const q = query().trim()
    const pq = pinnedQuery().trim()
    if (workerStatus() === 'ready' && (q || pq)) {
      latestQueryId++
      worker.postMessage({
        type: 'search', queryId: latestQueryId, query: query(),
        pinnedQuery: pq || undefined,
      })
    }
    if (!q && !pq) {
      setIndices(new Uint32Array(0))
      setBreakdown(null)
      setPinnedBreakdown(null)
      setPinnedIndicesCount(undefined)
      setPinnedPrintingCount(undefined)
      setHistograms(null)
      setPrintingIndices(undefined)
      setHasPrintingConditions(false)
      setUniqueMode('cards')
      setIndicesIncludingExtras(undefined)
      setPrintingIndicesIncludingExtras(undefined)
    } else if (!q) {
      setIndices(new Uint32Array(0))
      setBreakdown(null)
      setHistograms(null)
      setPrintingIndices(undefined)
      setHasPrintingConditions(false)
      setUniqueMode('cards')
      setIndicesIncludingExtras(undefined)
      setPrintingIndicesIncludingExtras(undefined)
    }
  })

  createEffect(() => {
    const q = query().trim()
    if (view() !== 'search') return
    const params = new URLSearchParams(location.search)
    if (q) {
      params.set('q', query())
    } else {
      params.delete('q')
    }
    const url = params.toString() ? `?${params}` : location.pathname
    pushIfNeeded()
    history.replaceState(history.state, '', url)
    scheduleDebouncedCommit()
  })

  window.addEventListener('popstate', () => {
    cancelPendingCommit()

    const params = new URLSearchParams(location.search)
    setView(parseView(params))
    setQuery(params.get('q') ?? '')
    setCardId(params.get('card') ?? '')

    const scrollY = history.state?.scrollY ?? 0
    requestAnimationFrame(() => window.scrollTo(0, scrollY))
  })

  window.addEventListener('online', () => {
    if (workerStatus() === 'error' && errorCause() === 'network') {
      location.reload()
    }
  })

  function navigateToHelp() {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams(location.search)
    params.set('help', '')
    history.pushState(null, '', `?${params}`)
    setView('help')
    window.scrollTo(0, 0)
  }

  function navigateToQuery(q: string) {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const url = params.toString() ? `?${params}` : location.pathname
    history.pushState(null, '', url)
    setQuery(q)
    setView('search')
    window.scrollTo(0, 0)
  }

  function navigateToCard(scryfallId: string) {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams(location.search)
    params.delete('help')
    params.set('card', scryfallId)
    history.pushState(null, '', `?${params}`)
    setCardId(scryfallId)
    setView('card')
    window.scrollTo(0, 0)
  }

  function navigateToReport() {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams()
    const q = query().trim()
    if (q) params.set('q', q)
    params.set('report', '')
    history.pushState(null, '', `?${params}`)
    setView('report')
    window.scrollTo(0, 0)
  }

  function focusSearchInput(programmatic = false) {
    if (!textareaRef || workerStatus() === 'error') return
    if (programmatic) programmaticFocusInProgress = true
    textareaRef.focus()
  }

  const prefersFinePointer = () => matchMedia('(pointer: fine)').matches

  const slashKeyHandler = (e: KeyboardEvent) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    const target = e.target as Node
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    )
      return
    e.preventDefault()
    e.stopPropagation()
    if (view() !== 'search') navigateToQuery(query())
    queueMicrotask(focusSearchInput)
  }
  document.addEventListener('keydown', slashKeyHandler, true)
  onCleanup(() => document.removeEventListener('keydown', slashKeyHandler, true))

  createEffect(() => {
    if (view() !== 'search') return
    if (!prefersFinePointer()) return
    queueMicrotask(() => focusSearchInput(true))
  })

  function hardReload() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister()
        }
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }

  function navigateHome() {
    if (termsExpanded()) {
      setTermsExpanded(false)
      localStorage.setItem('frantic-terms-expanded', 'false')
      return
    }

    const isAtHome =
      view() === 'search' &&
      !query().trim() &&
      !cardId() &&
      !userEngaged()

    if (isAtHome) {
      history.replaceState(null, '', location.pathname)
      hardReload()
      return
    }

    // Not at home — soft reset to initial state
    cancelPendingCommit()
    saveScrollPosition()
    history.pushState(null, '', location.pathname)
    setQuery('')
    setView('search')
    setCardId('')
    setUserEngaged(false)
    window.scrollTo(0, 0)
  }

  function handlePin(nodeLabel: string) {
    const liveQ = query().trim()
    const pinnedQ = pinnedQuery()
    const bd = parseBreakdown(liveQ)
    if (!bd) return

    // Find the matching node and splice it out of the live query
    const newLive = findAndRemoveNode(liveQ, bd, nodeLabel)
    setQuery(newLive)

    // Append to pinned query
    const pinnedBd = parseBreakdown(pinnedQ)
    setPinnedQuery(appendTerm(pinnedQ, nodeLabel, pinnedBd))
  }

  function handleUnpin(nodeLabel: string) {
    const pinnedQ = pinnedQuery().trim()
    const liveQ = query()
    const bd = parseBreakdown(pinnedQ)
    if (!bd) return

    // Find the matching node and splice it out of the pinned query
    const newPinned = findAndRemoveNode(pinnedQ, bd, nodeLabel)
    setPinnedQuery(newPinned)

    // Prepend to live query
    const liveBd = parseBreakdown(liveQ)
    setQuery(prependTerm(liveQ, nodeLabel, liveBd))
  }

  function handlePinnedRemove(newPinnedQuery: string) {
    setPinnedQuery(newPinnedQuery)
  }

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

  const searchContextValue = {
    query,
    setQuery,
    display,
    histograms,
    histogramsExpanded,
    toggleHistograms,
    hasPrintingConditions,
    printingDisplay,
    uniqueMode,
    indicesIncludingExtras,
    printingIndicesIncludingExtras,
    viewMode,
    changeViewMode,
    showOracleText,
    facesOf,
    visibleIndices,
    visibleDisplayItems,
    firstPrintingForCard,
    dedupedPrintingItems,
    finishGroupMap,
    totalCards,
    totalPrintingItems,
    totalDisplayItems,
    hasMore,
    batchSize,
    visibleCount,
    printingExpanded,
    showPrintingResults,
    scryfallUrl,
    flushPendingCommit,
    setVisibleCount,
    navigateToReport,
    navigateToCard,
    appendTerm,
    parseBreakdown,
  }

  return (
    <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      <Show when={view() === 'help'}>
        <SyntaxHelp onSelectExample={navigateToQuery} />
      </Show>
      <Show when={view() === 'card'}>
        {(() => {
          const oracleCI = () => scryfallIndex().get(cardId())
          const printingPI = () => printingScryfallIndex().get(cardId())
          const printingPIs = () => printingScryfallGroupIndex().get(cardId())
          const resolvedCI = () => {
            const oci = oracleCI()
            if (oci !== undefined) return oci
            const pi = printingPI()
            const pd = printingDisplay()
            if (pi !== undefined && pd) return pd.canonical_face_ref[pi]
            return undefined
          }
          return (
            <CardDetail
              canonicalIndex={resolvedCI()}
              scryfallId={cardId()}
              display={display()}
              facesOf={facesOf()}
              printingIndices={printingPIs()}
              printingDisplay={printingDisplay()}
              onNavigateToQuery={navigateToQuery}
            />
          )
        })()}
      </Show>
      <Show when={view() === 'report'}>
        <BugReport
          query={query()}
          breakdown={breakdown()}
          resultCount={totalCards()}
          printingCount={
            hasPrintingConditions() || uniqueMode() !== 'cards'
              ? totalPrintingItems()
              : undefined
          }
        />
      </Show>
      <Show when={view() === 'search'}>
        <SearchProvider value={searchContextValue}>
      <header class={`mx-auto max-w-2xl px-4 transition-all duration-200 ease-out ${headerCollapsed() ? 'pt-[max(1rem,env(safe-area-inset-top))] pb-4' : 'pt-[max(4rem,env(safe-area-inset-top))] pb-8'}`}>
        <button
          type="button"
          onClick={() => navigateHome()}
          aria-label="Go to home"
          class={`w-full overflow-hidden shadow-md bg-cover block text-left border-0 p-0 cursor-pointer transition-all duration-200 ease-out hover:opacity-95 active:opacity-90 ${headerCollapsed() ? 'h-6 bg-[center_23%] rounded-xl mb-2' : 'h-14 bg-[center_20%] rounded-xl mb-4'}`}
          style={{ "background-image": `url(${HEADER_ART_BLUR})` }}
        >
          <img
            src="https://cards.scryfall.io/art_crop/front/1/9/1904db14-6df7-424f-afa5-e3dfab31300a.jpg?1764758766"
            alt="Frantic Search card art by Mitchell Malloy"
            onLoad={() => setHeaderArtLoaded(true)}
            class={`h-full w-full object-cover pointer-events-none ${headerCollapsed() ? 'object-[center_23%]' : 'object-[center_20%]'}`}
            style={{ opacity: headerArtLoaded() ? dataProgress() : 0, transition: 'opacity 100ms linear' }}
          />
        </button>
        <div class={`overflow-hidden transition-all duration-200 ease-out ${headerCollapsed() ? 'max-h-0 opacity-0' : 'max-h-80 opacity-100'}`}>
          <h1 class="text-3xl font-bold tracking-tight text-center mb-1">
            Frantic Search
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
            Instant MTG card search
          </p>
        </div>

        <div class="overflow-hidden rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
          <Show when={termsExpanded()}>
            <TermsDrawer
              query={query()}
              onSetQuery={(q) => { flushPendingCommit(); setQuery(q) }}
              onHelpClick={navigateToHelp}
              onClose={toggleTerms}
            />
          </Show>
          <div class={`relative bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 ${termsExpanded() ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}>
            <div class="absolute left-0 top-0 flex items-center pl-2.5 pr-1 py-3 text-gray-400 dark:text-gray-500 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <div class="grid overflow-hidden">
              <div ref={textareaHlRef} class="hl-layer overflow-hidden whitespace-pre-wrap break-words px-4 py-3 pl-11 pr-10">
                <QueryHighlight query={query()} class="text-base leading-normal whitespace-pre-wrap break-words" />
              </div>
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder='Search cards…'
                autocapitalize="none"
                autocomplete="off"
                autocorrect="off"
                spellcheck={false}
                value={query()}
                onInput={(e) => { setQuery(e.currentTarget.value); setUserEngaged(true); if (textareaHlRef) { textareaHlRef.scrollTop = e.currentTarget.scrollTop; textareaHlRef.scrollLeft = e.currentTarget.scrollLeft } }}
                onScroll={(e) => { if (textareaHlRef) { textareaHlRef.scrollTop = e.currentTarget.scrollTop; textareaHlRef.scrollLeft = e.currentTarget.scrollLeft } }}
                onFocus={(e) => { setInputFocused(true); if (!programmaticFocusInProgress) setUserEngaged(true); else programmaticFocusInProgress = false; e.preventDefault() }}
                onBlur={() => setInputFocused(false)}
                disabled={workerStatus() === 'error'}
                class="hl-input w-full bg-transparent px-4 py-3 pl-11 pr-10 text-base leading-normal font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all disabled:opacity-50 resize-y"
              />
            </div>
            <button
              type="button"
              onClick={toggleTerms}
              class={`absolute right-0 top-0 py-3 px-3 flex items-center justify-center transition-colors ${termsExpanded() ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
              aria-label="Toggle search filters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
              </svg>
            </button>
          </div>
          <Show when={pinnedBreakdown()}>
            {(pbd) => (
              <PinnedBreakdown
                breakdown={pbd()}
                cardCount={pinnedIndicesCount() ?? 0}
                printingCount={pinnedPrintingCount()}
                expanded={pinnedExpanded()}
                onToggle={togglePinned}
                onUnpin={(nodeLabel) => { flushPendingCommit(); handleUnpin(nodeLabel) }}
                onRemove={(q) => { flushPendingCommit(); handlePinnedRemove(q) }}
              />
            )}
          </Show>
          <Show when={query().trim() !== '' && breakdown()}>
            {(bd) => (
              <InlineBreakdown
                breakdown={bd()}
                cardCount={totalCards()}
                printingCount={showPrintingResults() ? totalPrintingItems() : undefined}
                expanded={breakdownExpanded()}
                onToggle={toggleBreakdown}
                onPin={(nodeLabel) => { flushPendingCommit(); handlePin(nodeLabel) }}
                onNodeRemove={(q) => { flushPendingCommit(); setQuery(q) }}
              />
            )}
          </Show>
        </div>
      </header>

      <main class="mx-auto max-w-2xl px-4">
        <Show when={workerStatus() === 'error'}>
          <div class="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-6 shadow-sm">
            <Show when={errorCause() === 'stale'} fallback={<>
              <p class="text-sm font-medium text-red-800 dark:text-red-200">Could not load card data</p>
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                {errorCause() === 'network'
                  ? 'Check your internet connection. The page will reload automatically when connectivity is restored.'
                  : workerError()}
              </p>
              <button
                type="button"
                onClick={() => location.reload()}
                class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 transition-colors"
              >
                Try again
              </button>
            </>}>
              <p class="text-sm font-medium text-red-800 dark:text-red-200">Card data is out of date</p>
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                A newer version of Frantic Search has been deployed. Reload to get the latest data.
              </p>
              <button
                type="button"
                onClick={() => hardReload()}
                class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 transition-colors"
              >
                Reload
              </button>
            </Show>
          </div>
        </Show>

        <Show when={workerStatus() === 'loading'}>
          <p class="text-center text-sm text-gray-400 dark:text-gray-600 pt-8">
            Loading card data…
          </p>
        </Show>

        <Show when={workerStatus() === 'ready' && display()}>
          <SearchResults />
        </Show>
      </main>
        </SearchProvider>
      </Show>
    </div>
  )
}

export default App
