// SPDX-License-Identifier: Apache-2.0
import { createSignal } from 'solid-js'

function App() {
  const [query, setQuery] = createSignal('')

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
            class="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 pl-11 text-base shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none transition-all"
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
        {query().trim() ? (
          <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Query: <code class="font-mono text-gray-700 dark:text-gray-300">{query()}</code>
            </p>
          </div>
        ) : (
          <p class="text-center text-sm text-gray-400 dark:text-gray-600 pt-8">
            Type a query to search
          </p>
        )}
      </main>
    </div>
  )
}

export default App
