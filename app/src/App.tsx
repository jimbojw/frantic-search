// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, For, Show } from 'solid-js'
import type { FromWorker, CardResult, CardFace, BreakdownNode } from '@frantic-search/shared'
import SearchWorker from './worker?worker'
import SyntaxHelp from './SyntaxHelp'
import CardDetail from './CardDetail'
import BugReport from './BugReport'
import { ManaCost, OracleText } from './card-symbols'
import { artCropUrl, CI_BACKGROUNDS, CI_COLORLESS } from './color-identity'

declare const __REPO_URL__: string

function ArtCrop(props: { scryfallId: string; colorIdentity: number }) {
  const [loaded, setLoaded] = createSignal(false)
  return (
    <div
      class="w-[3em] pb-1 rounded-sm overflow-hidden shrink-0 mt-0.5"
      style={{ background: CI_BACKGROUNDS[props.colorIdentity] ?? CI_COLORLESS }}
    >
      <img
        src={artCropUrl(props.scryfallId)}
        loading="lazy"
        alt=""
        onLoad={() => setLoaded(true)}
        class="w-full aspect-[4/3] object-cover"
        classList={{ 'opacity-0': !loaded(), 'opacity-100': loaded() }}
        style="transition: opacity 300ms ease-in"
      />
    </div>
  )
}


function isFlatAnd(node: BreakdownNode): boolean {
  if (node.label !== 'AND' || !node.children) return false
  return node.children.every(c => !c.children)
}

function BreakdownRow(props: { label: string; count: number; indent?: number; muted?: boolean }) {
  return (
    <div
      class={`flex items-baseline justify-between gap-4 py-0.5 ${props.muted ? 'text-gray-400 dark:text-gray-500' : ''}`}
      style={props.indent ? { "padding-left": `${props.indent * 1.25}rem` } : undefined}
    >
      <span class={`font-mono text-xs truncate ${props.count === 0 && !props.muted ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
        {props.label}
      </span>
      <span class={`font-mono text-xs tabular-nums shrink-0 ${props.count === 0 && !props.muted ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
        {props.count.toLocaleString()}
      </span>
    </div>
  )
}

function BreakdownTree(props: { node: BreakdownNode; depth?: number }) {
  const depth = () => props.depth ?? 0
  return (
    <>
      <BreakdownRow label={props.node.label} count={props.node.matchCount} indent={depth()} />
      <Show when={props.node.children}>
        <For each={props.node.children}>
          {(child) => <BreakdownTree node={child} depth={depth() + 1} />}
        </For>
      </Show>
    </>
  )
}

function QueryBreakdown(props: { breakdown: BreakdownNode; onClose: () => void; onHelpClick: () => void; onReportClick: () => void }) {
  const flat = () => isFlatAnd(props.breakdown)

  return (
    <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4 mb-4">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Query breakdown</p>
        <button
          type="button"
          onClick={() => props.onClose()}
          class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close breakdown"
        >
          <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <Show when={flat()} fallback={<BreakdownTree node={props.breakdown} />}>
        <For each={props.breakdown.children!}>
          {(child) => <BreakdownRow label={child.label} count={child.matchCount} />}
        </For>
        <div class="border-t border-gray-200 dark:border-gray-700 mt-1.5 pt-1.5">
          <BreakdownRow label="Combined" count={props.breakdown.matchCount} muted={props.breakdown.matchCount > 0} />
        </div>
      </Show>
      <div class="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => props.onHelpClick()}
          class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Syntax help
        </button>
        <span class="text-xs text-gray-300 dark:text-gray-600">·</span>
        <button
          type="button"
          onClick={() => props.onReportClick()}
          class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Report a problem
        </button>
      </div>
    </div>
  )
}

function CardFaceRow(props: { face: CardFace; fullName?: string; showOracle: boolean; onCardClick?: () => void }) {
  return (
    <div>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <Show when={props.fullName && props.onCardClick} fallback={
            <span class="font-medium text-gray-700 dark:text-gray-200">{props.face.name}</span>
          }>
            <button
              type="button"
              onClick={() => props.onCardClick?.()}
              class="font-medium hover:underline text-left"
            >
              {props.fullName}
            </button>
          </Show>
          <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">{props.face.typeLine}</span>
        </div>
        <ManaCost cost={props.face.manaCost} />
      </div>
      <Show when={props.showOracle && props.face.oracleText}>
        <OracleText text={props.face.oracleText} />
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

function App() {
  const initialParams = new URLSearchParams(location.search)
  const [query, setQuery] = createSignal(initialParams.get('q') ?? '')
  const [view, setView] = createSignal<View>(parseView(initialParams))
  const [cardId, setCardId] = createSignal(initialParams.get('card') ?? '')
  const [headerArtLoaded, setHeaderArtLoaded] = createSignal(false)
  const [workerStatus, setWorkerStatus] = createSignal<'loading' | 'ready' | 'error'>('loading')
  const [workerError, setWorkerError] = createSignal('')
  const [results, setResults] = createSignal<CardResult[]>([])
  const [totalMatches, setTotalMatches] = createSignal(0)
  const [showOracleText, setShowOracleText] = createSignal(false)
  const [breakdown, setBreakdown] = createSignal<BreakdownNode | null>(null)
  const [showBreakdown, setShowBreakdown] = createSignal(false)
  const [inputFocused, setInputFocused] = createSignal(false)

  const headerCollapsed = () => inputFocused() || query().trim() !== ''
  const scryfallUrl = () => `https://scryfall.com/search?q=${encodeURIComponent(query().trim())}`

  const worker = new SearchWorker()
  let latestQueryId = 0

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data
    switch (msg.type) {
      case 'status':
        setWorkerStatus(msg.status)
        if (msg.error) setWorkerError(msg.error)
        break
      case 'result':
        if (msg.queryId === latestQueryId) {
          setResults(msg.cards)
          setTotalMatches(msg.totalMatches)
          setBreakdown(msg.breakdown)
        }
        break
    }
  }

  createEffect(() => {
    const q = query().trim()
    if (workerStatus() === 'ready' && q) {
      latestQueryId++
      worker.postMessage({ type: 'search', queryId: latestQueryId, query: q })
    } else if (!q) {
      setResults([])
      setTotalMatches(0)
      setBreakdown(null)
    }
  })

  createEffect(() => {
    const q = query().trim()
    if (view() !== 'search') return
    const params = new URLSearchParams(location.search)
    if (q) {
      params.set('q', q)
    } else {
      params.delete('q')
    }
    const url = params.toString() ? `?${params}` : location.pathname
    history.replaceState(null, '', url)
  })

  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(location.search)
    setView(parseView(params))
    setQuery(params.get('q') ?? '')
    setCardId(params.get('card') ?? '')
  })

  function navigateToHelp() {
    const params = new URLSearchParams(location.search)
    params.set('help', '')
    history.pushState(null, '', `?${params}`)
    setView('help')
  }

  function navigateToQuery(q: string) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const url = params.toString() ? `?${params}` : location.pathname
    history.pushState(null, '', url)
    setQuery(q)
    setView('search')
  }

  function navigateToCard(scryfallId: string) {
    const params = new URLSearchParams(location.search)
    params.delete('help')
    params.set('card', scryfallId)
    history.pushState(null, '', `?${params}`)
    setCardId(scryfallId)
    setView('card')
  }

  function navigateToReport() {
    const params = new URLSearchParams()
    const q = query().trim()
    if (q) params.set('q', q)
    params.set('report', '')
    history.pushState(null, '', `?${params}`)
    setView('report')
  }

  function navigateHome() {
    history.pushState(null, '', location.pathname)
    setQuery('')
    setView('search')
    setCardId('')
  }

  return (
    <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      <Show when={view() === 'help'}>
        <SyntaxHelp onSelectExample={navigateToQuery} />
      </Show>
      <Show when={view() === 'card'}>
        <CardDetail card={results().find(c => c.scryfallId === cardId())} scryfallId={cardId()} />
      </Show>
      <Show when={view() === 'report'}>
        <BugReport query={query()} breakdown={breakdown()} resultCount={totalMatches()} />
      </Show>
      <Show when={view() === 'search'}>
      <header class={`mx-auto max-w-2xl px-4 transition-all duration-200 ease-out ${headerCollapsed() ? 'pt-[max(1rem,env(safe-area-inset-top))] pb-4' : 'pt-[max(4rem,env(safe-area-inset-top))] pb-8'}`}>
        <button
          type="button"
          onClick={() => navigateHome()}
          aria-label="Go to home"
          class="mb-4 h-14 w-full overflow-hidden rounded-xl shadow-md bg-cover bg-[center_20%] block text-left border-0 p-0 cursor-pointer transition-opacity hover:opacity-95 active:opacity-90"
          style={{ "background-image": `url(${HEADER_ART_BLUR})` }}
        >
          <img
            src="https://cards.scryfall.io/art_crop/front/1/9/1904db14-6df7-424f-afa5-e3dfab31300a.jpg?1764758766"
            alt="Frantic Search card art by Mitchell Malloy"
            onLoad={() => setHeaderArtLoaded(true)}
            class="h-full w-full object-cover object-[center_20%] pointer-events-none"
            classList={{ 'opacity-0': !headerArtLoaded(), 'opacity-100': headerArtLoaded() }}
            style="transition: opacity 300ms ease-in"
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

        <div class="relative">
          <input
            type="text"
            placeholder='Search cards… e.g. "t:creature c:green"'
            autocapitalize="none"
            autocomplete="off"
            autocorrect="off"
            spellcheck={false}
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            disabled={workerStatus() === 'error'}
            class="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 pl-11 pr-11 text-base shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none transition-all disabled:opacity-50"
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
            onClick={() => navigateToHelp()}
            aria-label="Syntax help"
            class="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg class="size-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" />
            </svg>
          </button>
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

        <Show when={workerStatus() === 'ready'}>
          <Show when={query().trim()} fallback={
            <div class="pt-8 text-center">
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
            </div>
          }>
            <Show when={results().length > 0} fallback={
              <div class="pt-8 text-center">
                <p class="text-sm text-gray-400 dark:text-gray-600">
                  No cards found
                </p>
                <p class="mt-2 text-sm">
                  <Show when={breakdown()}>
                    <button
                      type="button"
                      onClick={() => setShowBreakdown(v => !v)}
                      class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    >
                      {showBreakdown() ? 'Hide' : 'Show'} query breakdown
                    </button>
                    <span class="text-gray-300 dark:text-gray-600"> · </span>
                  </Show>
                  <a
                    href={scryfallUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    Try on Scryfall ↗
                  </a>
                  <span class="text-gray-300 dark:text-gray-600"> · </span>
                  <button
                    type="button"
                    onClick={() => navigateToReport()}
                    class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    Report a problem
                  </button>
                </p>
                <Show when={showBreakdown() && breakdown()}>
                  {(bd) => (
                    <div class="mt-4 text-left">
                      <QueryBreakdown breakdown={bd()} onClose={() => setShowBreakdown(false)} onHelpClick={() => navigateToHelp()} onReportClick={() => navigateToReport()} />
                    </div>
                  )}
                </Show>
              </div>
            }>
              <Show when={showBreakdown() && breakdown()}>
                {(bd) => <QueryBreakdown breakdown={bd()} onClose={() => setShowBreakdown(false)} onHelpClick={() => navigateToHelp()} onReportClick={() => navigateToReport()} />}
              </Show>
              <div class="flex items-center justify-between mb-3">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {results().length.toLocaleString()} cards ({totalMatches().toLocaleString()} face matches)
                  <Show when={breakdown()}>
                    <span> · <button
                      type="button"
                      onClick={() => setShowBreakdown(v => !v)}
                      class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    >
                      {showBreakdown() ? 'hide' : 'show'} breakdown
                    </button></span>
                  </Show>
                  <span> · <a
                    href={scryfallUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    Scryfall ↗
                  </a></span>
                </p>
                <label class="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-gray-500 dark:text-gray-400">
                  Oracle text
                  <span class="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={showOracleText()}
                      onChange={(e) => setShowOracleText(e.currentTarget.checked)}
                      class="peer sr-only"
                    />
                    <span class="block h-5 w-9 rounded-full bg-gray-300 dark:bg-gray-700 peer-checked:bg-blue-500 transition-colors" />
                    <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                  </span>
                </label>
              </div>
              <ul class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
                <For each={results().slice(0, 200)}>
                  {(card) => {
                    const fullName = () => card.faces.map(f => f.name).join(' // ')
                    return (
                      <li class="px-4 py-2 text-sm flex items-start gap-3">
                        <Show when={card.scryfallId}>
                          <ArtCrop scryfallId={card.scryfallId} colorIdentity={card.colorIdentity} />
                        </Show>
                        <div class="min-w-0 flex-1">
                          <Show when={card.faces.length > 1} fallback={
                            <CardFaceRow face={card.faces[0]} fullName={fullName()} showOracle={showOracleText()} onCardClick={() => navigateToCard(card.scryfallId)} />
                          }>
                            <button
                              type="button"
                              onClick={() => navigateToCard(card.scryfallId)}
                              class="font-medium hover:underline text-left"
                            >
                              {fullName()}
                            </button>
                            <div class="mt-1 space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                              <For each={card.faces}>
                                {(face) => <CardFaceRow face={face} showOracle={showOracleText()} />}
                              </For>
                            </div>
                          </Show>
                        </div>
                      </li>
                    )
                  }}
                </For>
                <Show when={results().length > 200}>
                  <li class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 italic">
                    …and {(results().length - 200).toLocaleString()} more
                  </li>
                </Show>
              </ul>
            </Show>
          </Show>
        </Show>
      </main>
      </Show>
    </div>
  )
}

export default App
