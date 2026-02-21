// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, For, Show } from 'solid-js'
import type { FromWorker, CardResult, BreakdownNode } from '@frantic-search/shared'
import SearchWorker from './worker?worker'

const MANA_SYMBOL_RE = /\{([^}]+)\}/g

const SYMBOL_OVERRIDES: Record<string, string> = {
  t: 'tap',
  q: 'untap',
}

function symbolToClass(raw: string): string {
  const normalized = raw.toLowerCase().replace('/', '')
  return SYMBOL_OVERRIDES[normalized] ?? normalized
}

function ManaCost(props: { cost: string }) {
  const symbols = () => {
    const result: string[] = []
    let match
    MANA_SYMBOL_RE.lastIndex = 0
    while ((match = MANA_SYMBOL_RE.exec(props.cost)) !== null) {
      result.push(symbolToClass(match[1]))
    }
    return result
  }

  return (
    <span class="inline-flex items-center gap-px shrink-0">
      <For each={symbols()}>
        {(sym) => <i class={`ms ms-${sym} ms-cost`} />}
      </For>
    </span>
  )
}

function OracleText(props: { text: string }) {
  type Segment = { type: 'text'; value: string } | { type: 'symbol'; value: string }

  const segments = (): Segment[] => {
    const result: Segment[] = []
    let lastIndex = 0
    MANA_SYMBOL_RE.lastIndex = 0
    let match
    while ((match = MANA_SYMBOL_RE.exec(props.text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', value: props.text.slice(lastIndex, match.index) })
      }
      result.push({ type: 'symbol', value: symbolToClass(match[1]) })
      lastIndex = MANA_SYMBOL_RE.lastIndex
    }
    if (lastIndex < props.text.length) {
      result.push({ type: 'text', value: props.text.slice(lastIndex) })
    }
    return result
  }

  return (
    <p class="mt-1 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
      <For each={segments()}>
        {(seg) => seg.type === 'symbol'
          ? <i class={`ms ms-${seg.value} ms-cost`} style="font-size: 0.85em" />
          : <>{seg.value}</>
        }
      </For>
    </p>
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

function QueryBreakdown(props: { breakdown: BreakdownNode; onClose: () => void }) {
  const flat = () => isFlatAnd(props.breakdown)

  return (
    <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4 mb-4">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Query breakdown</p>
        <div class="flex items-center gap-2">
          <a
            href="https://scryfall.com/docs/syntax"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Syntax guide ↗
          </a>
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
      </div>
      <Show when={flat()} fallback={<BreakdownTree node={props.breakdown} />}>
        <For each={props.breakdown.children!}>
          {(child) => <BreakdownRow label={child.label} count={child.matchCount} />}
        </For>
        <div class="border-t border-gray-200 dark:border-gray-700 mt-1.5 pt-1.5">
          <BreakdownRow label="Combined" count={props.breakdown.matchCount} muted={props.breakdown.matchCount > 0} />
        </div>
      </Show>
    </div>
  )
}

function App() {
  const [query, setQuery] = createSignal('')
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

  return (
    <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      <header class={`mx-auto max-w-2xl px-4 transition-all duration-200 ease-out ${headerCollapsed() ? 'pt-4 pb-4' : 'pt-16 pb-8'}`}>
        <div class={`overflow-hidden transition-all duration-200 ease-out ${headerCollapsed() ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100'}`}>
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
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            disabled={workerStatus() === 'error'}
            class="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 pl-11 text-base shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none transition-all disabled:opacity-50"
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
            <p class="text-center text-sm text-gray-400 dark:text-gray-600 pt-8">
              Type a query to search
            </p>
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
                </p>
                <Show when={showBreakdown() && breakdown()}>
                  {(bd) => (
                    <div class="mt-4 text-left">
                      <QueryBreakdown breakdown={bd()} onClose={() => setShowBreakdown(false)} />
                    </div>
                  )}
                </Show>
              </div>
            }>
              <Show when={showBreakdown() && breakdown()}>
                {(bd) => <QueryBreakdown breakdown={bd()} onClose={() => setShowBreakdown(false)} />}
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
                  {(card) => (
                    <li class="px-4 py-2 text-sm">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <a
                            href={`https://scryfall.com/search?q=${encodeURIComponent('!"' + card.name + '"')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="font-medium hover:underline"
                          >
                            {card.name}
                          </a>
                          <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">{card.typeLine}</span>
                        </div>
                        <ManaCost cost={card.manaCost} />
                      </div>
                      <Show when={showOracleText() && card.oracleText}>
                        <OracleText text={card.oracleText} />
                      </Show>
                    </li>
                  )}
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
    </div>
  )
}

export default App
