// SPDX-License-Identifier: Apache-2.0
import posthog from 'posthog-js'
import { isPwaSession } from './is-pwa-session'

declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

/** Earliest moment in app bundle load (Spec 140). Used for search_resolved_from_url duration_ms. */
export const pageLoadStartTime = performance.now()

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
    posthog.register({
      is_pwa: isPwaSession(),
      app_version: __APP_VERSION__,
      build_time: __BUILD_TIME__,
    })
  }
}

export function captureSearchExecuted(params: {
  query: string
  used_extension: boolean
  results_count: number
  triggered_by: 'url' | 'user'
  /** Pathname + search when the result was applied; aligns query/results with URL for analysis (GitHub #184). */
  url_snapshot: string
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

export function captureSearchResolvedFromUrl(params: {
  duration_ms: number
  results_count: number
  had_results: boolean
}): void {
  posthog.capture('search_resolved_from_url', params)
}

export function captureSuggestionApplied(params: {
  suggestion_id: string
  suggestion_label: string
  variant: 'rewrite' | 'cta'
  applied_query?: string
  cta_action?: string
  mode?: 'empty' | 'rider'
}): void {
  posthog.capture('suggestion_applied', params)
}

export function captureScryfallOutlinkClicked(params: {
  query: string
  used_extension: boolean
  results_count: number
  pane_id?: string
}): void {
  posthog.capture('scryfall_outlink_clicked', params)
}

export function captureMenuChipUsed(params: {
  section: string
  chip_label: string
}): void {
  posthog.capture('menu_chip_used', params)
}

/** Same strings as `FINISH_TO_STRING` in app-utils (Spec 160). */
export type CardDetailListFinish = 'nonfoil' | 'foil' | 'etched'

/** Card detail surface only (Spec 160). */
export type CardDetailInteractedPayload =
  | { control: 'back' }
  | { control: 'scryfall_external' }
  | { control: 'all_prints' }
  | { control: 'set_unique_prints'; set_code: string }
  | { control: 'face_toggle'; face: 'front' | 'back' }
  | { control: 'slack_copy' }
  | { control: 'otag_nav'; tag_label: string }
  | { control: 'atag_nav'; tag_label: string }
  | { control: 'otag_copy'; tag_label: string }
  | { control: 'atag_copy'; tag_label: string }
  | { control: 'list_add'; list_scope: 'oracle'; oracle_id: string; finish: CardDetailListFinish }
  | {
      control: 'list_add'
      list_scope: 'printing'
      oracle_id: string
      finish: CardDetailListFinish
      scryfall_id: string
    }
  | { control: 'list_remove'; list_scope: 'oracle'; oracle_id: string; finish: CardDetailListFinish }
  | {
      control: 'list_remove'
      list_scope: 'printing'
      oracle_id: string
      finish: CardDetailListFinish
      scryfall_id: string
    }

export function captureCardDetailInteracted(params: CardDetailInteractedPayload): void {
  posthog.capture('card_detail_interacted', params)
}
