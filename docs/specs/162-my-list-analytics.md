# Spec 162: My List (Deck Editor) PostHog Events

**Status:** Implemented

**Depends on:** Spec 085 (PostHog Analytics), Spec 090 (Lists Page), Spec 110 (Hybrid Deck Editor), Spec 119 (Deck Editor Review Step), Spec 118 (Deck Editor Bug Report), Spec 121 (My List Printing Domain)

## Goal

Instrument the My List surface—[`app/src/ListsPage.tsx`](app/src/ListsPage.tsx) and the deck editor under [`app/src/deck-editor/`](app/src/deck-editor/)—so PostHog receives structured events for navigation, editing, review, save, export-format selection, partner outlinks, preserve/review filters, validation UI, and clipboard copy. Use a dedicated event rather than overloading `ui_interacted` (which only supports `toggled` / `clicked`).

Shell navigation into My List remains **`ui_interacted`** with `element_name: 'lists'` (existing behavior in [`app/src/App.tsx`](app/src/App.tsx) `navigateToLists`); this spec covers **in-page** gestures only.

## Event

- **Name:** `my_list_interacted`
- **Capture:** `captureMyListInteracted(params)` in [`app/src/analytics.ts`](app/src/analytics.ts) — `posthog.capture('my_list_interacted', params)` with the same dev / no-key / Vitest behavior as other analytics helpers (Spec 085).

## Payload schema

Discriminated by `control` (required on every payload).

### Base properties (every payload)

| Property | Type | Notes |
|----------|------|--------|
| `list_id` | `'default' \| 'trash'` | Same strings as `DEFAULT_LIST_ID` / `TRASH_LIST_ID` in shared (`'default'` \| `'trash'`). |
| `editor_mode` | `'init' \| 'display' \| 'edit' \| 'review'` | [`EditorMode`](app/src/deck-editor/types.ts) **at the time of the gesture** (e.g. `back` fires from the lists header while the editor may be in any mode—use the editor’s current mode). |

### Optional context (when meaningful)

| Property | Type | When to include |
|----------|------|----------------|
| `deck_format` | `DeckFormat` | When the export-format row is relevant: user just selected a format, or the gesture is tied to the active export format (outlinks, `format_select`). Use the same `DeckFormat` string ids as [`ALL_FORMATS`](app/src/deck-editor/serialization.ts) / shared (`archidekt`, `arena`, `manapool`, `melee`, `moxfield`, `mtggoldfish`, `mtgsalvation`, `tappedout`, `tcgplayer`). |

### Controls

| `control` | When | Properties |
|-----------|------|------------|
| `back` | Lists page header back → `history.back()` | Base only. |
| `view_in_search` | Toolbar **View** → `onViewInSearch` / `navigateToViewList` | Base only. |
| `edit_open` | Toolbar **Edit** from display mode | Base only. |
| `cancel_edit` | Toolbar **Cancel** (only shown in edit mode when there are no pending edits—the **Revert** control covers the dirty state) | Base only. |
| `revert` | Toolbar **Revert** restores baseline text | Base only. |
| `review_open` | Toolbar **Review** (visible when edit diff has additions or removals) | `additions_count: number`, `removals_count: number` (from edit diff summary after preserve enrichment, same as UI). |
| `review_back` | Review toolbar **Edit** returns to edit mode | Base only. |
| `save_committed` | **Save** completes successfully after `applyDiff` (not on validation failure or early return) | `additions_count`, `removals_count`, `metadata_updated`, `format_persisted` — see [`save_committed` payload](#save_committed-payload) below. |
| `copy` | Toolbar **Copy** — `clipboard.writeText` succeeds | `copy_source: 'display' \| 'edit' \| 'review'` (which snapshot was copied: serialized list, raw draft, or post-review “would commit” text). |
| `bug_report_open` | Toolbar **Bug** → `onDeckReportClick` / deck report route | Base only. |
| `format_select` | User selects a **different** export format chip (display or review) | `deck_format` (new selection), `previous_format: DeckFormat` (prior selection). Do **not** fire when the user clicks the already-selected chip. |
| `export_outlink` | User activates a partner / import-help **link** in the format hint row ([`DeckEditorFormatChips.tsx`](app/src/deck-editor/DeckEditorFormatChips.tsx)) | `deck_format`, `outlink_id` — see table below. Fire on click / activation. |
| `preserve_toggle` | **Preserve when merging** chip (Tags, Collection, Variants) | `preserve_kind: 'tags' \| 'collection' \| 'variants'`, `enabled: boolean` (state after the click). Omit or do not fire when the chip is disabled (count zero)—no user-togglable gesture. |
| `review_filter_toggle` | Review row **Added** / **Removed** / **Unchanged** visibility | `filter: 'added' \| 'removed' \| 'unchanged'`, `visible: boolean` (state after the click). Omit or do not fire when the chip is disabled (count zero). |
| `validation_panel_toggle` | Expand or collapse the validation errors header in edit mode | `expanded: boolean` (state after the click). |
| `quick_fix_apply` | Single-line quick-fix button applied | `line_index: number` (0-based deck line index), `fix_index: number` (index into that line’s `quickFixes`). Do **not** send fix labels or replacement text (may contain card names). |
| `quick_fix_apply_all` | **Apply all quick fixes** (or single-line button when only one fixable error) | `fix_count: number` (errors fixed in that batch). |
| `deck_paste` | `paste` event on the deck textarea | `from_mode: 'init' \| 'edit'` (whether the list was empty init state or already editing). One event per paste gesture, not per line. |

### save_committed payload

- **`additions_count` / `removals_count`:** Counts from the committed diff after preserve enrichment—the same notion as the review/save pipeline, not a second definition.
- **`metadata_updated`:** `true` if this save run updates list metadata **because import produced** a deck name and/or tag colors (`importDeckList` → `updateListMetadata`). `false` when that branch does not run (e.g. only line/instance changes). Not for manual renames outside the save path.
- **`format_persisted`:** `true` if this save run **detected** a format and persisted it (`setSelectedFormat` and storage write on the save path). `false` when no detected format was written in that run.
- **`editor_mode` (base):** Must be **`review`**. Emit `save_committed` in the success path **before** tearing down review/edit state (e.g. before `handleCancel` after a successful save). If capture ran only after that teardown, mode would flip to `display` / `init` and no longer describe the gesture.

### `outlink_id` values (`export_outlink`)

Stable enum for dashboard breakdowns; **do not** send full URLs.

| `outlink_id` | `deck_format` when shown |
|--------------|---------------------------|
| `archidekt_sandbox` | `archidekt` |
| `arena_import_guide` | `arena` |
| `manapool_mass_entry` | `manapool` |
| `melee_decklist_docs` | `melee` |
| `moxfield_personal_decks` | `moxfield` |
| `mtggoldfish_new_deck` | `mtggoldfish` |
| `tappedout_paste` | `tappedout` |
| `tcgplayer_mass_entry` | `tcgplayer` |

**MTG Salvation** (`mtgsalvation`): the hint row has no anchor in v1 UI—no `export_outlink` until a link exists.

## Privacy and volume

- Do **not** attach raw deck text, full queries, card names, oracle ids, or fix label strings to `my_list_interacted`.
- Numeric counts (`additions_count`, `removals_count`, `fix_count`, line/fix indices) and enums are acceptable for volume and funnels.
- `list_id` is a stable list key, not end-user PII.

## Out of scope (v1)

- **Per-keystroke** or debounced validation streaming (`onInput`); only discrete UI gestures.
- **Shell “My list”** / **`navigateToLists`** (`ui_interacted` already).
- **URL-only** `list=trash` changes with no new visible tab control (no extra event unless a future tab UI is added).
- **Search** after **View** (`search_executed` already covers the resulting query).
- **List add/remove from search results** (Spec 161).

## Implementation notes

- Prefer wrapping existing handlers in [`DeckEditor.tsx`](app/src/deck-editor/DeckEditor.tsx) / [`ListsPage.tsx`](app/src/ListsPage.tsx) (or a small callback prop from `DeckEditor` into children) rather than importing analytics from many leaves—keep [`ListControls`](app/src/ListControls.tsx)-style shared components untouched if this surface does not use them.
- Navigation-style captures (`back`, `view_in_search`, `bug_report_open`) fire immediately before the navigation side effect (or on link click for outlinks).
- Clipboard (`copy`) fires only inside the `writeText` fulfillment path (same as Spec 160 header Copy… and other clipboard controls).
- **`format_select`:** compare new `DeckFormat` to `selectedFormat()` before writing storage; skip capture if unchanged.
- **Spec 085:** When implementation lands, add `my_list_interacted` to the Spec 085 event schema table in the same style as `card_detail_interacted` / `search_results_interacted` (control-based payload summary + pointer to this spec).
- **Tests:** Optional Vitest coverage for `captureMyListInteracted` and discriminated payload shapes, consistent with other `capture*` helpers.
- **2026-03-25:** Initial implementation.

## Acceptance criteria

1. Each row in the controls table yields **at most one** `my_list_interacted` per user gesture; omit the event when out of scope, when the control is disabled, or when the gesture does not succeed (e.g. clipboard API failure). For successful discrete toolbar toggles and buttons, expect **exactly one** event.
2. Production builds with PostHog configured send events; dev / missing key: no throw, same as other captures.
3. Spec 085 lists `my_list_interacted` and references this spec (when implementation lands).
