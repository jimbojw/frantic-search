# Spec 161: Search Results PostHog Events

**Status:** Implemented

**Depends on:** Spec 085 (PostHog Analytics), Spec 124 (Search Results List Controls), Spec 160 (Card Detail Analytics — list payload parity)

## Goal

Instrument the search results surface ([`app/src/SearchResults.tsx`](app/src/SearchResults.tsx)) so PostHog receives structured events for opening card detail, navigating to all printings from list popovers, copying card names, and list add/remove—without overloading `ui_interacted` and without duplicating `suggestion_applied`, `scryfall_outlink_clicked`, or histogram `ui_interacted` (already wired via pane state).

## Event

- **Name:** `search_results_interacted`
- **Capture:** `captureSearchResultsInteracted(params)` in [`app/src/analytics.ts`](app/src/analytics.ts) — same dev / console / production behavior as other analytics helpers (Spec 085).

## Payload schema

Discriminated by `control` (required). `view_mode` is always the pane’s active view mode (`slim` \| `detail` \| `images` \| `full`). `row_kind` distinguishes card-index rows vs printing-expanded rows. `pane_id` is included when the pane is in dual-wield (`left` \| `right`); omitted in single-pane layouts.

| `control` | When | Properties |
|-----------|------|------------|
| `open_card` | User opens card detail from a result (image, name button, or [`CardFaceRow`](app/src/CardFaceRow.tsx) name control with `onCardClick`) | `scryfall_id: string`, `view_mode`, `row_kind: 'cards' \| 'printings'`, `pane_id?` |
| `all_prints` | List popover thumbnail runs `navigateToQuery` with the unique-printings query (name available) | `view_mode`, `row_kind`, `pane_id?` — do **not** send the query string (contains card name; redundant with `search_executed`). |
| `name_copy` | Card name copied via [`CopyButton`](app/src/CopyButton.tsx) / `CardFaceRow` on results | `view_mode`, `row_kind`, `pane_id?` — fire only after `clipboard.writeText` succeeds. |
| `list_add` | Add in [`ListControlsPopover`](app/src/ListControlsPopover.tsx) on results | Same list fields as Spec 160 `list_add` (`list_scope`, `oracle_id`, `finish`, `scryfall_id` when printing), plus `view_mode`, `row_kind`, `pane_id?`. |
| `list_remove` | Remove in the same popover | Same as `list_add`. |

## Privacy and volume

- Do not attach card names or full query strings to this event; use `scryfall_id` / `oracle_id` where identifiers are needed (same class as Spec 160).
- `open_card` is high-volume by design; dashboards should expect many events per session.

## Out of scope (v1)

- Infinite scroll / intersection observer (indirect, not a discrete gesture).
- [`ResultsSummaryBar`](app/src/ResultsSummaryBar.tsx) **Try on Scryfall** (`scryfall_outlink_clicked` already).
- [`SuggestionList`](app/src/SuggestionList.tsx) (`suggestion_applied` already).
- [`ResultsBreakdown`](app/src/ResultsBreakdown.tsx) / histogram chrome (`ui_interacted` for histogram toggle already via `toggleHistograms` in pane state).
- Empty-state **Report a problem** / GitHub link (bug report uses existing `ui_interacted` when routed through `navigateToReport`).

## Implementation notes

- Do not modify shared `ListControls` / `ListControlsPopover`; wrap `onAdd` / `onRemove` and navigation handlers at the `SearchResults` call sites.
- Optional `onCopySuccess` on `CopyButton`; optional `onCopyCardName` on `CardFaceRow` delegates to it for results-only instrumentation.
- **2026-03-25:** Initial implementation.

## Acceptance criteria

1. Each row in the payload table fires at most one `search_results_interacted` per successful user gesture (or none where out of scope).
2. Production builds with PostHog configured send events; dev / missing key: no throw, same as other captures.
3. Spec 085 lists `search_results_interacted` and references this spec.
