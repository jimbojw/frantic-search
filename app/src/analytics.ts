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
