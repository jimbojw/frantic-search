// SPDX-License-Identifier: Apache-2.0
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// Runtime caching: card data (Spec 085 keeps existing cache behavior)
registerRoute(
  ({ url }) => /columns\.[a-f0-9]+\.json$/.test(url.pathname),
  new CacheFirst({ cacheName: 'card-data' })
)
registerRoute(
  ({ url }) => /thumb-hashes\.[a-f0-9]+\.json$/.test(url.pathname),
  new CacheFirst({ cacheName: 'card-data' })
)
registerRoute(
  ({ url }) => /printings\.[a-f0-9]+\.json$/.test(url.pathname),
  new CacheFirst({ cacheName: 'card-data' })
)
registerRoute(
  ({ url }) => /otags\.[a-f0-9]+\.json$/.test(url.pathname),
  new CacheFirst({ cacheName: 'card-data' })
)
registerRoute(
  ({ url }) => /atags\.[a-f0-9]+\.json$/.test(url.pathname),
  new CacheFirst({ cacheName: 'card-data' })
)
registerRoute(
  ({ url }) => /flavor-index\.[a-f0-9]+\.json$/.test(url.pathname),
  new CacheFirst({ cacheName: 'card-data' })
)
registerRoute(
  ({ url }) => url.origin === 'https://cards.scryfall.io',
  new StaleWhileRevalidate({ cacheName: 'card-art' })
)

// PostHog analytics: queue failed requests for retry when offline (Spec 085)
const posthogSync = new BackgroundSyncPlugin('posthog-events')
registerRoute(
  ({ url, request }) => url.pathname.includes('/e/') && request.method === 'POST',
  new NetworkOnly({ plugins: [posthogSync] })
)

cleanupOutdatedCaches()
;(self as unknown as { skipWaiting: () => void }).skipWaiting()
clientsClaim()
