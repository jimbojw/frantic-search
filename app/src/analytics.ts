// SPDX-License-Identifier: Apache-2.0
import posthog from 'posthog-js'
import { isPwaSession } from './is-pwa-session'
import type { ViewMode } from './view-mode'

declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

/** Earliest moment in app bundle load (Spec 140). Used for search_resolved_from_url duration_ms. */
export const pageLoadStartTime = performance.now()

let posthogInitialized = false

if (!import.meta.env.DEV) {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (key) {
    posthogInitialized = true
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

function captureEvent(
  event: string,
  properties?: Parameters<typeof posthog.capture>[1],
): void {
  if (posthogInitialized) {
    posthog.capture(event, properties)
    return
  }
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.log('[analytics]', event, properties ?? {})
    return
  }
  posthog.capture(event, properties)
}

export function captureSearchExecuted(params: {
  query: string
  used_extension: boolean
  results_count: number
  triggered_by: 'url' | 'user'
  /** Pathname + search when the result was applied; aligns query/results with URL for analysis (GitHub #184). */
  url_snapshot: string
}): void {
  captureEvent('search_executed', params)
}

export function captureUiInteracted(params: {
  element_name: string
  action: 'toggled' | 'clicked'
  state?: string
}): void {
  captureEvent('ui_interacted', params)
}

export function capturePageview(): void {
  captureEvent('$pageview')
}

export function captureFacesLoaded(params: { duration_ms: number }): void {
  captureEvent('faces_loaded', params)
}

export function capturePrintingsLoaded(params: { duration_ms: number }): void {
  captureEvent('printings_loaded', params)
}

export function captureSearchResolvedFromUrl(params: {
  duration_ms: number
  results_count: number
  had_results: boolean
}): void {
  captureEvent('search_resolved_from_url', params)
}

export function captureSuggestionApplied(params: {
  suggestion_id: string
  suggestion_label: string
  variant: 'rewrite' | 'cta'
  applied_query?: string
  cta_action?: string
  mode?: 'empty' | 'rider'
}): void {
  captureEvent('suggestion_applied', params)
}

export function captureScryfallOutlinkClicked(params: {
  query: string
  used_extension: boolean
  results_count: number
  pane_id?: string
}): void {
  captureEvent('scryfall_outlink_clicked', params)
}

export function captureMenuChipUsed(params: {
  section: string
  chip_label: string
}): void {
  captureEvent('menu_chip_used', params)
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
  captureEvent('card_detail_interacted', params)
}

/** Card-index row vs printing-expanded row (Spec 161). */
export type SearchResultsRowKind = 'cards' | 'printings'

type SearchResultsListBase = {
  view_mode: ViewMode
  row_kind: SearchResultsRowKind
  pane_id?: string
}

/** Search results surface only (Spec 161). */
export type SearchResultsInteractedPayload =
  | ({
      control: 'open_card'
      scryfall_id: string
    } & SearchResultsListBase)
  | ({ control: 'all_prints' } & SearchResultsListBase)
  | ({ control: 'name_copy' } & SearchResultsListBase)
  | ({
      control: 'list_add'
      list_scope: 'oracle'
      oracle_id: string
      finish: CardDetailListFinish
    } & SearchResultsListBase)
  | ({
      control: 'list_add'
      list_scope: 'printing'
      oracle_id: string
      finish: CardDetailListFinish
      scryfall_id: string
    } & SearchResultsListBase)
  | ({
      control: 'list_remove'
      list_scope: 'oracle'
      oracle_id: string
      finish: CardDetailListFinish
    } & SearchResultsListBase)
  | ({
      control: 'list_remove'
      list_scope: 'printing'
      oracle_id: string
      finish: CardDetailListFinish
      scryfall_id: string
    } & SearchResultsListBase)

export function captureSearchResultsInteracted(params: SearchResultsInteractedPayload): void {
  captureEvent('search_results_interacted', params)
}
