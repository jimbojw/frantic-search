// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, createMemo, For, Show, onCleanup } from 'solid-js'
import type { FromWorker, DisplayColumns, PrintingDisplayColumns, BreakdownNode, Histograms } from '@frantic-search/shared'
import { Finish } from '@frantic-search/shared'
import SearchWorker from './worker?worker'
import SyntaxHelp from './SyntaxHelp'
import CardDetail from './CardDetail'
import BugReport from './BugReport'
import InlineBreakdown from './InlineBreakdown'
import ResultsBreakdown, { MV_BAR_COLOR, TYPE_BAR_COLOR } from './ResultsBreakdown'
import SparkBars from './SparkBars'
import { CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS } from './color-identity'
import TermsDrawer from './TermsDrawer'
import ArtCrop from './ArtCrop'
import CopyButton from './CopyButton'
import CardImage from './CardImage'
import ViewModeToggle from './ViewModeToggle'
import CardFaceRow from './CardFaceRow'
import type { ViewMode } from './view-mode'
import { BATCH_SIZES, isViewMode } from './view-mode'
import {
  buildFacesOf, buildScryfallIndex, buildPrintingScryfallIndex,
  buildPrintingScryfallGroupIndex,
  RARITY_LABELS, FINISH_LABELS, formatPrice, fullCardName, parseView,
} from './app-utils'
import type { View } from './app-utils'
import {
  saveScrollPosition, pushIfNeeded, scheduleDebouncedCommit,
  flushPendingCommit, cancelPendingCommit,
} from './history-debounce'

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
  const storedMode = localStorage.getItem('frantic-view-mode')
  const [viewMode, setViewMode] = createSignal<ViewMode>(
    storedMode && isViewMode(storedMode) ? storedMode : 'slim'
  )
  function changeViewMode(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('frantic-view-mode', mode)
    setVisibleCount(BATCH_SIZES[mode])
  }
  const showOracleText = () => viewMode() === 'detail' || viewMode() === 'full'
  const [breakdown, setBreakdown] = createSignal<BreakdownNode | null>(null)
  const [histograms, setHistograms] = createSignal<Histograms | null>(null)
  const [printingDisplay, setPrintingDisplay] = createSignal<PrintingDisplayColumns | null>(null)
  const [printingIndices, setPrintingIndices] = createSignal<Uint32Array | undefined>(undefined)
  const [hasPrintingConditions, setHasPrintingConditions] = createSignal(false)
  const [uniquePrints, setUniquePrints] = createSignal(false)
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
  const [hasEverFocused, setHasEverFocused] = createSignal(false)
  const [textareaMode, setTextareaMode] = createSignal(false)
  let inputRef: HTMLInputElement | undefined
  let textareaRef: HTMLTextAreaElement | undefined

  function toggleTextareaMode() {
    const current = textareaMode() ? textareaRef : inputRef
    const selStart = current?.selectionStart ?? 0
    const selEnd = current?.selectionEnd ?? 0
    setTextareaMode(prev => !prev)
    queueMicrotask(() => {
      const next = textareaMode() ? textareaRef : inputRef
      if (next) {
        next.focus()
        next.setSelectionRange(selStart, selEnd)
      }
    })
  }

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
    if (uniquePrints()) return Array.from(pi)
    const seen = new Set<string>()
    const result: number[] = []
    for (const idx of pi) {
      const sid = pd.scryfall_ids[idx]
      if (!seen.has(sid)) {
        seen.add(sid)
        result.push(idx)
      }
    }
    return result
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

  const headerCollapsed = () => inputFocused() || query().trim() !== '' || hasEverFocused() || termsExpanded()
  const scryfallUrl = () => `https://scryfall.com/search?q=${encodeURIComponent(query().trim())}`

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
          setHistograms(msg.histograms)
          setPrintingIndices(msg.printingIndices)
          setHasPrintingConditions(msg.hasPrintingConditions)
          setUniquePrints(msg.uniquePrints)
        }
        break
    }
  }

  createEffect(() => {
    const q = query().trim()
    if (workerStatus() === 'ready' && q) {
      latestQueryId++
      worker.postMessage({ type: 'search', queryId: latestQueryId, query: query() })
    } else if (!q) {
      setIndices(new Uint32Array(0))
      setBreakdown(null)
      setHistograms(null)
      setPrintingIndices(undefined)
      setHasPrintingConditions(false)
      setUniquePrints(false)
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
      !hasEverFocused()

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
    setHasEverFocused(false)
    window.scrollTo(0, 0)
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
            />
          )
        })()}
      </Show>
      <Show when={view() === 'report'}>
        <BugReport query={query()} breakdown={breakdown()} resultCount={totalCards()} />
      </Show>
      <Show when={view() === 'search'}>
      <header class={`mx-auto max-w-2xl px-4 transition-all duration-200 ease-out ${headerCollapsed() ? 'pt-[max(1rem,env(safe-area-inset-top))] pb-4' : 'pt-[max(4rem,env(safe-area-inset-top))] pb-8'}`}>
        <button
          type="button"
          onClick={() => navigateHome()}
          aria-label="Go to home"
          class={`w-full overflow-hidden shadow-md bg-cover block text-left border-0 p-0 cursor-pointer transition-all duration-200 ease-out hover:opacity-95 active:opacity-90 ${headerCollapsed() ? 'h-4 bg-[center_23%] rounded-t-xl rounded-b-none mb-0' : 'h-14 bg-[center_20%] rounded-xl mb-4'}`}
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

        <div class={`overflow-hidden border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 ${headerCollapsed() ? 'rounded-b-xl rounded-t-none' : 'rounded-xl'}`}>
          <Show when={termsExpanded()}>
            <TermsDrawer
              query={query()}
              onSetQuery={(q) => { flushPendingCommit(); setQuery(q) }}
              onHelpClick={navigateToHelp}
              onClose={toggleTerms}
            />
          </Show>
          <div class={`relative ${termsExpanded() ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}>
            <Show when={textareaMode()} fallback={
              <input
                ref={inputRef}
                type="text"
                placeholder='Search cards… e.g. "t:creature c:green"'
                autocapitalize="none"
                autocomplete="off"
                autocorrect="off"
                spellcheck={false}
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                onFocus={(e) => { setInputFocused(true); setHasEverFocused(true); e.preventDefault() }}
                onBlur={() => setInputFocused(false)}
                disabled={workerStatus() === 'error'}
                class="w-full bg-transparent px-4 py-3 pl-14 pr-10 text-base placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all disabled:opacity-50"
              />
            }>
              <textarea
                ref={textareaRef}
                rows="3"
                placeholder='Search cards… e.g. "t:creature c:green"'
                autocapitalize="none"
                autocomplete="off"
                autocorrect="off"
                spellcheck={false}
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                onFocus={(e) => { setInputFocused(true); setHasEverFocused(true); e.preventDefault() }}
                onBlur={() => setInputFocused(false)}
                disabled={workerStatus() === 'error'}
                class="w-full bg-transparent px-4 py-3 pl-14 pr-10 text-base placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all disabled:opacity-50 resize-y"
              />
            </Show>
            <button
              type="button"
              onClick={toggleTextareaMode}
              class="absolute left-0 top-0 flex items-center gap-0.5 pl-2.5 pr-1 py-3 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Toggle multi-line editor"
              aria-expanded={textareaMode()}
            >
              <svg class={`size-2.5 fill-current transition-transform ${textareaMode() ? 'rotate-90' : ''}`} viewBox="0 0 24 24">
                <path d="M8 5l8 7-8 7z" />
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={toggleTerms}
              class={`absolute right-0 top-0 ${textareaMode() ? 'py-3' : 'bottom-0'} px-3 flex items-center justify-center transition-colors ${termsExpanded() ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
              aria-label="Toggle search filters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
              </svg>
            </button>
          </div>
          <Show when={breakdown()}>
            {(bd) => (
              <InlineBreakdown
                breakdown={bd()}
                cardCount={totalCards()}
                printingCount={showPrintingResults() ? totalPrintingItems() : undefined}
                expanded={breakdownExpanded()}
                onToggle={toggleBreakdown}
                onNodeClick={(q) => { flushPendingCommit(); setQuery(q) }}
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
          {(d) => (<>
            <Show when={query().trim()} fallback={
              <div class="pt-4 text-center">
                <p class="text-sm text-gray-400 dark:text-gray-600">
                  Type a query to search
                </p>
                <p class="mt-3 text-xs">
                  <a
                    href={__REPO_URL__}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                  >
                    <svg class="size-4" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    Source on GitHub
                  </a>
                </p>
                <p class="mt-1 text-[10px] font-mono text-gray-400 dark:text-gray-600">
                  {__APP_VERSION__} · {new Date(__BUILD_TIME__).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
            }>
                <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                  <Show when={histograms()}>
                    {(h) => (<>
                      <div
                        onClick={() => toggleHistograms()}
                        class="relative px-3 py-1 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <svg class={`absolute left-3 top-1/2 -translate-y-1/2 size-2.5 fill-current text-gray-500 dark:text-gray-400 transition-transform duration-150 ${histogramsExpanded() ? 'rotate-90' : ''}`} viewBox="0 0 24 24">
                          <path d="M8 5l8 7-8 7z" />
                        </svg>
                        <Show when={histogramsExpanded()} fallback={
                          <div class="grid grid-cols-3 gap-4">
                            <div class="flex items-center gap-1 min-w-0 pl-4">
                              <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500 shrink-0 w-[3em] text-right">mv:</span>
                              <SparkBars counts={h().manaValue} colors={MV_BAR_COLOR} />
                            </div>
                            <div class="flex items-center gap-1 min-w-0">
                              <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500 shrink-0 w-[3em] text-right">ci:</span>
                              <SparkBars counts={h().colorIdentity} colors={[CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS[31]]} />
                            </div>
                            <div class="flex items-center gap-1 min-w-0">
                              <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500 shrink-0 w-[3em] text-right">t:</span>
                              <SparkBars counts={h().cardType} colors={TYPE_BAR_COLOR} />
                            </div>
                          </div>
                        }>
                          <div class="grid grid-cols-3 gap-4">
                            <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 pl-[1.5em]">Mana Value</p>
                            <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 pl-[1.5em]">Color Identity</p>
                            <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 pl-[1.5em]">Card Type</p>
                          </div>
                        </Show>
                      </div>
                      <div
                        class="grid transition-[grid-template-rows] duration-150 ease-out"
                        style={{ 'grid-template-rows': histogramsExpanded() ? '1fr' : '0fr' }}
                      >
                        <div class="overflow-hidden">
                          <ResultsBreakdown
                            histograms={h()}
                            query={query()}
                            onSetQuery={(q) => { flushPendingCommit(); setQuery(q) }}
                          />
                        </div>
                      </div>
                    </>)}
                  </Show>
                  <div class="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 px-3 py-2 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center gap-x-3 gap-y-1 text-sm">
                      <a
                        href={scryfallUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="whitespace-nowrap text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                      >
                        <span class="hidden min-[420px]:inline">Try on </span>Scryfall ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => navigateToReport()}
                        title="Report a problem"
                        aria-label="Report a problem"
                        class="inline-flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082" />
                        </svg>
                      </button>
                    </div>
                    <ViewModeToggle value={viewMode()} onChange={changeViewMode} />
                  </div>
                  <Show when={hasPrintingConditions() && !printingDisplay()}>
                    <p class="px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800/50">
                      Printing data loading — set, rarity, and price filters are not yet available.
                    </p>
                  </Show>
                  <Show when={totalCards() > 0} fallback={
                    <p class="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-800">
                      No cards found
                    </p>
                  }>
                    <Show when={viewMode() === 'images'} fallback={
                      <ul class="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-800">
                        <Show when={printingExpanded() && visibleDisplayItems()} fallback={
                          <For each={visibleIndices()}>
                            {(ci) => {
                              const faces = () => facesOf().get(ci) ?? []
                              const name = () => fullCardName(d(), faces())
                              const pi = () => firstPrintingForCard().get(ci)
                              const pdc = () => printingDisplay()
                              const artScryfallId = () => {
                                const idx = pi()
                                const pd = pdc()
                                return idx !== undefined && pd ? pd.scryfall_ids[idx] : d().scryfall_ids[ci]
                              }
                              const setBadge = () => {
                                if (!hasPrintingConditions() && !uniquePrints()) return null
                                const idx = pi()
                                const pd = pdc()
                                if (idx === undefined || !pd) return null
                                return pd.set_codes[idx]
                              }
                              return (
                                <Show when={viewMode() === 'full'} fallback={
                                  <li class="group px-4 py-2 text-sm flex items-start gap-3">
                                    <ArtCrop
                                      scryfallId={artScryfallId()}
                                      colorIdentity={d().color_identity[ci]}
                                      thumbHash={d().art_crop_thumb_hashes[ci]}
                                    />
                                    <div class="min-w-0 flex-1">
                                      <Show when={faces().length > 1} fallback={
                                        <>
                                          <CardFaceRow d={d()} fi={faces()[0]} fullName={name()} showOracle={showOracleText()} onCardClick={() => navigateToCard(artScryfallId())} setBadge={setBadge()} />
                                        </>
                                      }>
                                        <div class="flex items-center gap-1.5 min-w-0">
                                          <button
                                            type="button"
                                            onClick={() => navigateToCard(artScryfallId())}
                                            class={`font-medium hover:underline text-left min-w-0 ${showOracleText() ? 'whitespace-normal break-words' : 'truncate'}`}
                                          >
                                            {name()}
                                          </button>
                                          <Show when={setBadge()}>
                                            {(code) => <span class="shrink-0 text-[10px] font-mono text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 leading-none uppercase">{code()}</span>}
                                          </Show>
                                          <CopyButton text={name()} />
                                        </div>
                                        <div class="mt-1 space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                                          <For each={faces()}>
                                            {(fi) => <CardFaceRow d={d()} fi={fi} showOracle={showOracleText()} />}
                                          </For>
                                        </div>
                                      </Show>
                                    </div>
                                  </li>
                                }>
                                  <li class="group px-4 py-3 text-sm">
                                    <div class="flex flex-col min-[600px]:flex-row items-start gap-4">
                                      <CardImage
                                        scryfallId={artScryfallId()}
                                        colorIdentity={d().color_identity[ci]}
                                        thumbHash={d().card_thumb_hashes[ci]}
                                        class="w-[336px] max-w-full shrink-0 cursor-pointer rounded-lg"
                                        onClick={() => navigateToCard(artScryfallId())}
                                      />
                                      <div class="min-w-0 flex-1 w-full">
                                        <Show when={faces().length > 1} fallback={
                                          <CardFaceRow d={d()} fi={faces()[0]} fullName={name()} showOracle={true} onCardClick={() => navigateToCard(artScryfallId())} setBadge={setBadge()} />
                                        }>
                                          <div class="flex items-center gap-1.5 min-w-0">
                                            <button
                                              type="button"
                                              onClick={() => navigateToCard(artScryfallId())}
                                              class="font-medium hover:underline text-left min-w-0 whitespace-normal break-words"
                                            >
                                              {name()}
                                            </button>
                                            <Show when={setBadge()}>
                                              {(code) => <span class="shrink-0 text-[10px] font-mono text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 leading-none uppercase">{code()}</span>}
                                            </Show>
                                            <CopyButton text={name()} />
                                          </div>
                                          <div class="mt-1 space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                                            <For each={faces()}>
                                              {(fi) => <CardFaceRow d={d()} fi={fi} showOracle={true} />}
                                            </For>
                                          </div>
                                        </Show>
                                      </div>
                                    </div>
                                  </li>
                                </Show>
                              )
                            }}
                          </For>
                        }>
                          {(printItems) => {
                            const pd = printingDisplay()!
                            return (
                              <For each={printItems()}>
                                {(pi) => {
                                  const ci = pd.canonical_face_ref[pi]
                                  const faces = () => facesOf().get(ci) ?? []
                                  const name = () => fullCardName(d(), faces())
                                  const isFoil = pd.finish[pi] === Finish.Foil
                                  const isEtched = pd.finish[pi] === Finish.Etched
                                  const overlayClass = () => uniquePrints() && isFoil ? 'foil-overlay ' : uniquePrints() && isEtched ? 'etched-overlay ' : ''
                                  return (
                                    <li class="group px-4 py-3 text-sm">
                                      <div class="flex flex-col min-[600px]:flex-row items-start gap-4">
                                        <div class={`${overlayClass()}w-[336px] max-w-full shrink-0 rounded-lg`}>
                                          <CardImage
                                            scryfallId={pd.scryfall_ids[pi]}
                                            colorIdentity={d().color_identity[ci]}
                                            thumbHash={d().card_thumb_hashes[ci]}
                                            class="cursor-pointer rounded-lg"
                                            onClick={() => navigateToCard(pd.scryfall_ids[pi])}
                                          />
                                        </div>
                                        <div class="min-w-0 flex-1 w-full">
                                          <Show when={faces().length > 1} fallback={
                                            <CardFaceRow d={d()} fi={faces()[0]} fullName={name()} showOracle={true} onCardClick={() => navigateToCard(pd.scryfall_ids[pi])} />
                                          }>
                                            <div class="flex items-center gap-1.5 min-w-0">
                                              <button
                                                type="button"
                                                onClick={() => navigateToCard(pd.scryfall_ids[pi])}
                                                class="font-medium hover:underline text-left min-w-0 whitespace-normal break-words"
                                              >
                                                {name()}
                                              </button>
                                              <CopyButton text={name()} />
                                            </div>
                                            <div class="mt-1 space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                                              <For each={faces()}>
                                                {(fi) => <CardFaceRow d={d()} fi={fi} showOracle={true} />}
                                              </For>
                                            </div>
                                          </Show>
                                          <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                            <dt class="font-medium text-gray-600 dark:text-gray-300">Set</dt>
                                            <dd>{pd.set_names[pi]} <span class="uppercase font-mono">({pd.set_codes[pi]})</span></dd>
                                            <dt class="font-medium text-gray-600 dark:text-gray-300">Collector #</dt>
                                            <dd>{pd.collector_numbers[pi]}</dd>
                                            <dt class="font-medium text-gray-600 dark:text-gray-300">Rarity</dt>
                                            <dd>{RARITY_LABELS[pd.rarity[pi]] ?? 'Unknown'}</dd>
                                            {(() => {
                                              const sid = pd.scryfall_ids[pi]
                                              const group = finishGroupMap().get(sid)
                                              if (group && group.length > 1 && !uniquePrints()) {
                                                return (<>
                                                  <dt class="font-medium text-gray-600 dark:text-gray-300">Finishes</dt>
                                                  <dd>{group.map(g => {
                                                    const label = FINISH_LABELS[g.finish] ?? 'Unknown'
                                                    const price = formatPrice(g.price)
                                                    return `${label} (${price})`
                                                  }).join(' · ')}</dd>
                                                </>)
                                              }
                                              return (<>
                                                <dt class="font-medium text-gray-600 dark:text-gray-300">Finish</dt>
                                                <dd>{FINISH_LABELS[pd.finish[pi]] ?? 'Unknown'}</dd>
                                                <dt class="font-medium text-gray-600 dark:text-gray-300">Price</dt>
                                                <dd>{formatPrice(pd.price_usd[pi])}</dd>
                                              </>)
                                            })()}
                                          </dl>
                                        </div>
                                      </div>
                                    </li>
                                  )
                                }}
                              </For>
                            )
                          }}
                        </Show>
                        <Show when={hasMore()}>
                          <li
                            ref={(el) => {
                              const obs = new IntersectionObserver(
                                ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + batchSize()) },
                                { rootMargin: '600px' },
                              )
                              obs.observe(el)
                              onCleanup(() => obs.disconnect())
                            }}
                            class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 italic"
                          >
                            …and {(totalDisplayItems() - visibleCount()).toLocaleString()} more
                          </li>
                        </Show>
                      </ul>
                    }>
                      <div class="border-t border-gray-200 dark:border-gray-800 overflow-hidden rounded-b-xl">
                        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-200 dark:bg-gray-800">
                          <Show when={visibleDisplayItems()} fallback={
                            <For each={visibleIndices()}>
                              {(ci) => {
                                const name = () => {
                                  const faces = facesOf().get(ci) ?? []
                                  return fullCardName(d(), faces)
                                }
                                return (
                                  <CardImage
                                    scryfallId={d().scryfall_ids[ci]}
                                    colorIdentity={d().color_identity[ci]}
                                    thumbHash={d().card_thumb_hashes[ci]}
                                    class="cursor-pointer hover:brightness-110 transition-[filter]"
                                    onClick={() => navigateToCard(d().scryfall_ids[ci])}
                                    aria-label={name()}
                                  />
                                )
                              }}
                            </For>
                          }>
                            {(printItems) => {
                              const pd = printingDisplay()!
                              return (
                                <For each={printItems()}>
                                  {(pi) => {
                                    const ci = pd.canonical_face_ref[pi]
                                    const name = () => {
                                      const faces = facesOf().get(ci) ?? []
                                      return fullCardName(d(), faces)
                                    }
                                    const setCode = pd.set_codes[pi]
                                    const rarityLabel = RARITY_LABELS[pd.rarity[pi]] ?? ''
                                    const sid = pd.scryfall_ids[pi]
                                    const isFoil = pd.finish[pi] === Finish.Foil
                                    const isEtched = pd.finish[pi] === Finish.Etched
                                    const finishLabel = () => {
                                      if (uniquePrints()) return FINISH_LABELS[pd.finish[pi]] ?? null
                                      const group = finishGroupMap().get(sid)
                                      if (!group || group.length <= 1) return null
                                      return group.map(g => FINISH_LABELS[g.finish] ?? '').filter(Boolean).join(', ')
                                    }
                                    const overlayClass = () => uniquePrints() && isFoil ? 'foil-overlay' : uniquePrints() && isEtched ? 'etched-overlay' : ''
                                    const metaClass = () => uniquePrints() && isFoil ? 'foil-meta' : uniquePrints() && isEtched ? 'etched-meta' : ''
                                    return (
                                      <div class={`bg-white dark:bg-gray-900 flex flex-col ${overlayClass()}`}>
                                        <CardImage
                                          scryfallId={sid}
                                          colorIdentity={d().color_identity[ci]}
                                          thumbHash={d().card_thumb_hashes[ci]}
                                          class="cursor-pointer hover:brightness-110 transition-[filter]"
                                          onClick={() => navigateToCard(sid)}
                                          aria-label={name()}
                                        />
                                        <div class={`px-1.5 py-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 leading-tight truncate ${metaClass()}`}>
                                          <span class="uppercase">{setCode}</span>
                                          {' · '}
                                          {rarityLabel}
                                          <Show when={finishLabel()}>
                                            {(f) => <>{' · '}{f()}</>}
                                          </Show>
                                        </div>
                                      </div>
                                    )
                                  }}
                                </For>
                              )
                            }}
                          </Show>
                        </div>
                        <Show when={hasMore()}>
                          <div
                            ref={(el) => {
                              const obs = new IntersectionObserver(
                                ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + batchSize()) },
                                { rootMargin: '600px' },
                              )
                              obs.observe(el)
                              onCleanup(() => obs.disconnect())
                            }}
                            class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 italic bg-white dark:bg-gray-900"
                          >
                            …and {(totalDisplayItems() - visibleCount()).toLocaleString()} more
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </Show>
                </div>
            </Show>
          </>)}
        </Show>
      </main>
      </Show>
    </div>
  )
}

export default App
