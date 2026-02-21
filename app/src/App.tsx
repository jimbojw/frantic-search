// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, For, Show } from 'solid-js'
import type { FromWorker } from '@frantic-search/shared'
import SearchWorker from './worker?worker'

function App() {
  const [query, setQuery] = createSignal('')
  const [workerStatus, setWorkerStatus] = createSignal<'loading' | 'ready' | 'error'>('loading')
  const [workerError, setWorkerError] = createSignal('')
  const [results, setResults] = createSignal<string[]>([])
  const [totalMatches, setTotalMatches] = createSignal(0)

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
          setResults(msg.names)
          setTotalMatches(msg.totalMatches)
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
    }
  })

  return (
    <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      <header class="mx-auto max-w-2xl px-4 pt-16 pb-8">
        <h1 class="text-3xl font-bold tracking-tight text-center mb-1">
          Frantic Search
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
          Instant MTG card search
        </p>

        <div class="relative">
          <input
            type="text"
            placeholder='Search cards… e.g. "t:creature c:green"'
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
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
              <p class="text-center text-sm text-gray-400 dark:text-gray-600 pt-8">
                No cards found
              </p>
            }>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {results().length} cards ({totalMatches()} face matches)
              </p>
              <ul class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
                <For each={results().slice(0, 200)}>
                  {(name) => (
                    <li class="px-4 py-2 text-sm">{name}</li>
                  )}
                </For>
                <Show when={results().length > 200}>
                  <li class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 italic">
                    …and {results().length - 200} more
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
