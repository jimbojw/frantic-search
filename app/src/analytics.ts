// SPDX-License-Identifier: Apache-2.0
import posthog from 'posthog-js'
import { TRASH_LIST_ID, type DeckFormat } from '@frantic-search/shared'
import { isPwaSession } from './is-pwa-session'
import type { ViewMode } from './view-mode'
import { utmSuperPropertiesFromSearch } from './utm-super-properties'

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
      ...utmSuperPropertiesFromSearch(window.location.search),
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
  | { control: 'card_copy_menu_opened' }
  | { control: 'card_copy_url' }
  | { control: 'card_copy_url_card_only' }
  | { control: 'card_copy_name' }
  | { control: 'card_copy_markdown' }
  | { control: 'card_copy_slack_reddit' }
  | { control: 'otag_nav'; tag_label: string }
  | { control: 'atag_nav'; tag_label: string }
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

/** Same literals as `EditorMode` in deck-editor (Spec 162); kept here to avoid app import cycles. */
export type MyListEditorMode = 'init' | 'display' | 'edit' | 'review'

/** Same strings as DEFAULT_LIST_ID / TRASH_LIST_ID (Spec 162). */
export type MyListListId = 'default' | 'trash'

export function toMyListListId(listId: string): MyListListId {
  if (listId === TRASH_LIST_ID) return 'trash'
  return 'default'
}

type MyListBase = { list_id: MyListListId; editor_mode: MyListEditorMode }

export type MyListExportOutlinkId =
  | 'archidekt_sandbox'
  | 'arena_import_guide'
  | 'manapool_mass_entry'
  | 'melee_decklist_docs'
  | 'moxfield_personal_decks'
  | 'mtggoldfish_new_deck'
  | 'tappedout_paste'
  | 'tcgplayer_mass_entry'

/** My List / deck editor surface only (Spec 162). */
export type MyListInteractedPayload =
  | ({ control: 'back' } & MyListBase)
  | ({ control: 'view_in_search' } & MyListBase)
  | ({ control: 'edit_open' } & MyListBase)
  | ({ control: 'cancel_edit' } & MyListBase)
  | ({ control: 'revert' } & MyListBase)
  | ({
      control: 'review_open'
      additions_count: number
      removals_count: number
    } & MyListBase)
  | ({ control: 'review_back' } & MyListBase)
  | ({
      control: 'save_committed'
      additions_count: number
      removals_count: number
      metadata_updated: boolean
      format_persisted: boolean
      editor_mode: 'review'
      list_id: MyListListId
    })
  | ({
      control: 'copy'
      copy_source: 'display' | 'edit' | 'review'
    } & MyListBase)
  | ({ control: 'bug_report_open' } & MyListBase)
  | ({
      control: 'format_select'
      deck_format: DeckFormat
      previous_format: DeckFormat
    } & MyListBase)
  | ({
      control: 'export_outlink'
      deck_format: DeckFormat
      outlink_id: MyListExportOutlinkId
    } & MyListBase)
  | ({
      control: 'preserve_toggle'
      preserve_kind: 'tags' | 'collection' | 'variants'
      enabled: boolean
    } & MyListBase)
  | ({
      control: 'review_filter_toggle'
      filter: 'added' | 'removed' | 'unchanged'
      visible: boolean
    } & MyListBase)
  | ({ control: 'validation_panel_toggle'; expanded: boolean } & MyListBase)
  | ({
      control: 'quick_fix_apply'
      line_index: number
      fix_index: number
    } & MyListBase)
  | ({ control: 'quick_fix_apply_all'; fix_count: number } & MyListBase)
  | ({ control: 'deck_paste'; from_mode: 'init' | 'edit' } & MyListBase)

export function captureMyListInteracted(params: MyListInteractedPayload): void {
  captureEvent('my_list_interacted', params)
}
