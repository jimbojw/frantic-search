# Spec 160: Card Detail Page PostHog Events

**Status:** Implemented

**Depends on:** Spec 085 (PostHog Analytics), Spec 015 (Card Detail Page), Spec 050 (Printing-Aware Card Detail), Spec 106 (Card Detail Tags)

**Extended by:** [Spec 165](165-card-detail-app-bar-and-copy-menu.md) (persistent header Copy… menu), [Spec 166](166-card-detail-body-cleanup.md) (body cleanup, Scryfall ID outlink).

## Goal

Instrument the card detail view ([`app/src/CardDetail.tsx`](app/src/CardDetail.tsx)) so PostHog receives structured events for navigational, copy, and list controls—without overloading `ui_interacted` (which only supports `toggled` / `clicked`) and without conflating the metadata Scryfall ID outlink with **Try on Scryfall** (`scryfall_outlink_clicked`, Spec 152).

## Event

- **Name:** `card_detail_interacted`
- **Capture:** `captureCardDetailInteracted(params)` in [`app/src/analytics.ts`](app/src/analytics.ts) — `posthog.capture('card_detail_interacted', params)` with the same dev / no-key no-op behavior as other analytics helpers.

## Payload schema

Discriminated by `control` (required on every payload). Optional fields apply only where noted.

| `control` | When | Properties |
|-----------|------|------------|
| `back` | Header back → `history.back()` | — |
| `scryfall_external` | Printing metadata **Scryfall ID** outlink opens Scryfall card page (`target="_blank"`) | — |
| `all_prints` | All-prints query chip click (entire chip, including count row) runs `onNavigateToQuery` with the unique-prints query | Do **not** send the full query string (contains card name; redundant with `search_executed` after navigation). |
| `set_unique_prints` | Set row button → `s:{code} unique:prints` | `set_code: string` |
| `face_toggle` | DFC front/back image toggle | `face: 'front' \| 'back'` (face shown after the click) |
| `card_copy_menu_opened` | User opened **Copy…** on the card header (Spec 165) | — |
| `card_copy_url` | Header Copy… → **URL (as is)** (`location.href`), clipboard success | — |
| `card_copy_url_card_only` | Header Copy… → **URL (card only)** (`?card=` only), clipboard success | — |
| `card_copy_name` | Header Copy… → Card name (plain text) | — |
| `card_copy_markdown` | Header Copy… → Markdown link | — |
| `card_copy_slack_reddit` | Header Copy… → Slack/Reddit bracket line | — |
| `otag_nav` | Tag chip click (entire chip, including count row) → search with `otag:label` | `tag_label: string` |
| `atag_nav` | Tag chip click (entire chip, including count row) → search with `atag:label` | `tag_label: string` |
| `list_add` | **Increment** on card detail **My List** controls (List Actions section only) | `list_scope: 'oracle' \| 'printing'`; always `oracle_id: string` (Scryfall oracle id). Always `finish: 'nonfoil' \| 'foil' \| 'etched'` — same strings as `FINISH_TO_STRING` in app-utils (`nonfoil` for oracle-level list actions; printing rows use that row’s finish). When `list_scope === 'printing'`, also `scryfall_id: string` for that printing’s Scryfall card id. |
| `list_remove` | **Decrement** on the same surface | Same as `list_add`. |

## Privacy and volume

- Do not attach card names or full `!"…" unique:prints` strings to this event. List events use **oracle_id** and optional **scryfall_id** (stable Scryfall identifiers), not display names.
- Tag labels are game metadata (same class as menu drawer chip labels).
- List events on card detail are scoped to that surface; search results use **`search_results_interacted`** (Spec 161).

## Out of scope (v1)

- **Search results** list popovers and result rows: Spec 161 (`search_results_interacted`), not `card_detail_interacted`.

## Implementation notes

- Card detail may use **card-detail-local** increment/decrement controls for List Actions ([Spec 183](183-card-detail-sections-query-chips-outlinks.md) §1); they need not be the shared [`ListControls`](app/src/ListControls.tsx) component as long as `list_add` / `list_remove` payloads match this spec. If shared `ListControls` is used, do not change its public API for card-detail-only layout; prefer wrapping at the card-detail call site or local buttons.
- Navigation captures fire immediately before invoking `onNavigateToQuery` / `history.back` (or on link click for Scryfall).
- Clipboard captures fire inside the `writeText` fulfillment path.
- **2026-04-09 (Spec 183 §1):** `list_add` / `list_remove` describe increment/decrement on the card detail **List Actions** surface; the physical control may be card-detail-local ([Spec 183](183-card-detail-sections-query-chips-outlinks.md) §1), not necessarily shared `ListControls`.
- **2026-04-06 (Spec 183):** Added `query_chip` (`field` + `query`) and `outlink` (`destination: OutlinkDestination`) controls for card-detail query chips and external links. Scryfall in-body outlink uses unified `outlink` with `destination: 'scryfall_card'`; the legacy `scryfall_external` control is retained for backward compatibility but the Outlinks section uses `outlink`. `OutlinkDestination` is `'scryfall_card' | 'edhrec_commander' | 'edhrec_card' | 'manapool' | 'tcgplayer'`.
- **2026-03-24:** List payloads include `oracle_id`, `finish` (`nonfoil` \| `foil` \| `etched`, matching `FINISH_TO_STRING`), and `scryfall_id` when `list_scope === 'printing'`.
- **2026-03-28 (Spec 166):** Removed `slack_copy` (inline Slack row removed; use `card_copy_slack_reddit` from the header Copy… menu). `scryfall_external` applies to the metadata Scryfall ID link only. Removed `all_prints_copy`, `otag_copy`, and `atag_copy` — card detail query/tag chips are navigate-only; users copy from the header Copy… menu on the resulting search (Spec 106 / 166).

## Acceptance criteria

1. Each interactable in the table above fires exactly one `card_detail_interacted` per successful user gesture.
2. Production builds with PostHog configured send events; dev / missing key: no throw, same as other captures.
3. Spec 085 lists `card_detail_interacted` and references this spec.
