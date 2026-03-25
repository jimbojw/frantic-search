# Spec 160: Card Detail Page PostHog Events

**Status:** Implemented

**Depends on:** Spec 085 (PostHog Analytics), Spec 015 (Card Detail Page), Spec 050 (Printing-Aware Card Detail), Spec 106 (Card Detail Tags)

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
| `slack_copy` | Slack bot reference copied to clipboard | Fire only after `clipboard.writeText` succeeds (same as UI “copied” feedback). |
| `otag_nav` | Tag chip primary action → search with `otag:label` | `tag_label: string` |
| `atag_nav` | Tag chip primary action → search with `atag:label` | `tag_label: string` |
| `otag_copy` | Tag chip copy button | `tag_label: string` |
| `atag_copy` | Tag chip copy button | `tag_label: string` |
| `list_add` | Add on [`ListControls`](app/src/ListControls.tsx) on card detail only | `list_scope: 'oracle' \| 'printing'`; always `oracle_id: string` (Scryfall oracle id). Always `finish: 'nonfoil' \| 'foil' \| 'etched'` — same strings as `FINISH_TO_STRING` in app-utils (`nonfoil` for oracle-level list actions; printing rows use that row’s finish). When `list_scope === 'printing'`, also `scryfall_id: string` for that printing’s Scryfall card id. |
| `list_remove` | Remove on same | Same as `list_add`. |

## Privacy and volume

- Do not attach card names or full `!"…" unique:prints` strings to this event. List events use **oracle_id** and optional **scryfall_id** (stable Scryfall identifiers), not display names.
- Tag labels are game metadata (same class as menu drawer chip labels).
- List events are scoped to the card detail surface only; search-result list popovers are out of scope (see below).

## Out of scope (v1)

- **Search results** [`ListControlsPopover`](app/src/ListControlsPopover.tsx) / result rows: not instrumented here. A follow-up may reuse `card_detail_interacted` with a `surface` property or introduce a separate event.

## Implementation notes

- Do not modify shared `ListControls`; wrap `onAdd` / `onRemove` at card-detail call sites.
- Navigation captures fire immediately before invoking `onNavigateToQuery` / `history.back` (or on link click for Scryfall).
- Clipboard captures fire inside the `writeText` fulfillment path.
- **2026-03-24:** List payloads include `oracle_id`, `finish` (`nonfoil` \| `foil` \| `etched`, matching `FINISH_TO_STRING`), and `scryfall_id` when `list_scope === 'printing'`.

## Acceptance criteria

1. Each interactable in the table above fires exactly one `card_detail_interacted` per successful user gesture.
2. Production builds with PostHog configured send events; dev / missing key: no throw, same as other captures.
3. Spec 085 lists `card_detail_interacted` and references this spec.
