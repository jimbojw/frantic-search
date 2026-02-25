// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, createMemo, For, Show, onCleanup } from 'solid-js'
import type { FromWorker, DisplayColumns, BreakdownNode, Histograms } from '@frantic-search/shared'
import SearchWorker from './worker?worker'
import SyntaxHelp from './SyntaxHelp'
import CardDetail from './CardDetail'
import BugReport from './BugReport'
import InlineBreakdown from './InlineBreakdown'
import ResultsBreakdown, { MV_BAR_COLOR, TYPE_BAR_COLOR } from './ResultsBreakdown'
import SparkBars from './SparkBars'
import { CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS } from './color-identity'
import { sealQuery } from './query-edit'
import TermsDrawer from './TermsDrawer'
import ArtCrop from './ArtCrop'
import CopyButton from './CopyButton'
import { ManaCost, OracleText } from './card-symbols'

declare const __REPO_URL__: string
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

function buildFacesOf(canonicalFace: number[]): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (let i = 0; i < canonicalFace.length; i++) {
    const cf = canonicalFace[i]
    let faces = map.get(cf)
    if (!faces) {
      faces = []
      map.set(cf, faces)
    }
    faces.push(i)
  }
  return map
}

function buildScryfallIndex(scryfallIds: string[], canonicalFace: number[]): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < scryfallIds.length; i++) {
    const cf = canonicalFace[i]
    if (cf === i) map.set(scryfallIds[i], i)
  }
  return map
}

function faceStat(d: DisplayColumns, fi: number): string | null {
  const pow = d.power_lookup[d.powers[fi]]
  const tou = d.toughness_lookup[d.toughnesses[fi]]
  if (pow && tou) return `${pow}/${tou}`
  const loy = d.loyalty_lookup[d.loyalties[fi]]
  if (loy) return `Loyalty: ${loy}`
  const def = d.defense_lookup[d.defenses[fi]]
  if (def) return `Defense: ${def}`
  return null
}

function fullCardName(d: DisplayColumns, faceIndices: number[]): string {
  return faceIndices.map(fi => d.names[fi]).join(' // ')
}

function CardFaceRow(props: {
  d: DisplayColumns; fi: number; fullName?: string; showOracle: boolean; onCardClick?: () => void
}) {
  const copyText = () => props.fullName ?? props.d.names[props.fi]
  const stat = () => faceStat(props.d, props.fi)
  return (
    <div>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <Show when={props.fullName && props.onCardClick} fallback={
              <span class={`font-medium text-gray-700 dark:text-gray-200 min-w-0 ${props.showOracle ? 'whitespace-normal break-words' : 'truncate'}`}>
                {props.d.names[props.fi]}
              </span>
            }>
              <button
                type="button"
                onClick={() => props.onCardClick?.()}
                class={`font-medium hover:underline text-left min-w-0 ${props.showOracle ? 'whitespace-normal break-words' : 'truncate'}`}
              >
                {props.fullName}
              </button>
            </Show>
            <CopyButton text={copyText()} />
          </div>
          <div class="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            <span class={`min-w-0 ${props.showOracle ? 'whitespace-normal break-words' : 'truncate'}`}>
              {props.d.type_lines[props.fi]}
            </span>
            <Show when={!props.showOracle && stat()}>
              <span class="shrink-0 whitespace-nowrap">
                {' · '}{stat()}
              </span>
            </Show>
          </div>
        </div>
        <ManaCost cost={props.d.mana_costs[props.fi]} />
      </div>
      <Show when={props.showOracle && props.d.oracle_texts[props.fi]}>
        <OracleText text={props.d.oracle_texts[props.fi]} />
      </Show>
      <Show when={props.showOracle && stat()}>
        <p class="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-1">{stat()}</p>
      </Show>
    </div>
  )
}

const HEADER_ART_BLUR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACAWGBwYFCAcGhwkIiAmMFA0MCwsMGJGSjpQdGZ6eHJmcG6AkLicgIiuim5woNqirr7EztDOfJri8uDI8LjKzsb/2wBDASIkJDAqMF40NF7GhHCExsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsb/wAARCAAYACADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAEDAv/EACEQAAICAQQCAwAAAAAAAAAAAAECABEDEhMhMUFhIjJR/8QAFgEBAQEAAAAAAAAAAAAAAAAAAgED/8QAFxEBAQEBAAAAAAAAAAAAAAAAAQACEf/aAAwDAQACEQMRAD8AxjUKTY9VXUGofYH1xK7QxqWZwx8yOVRQYZCwsCqkVGIDIhdttKgauO+jM5kBz6EHYHQjVWuwAteY8iH4kmzVWDDnT3lpoA7UymlJUDn3InKNKrxYu7hCLVlmQzNq45M0wORTuAjT+DsQhIBLS3//2Q=='

type View = 'search' | 'help' | 'card' | 'report'

function parseView(params: URLSearchParams): View {
  if (params.has('card')) return 'card'
  if (params.has('report')) return 'report'
  if (params.has('help')) return 'help'
  return 'search'
}

function saveScrollPosition() {
  history.replaceState({ ...history.state, scrollY: window.scrollY }, '')
}

const HISTORY_DEBOUNCE_MS = 2000
let needsPush = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function clearDebounceTimer() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
}

function pushIfNeeded() {
  if (!needsPush) return
  needsPush = false
  saveScrollPosition()
  history.pushState(history.state, '', location.href)
}

function scheduleDebouncedCommit() {
  clearDebounceTimer()
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    needsPush = true
  }, HISTORY_DEBOUNCE_MS)
}

function flushPendingCommit() {
  clearDebounceTimer()
  needsPush = true
}

function cancelPendingCommit() {
  clearDebounceTimer()
  needsPush = false
}

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
  const [display, setDisplay] = createSignal<DisplayColumns | null>(null)
  const [indices, setIndices] = createSignal<Uint32Array>(new Uint32Array(0))
  const [showOracleText, setShowOracleText] = createSignal(false)
  const [breakdown, setBreakdown] = createSignal<BreakdownNode | null>(null)
  const [histograms, setHistograms] = createSignal<Histograms | null>(null)
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

  const facesOf = createMemo(() => {
    const d = display()
    return d ? buildFacesOf(d.canonical_face) : new Map<number, number[]>()
  })

  const scryfallIndex = createMemo(() => {
    const d = display()
    return d ? buildScryfallIndex(d.scryfall_ids, d.canonical_face) : new Map<string, number>()
  })

  const RESULT_BATCH = 100
  const [visibleCount, setVisibleCount] = createSignal(RESULT_BATCH)

  createEffect(() => {
    indices()
    setVisibleCount(RESULT_BATCH)
  })

  const visibleIndices = createMemo(() => {
    const idx = indices()
    const len = Math.min(idx.length, visibleCount())
    const result: number[] = new Array(len)
    for (let i = 0; i < len; i++) result[i] = idx[i]
    return result
  })

  const hasMore = () => indices().length > visibleCount()

  const totalCards = () => indices().length

  const headerCollapsed = () => inputFocused() || query().trim() !== '' || hasEverFocused()
  const scryfallUrl = () => `https://scryfall.com/search?q=${encodeURIComponent(query().trim())}`

  const worker = new SearchWorker()
  let latestQueryId = 0

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data
    switch (msg.type) {
      case 'status':
        if (msg.status === 'progress') {
          setDataProgress(msg.fraction)
        } else {
          setWorkerStatus(msg.status)
          if (msg.status === 'ready') { setDataProgress(1); setDisplay(msg.display) }
          if (msg.status === 'error') setWorkerError(msg.error)
        }
        break
      case 'result':
        if (msg.queryId === latestQueryId) {
          setIndices(msg.indices)
          setBreakdown(msg.breakdown)
          setHistograms(msg.histograms)
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

  function navigateHome() {
    const isAtHome =
      view() === 'search' &&
      !query().trim() &&
      !cardId() &&
      !hasEverFocused()

    if (isAtHome) {
      // Already at home — hard refresh (unregister SW, reload)
      history.replaceState(null, '', location.pathname)
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

  function appendQuery(term: string) {
    flushPendingCommit()
    setQuery(q => {
      const trimmed = q.trim()
      if (!trimmed) return term
      const sealed = sealQuery(trimmed)
      const needsParens = breakdown()?.type === 'OR'
      return needsParens ? `(${sealed}) ${term}` : `${sealed} ${term}`
    })
  }

  return (
    <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      <Show when={view() === 'help'}>
        <SyntaxHelp onSelectExample={navigateToQuery} />
      </Show>
      <Show when={view() === 'card'}>
        <CardDetail
          canonicalIndex={scryfallIndex().get(cardId())}
          scryfallId={cardId()}
          display={display()}
          facesOf={facesOf()}
        />
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
              onChipClick={appendQuery}
              onHelpClick={navigateToHelp}
              onClose={toggleTerms}
            />
          </Show>
          <div class={`relative ${termsExpanded() ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}>
            <input
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
              class="w-full bg-transparent px-4 py-3 pl-11 pr-10 text-base placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all disabled:opacity-50"
            />
            <svg
              class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-gray-400 dark:text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <button
              type="button"
              onClick={toggleTerms}
              class={`absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center transition-colors ${termsExpanded() ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
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
            <p class="text-sm font-medium text-red-800 dark:text-red-200">Failed to load card data</p>
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">{workerError()}</p>
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
                            breakdown={breakdown()}
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
                        Try on Scryfall ↗
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
                    <button
                      type="button"
                      onClick={() => setShowOracleText(prev => !prev)}
                      class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer select-none transition-colors ${showOracleText() ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
                    >
                      Oracle text
                    </button>
                  </div>
                  <Show when={totalCards() > 0} fallback={
                    <p class="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-800">
                      No cards found
                    </p>
                  }>
                    <ul class="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-800">
                      <For each={visibleIndices()}>
                        {(ci) => {
                          const faces = () => facesOf().get(ci) ?? []
                          const name = () => fullCardName(d(), faces())
                          return (
                            <li class="group px-4 py-2 text-sm flex items-start gap-3">
                              <ArtCrop
                                scryfallId={d().scryfall_ids[ci]}
                                colorIdentity={d().color_identity[ci]}
                                thumbHash={d().art_crop_thumb_hashes[ci]}
                              />
                              <div class="min-w-0 flex-1">
                                <Show when={faces().length > 1} fallback={
                                  <CardFaceRow d={d()} fi={faces()[0]} fullName={name()} showOracle={showOracleText()} onCardClick={() => navigateToCard(d().scryfall_ids[ci])} />
                                }>
                                  <div class="flex items-center gap-1.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => navigateToCard(d().scryfall_ids[ci])}
                                      class={`font-medium hover:underline text-left min-w-0 ${showOracleText() ? 'whitespace-normal break-words' : 'truncate'}`}
                                    >
                                      {name()}
                                    </button>
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
                          )
                        }}
                      </For>
                      <Show when={hasMore()}>
                        <li
                          ref={(el) => {
                            const obs = new IntersectionObserver(
                              ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + RESULT_BATCH) },
                              { rootMargin: '600px' },
                            )
                            obs.observe(el)
                            onCleanup(() => obs.disconnect())
                          }}
                          class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 italic"
                        >
                          …and {(totalCards() - visibleCount()).toLocaleString()} more
                        </li>
                      </Show>
                    </ul>
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
