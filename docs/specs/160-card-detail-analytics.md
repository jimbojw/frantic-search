# Spec 160: Card Detail Page PostHog Events

**Status:** Implemented

**Depends on:** Spec 085 (PostHog Analytics), Spec 015 (Card Detail Page), Spec 050 (Printing-Aware Card Detail), Spec 106 (Card Detail Tags)

**Extended by:** [Spec 165](165-card-detail-app-bar-and-copy-menu.md) (persistent header Copy… menu).

## Goal

Instrument the card detail view ([`app/src/CardDetail.tsx`](app/src/CardDetail.tsx)) so PostHog receives structured events for navigational, copy, and list controls—without overloading `ui_interacted` (which only supports `toggled` / `clicked`) and without conflating the header Scryfall link with **Try on Scryfall** (`scryfall_outlink_clicked`, Spec 152).

## Event

- **Name:** `card_detail_interacted`
- **Capture:** `captureCardDetailInteracted(params)` in [`app/src/analytics.ts`](app/src/analytics.ts) — `posthog.capture('card_detail_interacted', params)` with the same dev / no-key no-op behavior as other analytics helpers.

## Payload schema

Discriminated by `control` (required on every payload). Optional fields apply only where noted.

| `control` | When | Properties |
|-----------|------|------------|
| `back` | Header back → `history.back()` | — |
| `scryfall_external` | Header ↗ opens Scryfall card page (`target="_blank"`) | — |
| `all_prints` | “All prints →” runs `onNavigateToQuery` with the unique-prints query | Do **not** send the full query string (contains card name; redundant with `search_executed` after navigation). |
| `set_unique_prints` | Set row button → `s:{code} unique:prints` | `set_code: string` |
| `face_toggle` | DFC front/back image toggle | `face: 'front' \| 'back'` (face shown after the click) |
| `slack_copy` | Inline Slack bot reference row → clipboard | Fire only after `clipboard.writeText` succeeds (same as UI “copied” feedback). |
| `card_copy_menu_opened` | User opened **Copy…** on the card header (Spec 165) | — |
| `card_copy_url` | Header Copy… → **URL (as is)** (`location.href`), clipboard success | — |
| `card_copy_url_card_only` | Header Copy… → **URL (card only)** (`?card=` only), clipboard success | — |
| `card_copy_name` | Header Copy… → Card name (plain text) | — |
| `card_copy_markdown` | Header Copy… → Markdown link | — |
| `card_copy_slack_reddit` | Header Copy… → Slack/Reddit bracket line | — |
| `otag_nav` | Tag chip primary action → search with `otag:label` | `tag_label: string` |
| `atag_nav` | Tag chip primary action → search with `atag:label` | `tag_label: string` |
| `otag_copy` | Tag chip copy button | `tag_label: string` |
| `atag_copy` | Tag chip copy button | `tag_label: string` |
| `list_add` | Add on [`ListControls`](app/src/ListControls.tsx) on card detail only | `list_scope: 'oracle' \| 'printing'`; always `oracle_id: string` (Scryfall oracle id). Always `finish: 'nonfoil' \| 'foil' \| 'etched'` — same strings as `FINISH_TO_STRING` in app-utils (`nonfoil` for oracle-level list actions; printing rows use that row’s finish). When `list_scope === 'printing'`, also `scryfall_id: string` for that printing’s Scryfall card id. |
| `list_remove` | Remove on same | Same as `list_add`. |

## Privacy and volume

- Do not attach card names or full `!"…" unique:prints` strings to this event. List events use **oracle_id** and optional **scryfall_id** (stable Scryfall identifiers), not display names.
- Tag labels are game metadata (same class as menu drawer chip labels).
- List events on card detail are scoped to that surface; search results use **`search_results_interacted`** (Spec 161).

## Out of scope (v1)

- **Search results** list popovers and result rows: Spec 161 (`search_results_interacted`), not `card_detail_interacted`.

## Implementation notes

- Do not modify shared `ListControls`; wrap `onAdd` / `onRemove` at card-detail call sites.
- Navigation captures fire immediately before invoking `onNavigateToQuery` / `history.back` (or on link click for Scryfall).
- Clipboard captures fire inside the `writeText` fulfillment path.
- **2026-03-24:** List payloads include `oracle_id`, `finish` (`nonfoil` \| `foil` \| `etched`, matching `FINISH_TO_STRING`), and `scryfall_id` when `list_scope === 'printing'`.

## Acceptance criteria

1. Each interactable in the table above fires exactly one `card_detail_interacted` per successful user gesture.
2. Production builds with PostHog configured send events; dev / missing key: no throw, same as other captures.
3. Spec 085 lists `card_detail_interacted` and references this spec.
