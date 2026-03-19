// SPDX-License-Identifier: Apache-2.0
import posthog from 'posthog-js'

if (!import.meta.env.DEV) {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (key) {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      persistence: 'memory',
      autocapture: false,
      capture_pageview: false,
      capture_performance: true,
      transport: 'fetch',
    } as Parameters<typeof posthog.init>[1])
  }
}

export function captureSearchExecuted(params: {
  query: string
  used_extension: boolean
  results_count: number
}): void {
  posthog.capture('search_executed', params)
}

export function captureUiInteracted(params: {
  element_name: string
  action: 'toggled' | 'clicked'
  state?: string
}): void {
  posthog.capture('ui_interacted', params)
}

export function capturePageview(): void {
  posthog.capture('$pageview')
}

export function captureFacesLoaded(params: { duration_ms: number }): void {
  posthog.capture('faces_loaded', params)
}

export function capturePrintingsLoaded(params: { duration_ms: number }): void {
  posthog.capture('printings_loaded', params)
}
