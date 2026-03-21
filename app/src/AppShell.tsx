// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal app shell for fast first paint (Spec 143).
 * Renders immediately; App loads asynchronously and portals its header into #app-header-slot.
 */
import { Suspense, lazy, onMount } from 'solid-js'
import { useViewportWide } from './useViewportWide'
import { IconList } from './Icons'
import { HEADER_ART_BLUR } from './hero-constants'

const App = lazy(() => import('./App'))

function MinimalBar() {
  const viewportWide = useViewportWide()
  return (
    <div class="flex h-11 items-center justify-between shrink-0 mb-2">
      <div class="flex items-center gap-1">
        <a
          href={import.meta.env.BASE_URL || '/'}
          aria-label="Go to home"
          class="flex h-11 min-w-11 -ml-2 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <img src="/pwa-192x192.png" alt="" class="size-8 rounded-lg" />
        </a>
        {viewportWide() && (
          <div
            class="flex h-11 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-gray-400 dark:text-gray-500"
            aria-hidden
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5 shrink-0">
              <rect x="3" y="3" width="9" height="18" rx="1" />
              <rect x="12" y="3" width="9" height="18" rx="1" />
            </svg>
            <span class="text-sm whitespace-nowrap">Split view</span>
          </div>
        )}
      </div>
      <div class="flex items-center gap-1">
        <a
          href="?list="
          aria-label="My list"
          class="flex h-11 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <IconList class="size-5 shrink-0" />
          <span class="text-sm whitespace-nowrap">My list</span>
        </a>
        <div
          class="flex h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500"
          aria-hidden
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div class="mt-10">
      <div
        class="h-14 w-full overflow-hidden rounded-xl mb-4 shadow-md bg-cover bg-[center_20%] animate-loading-pulse"
        style={{ "background-image": `url("${HEADER_ART_BLUR}")` }}
      />
      <div class="overflow-hidden max-h-80">
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
          Untap, upkeep, draw…
        </p>
      </div>
    </div>
  )
}

export default function AppShell() {
  onMount(() => {
    const slot = document.getElementById('app-header-slot')
    const minimalBar = document.getElementById('shell-minimal-bar')
    if (!slot || !minimalBar) return () => {}
    const updateVisibility = () => {
      ;(minimalBar as HTMLElement).hidden = slot.childNodes.length > 0
    }
    const obs = new MutationObserver(updateVisibility)
    obs.observe(slot, { childList: true })
    updateVisibility()
    return () => obs.disconnect()
  })

  return (
    <div class="min-h-dvh overscroll-y-none bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      <header>
        <div id="app-header-slot" />
        <div
          id="shell-minimal-bar"
          class="mx-auto max-w-4xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4"
        >
          <MinimalBar />
        </div>
      </header>
      <main class="mx-auto max-w-4xl px-4">
        <Suspense fallback={<LoadingFallback />}>
          <App />
        </Suspense>
      </main>
    </div>
  )
}
