# Spec 106: Card Detail Tags (otags and atags)

**Status:** Implemented

**Depends on:** Spec 050 (Printing-Aware Card Detail), Spec 092 (Tag Data Model), Spec 093 (Evaluator Tag Queries)

**Issue:** https://github.com/jimbojw/frantic-search/issues/105

## Goal

On the card detail page, after the block showing format legalities, show all otags (oracle tags) for that card object and all atags (illustration tags) that map to the displayed printing's illustration. Tags are links to queries and have a copy button.

## Background

Spec 092 produces `otags.json` (label → canonical face indices) and `atags.json` (label → printing row indices, resolved at load time). Spec 093 wires these for search evaluation. The tag data lives in the worker; the main thread only receives tag label lists for autocomplete (Spec 094).

To show tags on the card detail page, we need the **reverse lookup**: given a canonical face index, which otags contain it? Given a printing row index, which atags contain it? The issue suggests pre-computing these reverse indexes once at worker initialization.

## Requirements

- **otags:** All tags for the card object (canonical face index). One lookup per card.
- **atags:** All tags for the displayed printing's illustration (primary printing row index). Use `printingIndices[0]` as the displayed printing.
- **Tags as links:** Each tag links to a query (`otag:label` or `atag:label`) and navigates via `onNavigateToQuery`.
- **Copy button:** Each tag has a copy button that copies the query string to the clipboard (same UX as the Slack bot copy in CardDetail).
- **Pre-compute:** Build reverse indexes (face → otags, printing → atags) once when tag data loads; do not recompute per request.

## Technical Details

### Reverse Indexes

**faceToOtags:** `Map<number, string[]>` — for each canonical face index, the list of otag labels that include it. Built when `otags.json` loads by iterating `Object.entries(otags)` and for each `(label, faceIndices)`, pushing `label` into the array for each `faceIndices` entry.

**printingToAtags:** `Map<number, string[]>` — for each printing row index, the list of atag labels that include it. Built when `atags.json` is resolved to printing rows by iterating the resolved `Map<string, Uint32Array>` and for each `(label, printingIndices)`, pushing `label` into the array for each printing index.

### Worker Protocol

**ToWorker:** Add `{ type: 'get-tags-for-card'; canonicalIndex: number; primaryPrintingIndex?: number }`

**FromWorker:** Add `{ type: 'card-tags'; otags: { label: string; cards: number }[]; atags: { label: string; prints: number }[] }`

The worker handles `get-tags-for-card` by looking up `faceToOtags.get(canonicalIndex)` (default `[]`) and `printingToAtags.get(primaryPrintingIndex)` when `primaryPrintingIndex` is defined (default `[]`). For each tag label, it includes the match count: `cards` from `tagDataRef.oracle[label].length` (otags), `prints` from `tagDataRef.illustration.get(label).length` (atags). Then posts `card-tags`.

### Main Thread

- Add `cardTags` signal: `{ otags: string[]; atags: string[] } | null`
- Handle `card-tags` in `worker.onmessage`; set `cardTags` from the payload
- When `view() === 'card'` and `resolvedCI()` is defined, send `get-tags-for-card` with `canonicalIndex: resolvedCI()` and `primaryPrintingIndex: printingPIs()?.[0]`
- Pass `otags` and `atags` from `cardTags` into `CardDetail` (or empty arrays when null)

### CardDetail UI

- Add props: `otags?: string[]`, `atags?: string[]` (in addition to existing `onNavigateToQuery`)
- Add two sections after Format Legality: "Function Tags" (otags) and "Illustration Tags" (atags). Each section has its own heading and flex-wrap container of tag chips. Sections are shown only when they have tags.
- **TagChip component:** Displays `otag:label` or `atag:label` (full query syntax) with syntax highlighting via `buildSpans` and `ROLE_CLASSES` (same as MenuDrawer chips). Two-line layout: top line shows the query label; bottom line shows match count — "N cards" for otags, "M prints" for atags (same format as unified breakdown chips). Chip height and styling matches MenuDrawer (`min-h-11`, `rounded`, `text-xs font-mono`). Includes a copy button. Use the same copy feedback pattern as the Slack bot reference (brief "copied" state, 1.5s timeout).

**PostHog:** Tag navigate and copy fire `card_detail_interacted` with controls `otag_nav`, `atag_nav`, `otag_copy`, `atag_copy` and `tag_label` (Spec 160).

### Placement

The Function Tags and Illustration Tags sections appear after the Format Legality section, before the end of the card detail content. Same visual style as Format Legality (section heading, content below).

## Edge Cases

- **Tags not loaded yet:** Send `get-tags-for-card` only when tag data is available, or send anyway and return empty arrays. Prefer: send when both reverse maps exist; otherwise return `[]` for the missing side.
- **Card not in index:** Skip request when `resolvedCI()` is undefined.
- **Multi-face cards:** otags are per canonical face; one canonical index covers the card. One lookup suffices.
- **Multiple printings:** Use `printingIndices[0]` for atags (the displayed/primary printing).
- **No printing data:** `primaryPrintingIndex` is undefined; atags will be `[]`.

## File Organization

| File | Changes |
|------|---------|
| `shared/src/worker-protocol.ts` | Add `get-tags-for-card` to ToWorker, `card-tags` to FromWorker |
| `app/src/worker.ts` | Build `faceToOtags` and `printingToAtags`; handle `get-tags-for-card` |
| `app/src/App.tsx` | Add `cardTags` signal; handle `card-tags`; send `get-tags-for-card` when viewing card; pass tags to CardDetail |
| `app/src/CardDetail.tsx` | Add `otags`, `atags` props; add Tags section with TagChip component |

## Acceptance Criteria

1. On the card detail page, after Format Legality, a "Function Tags" section appears when the card has otags; an "Illustration Tags" section appears when the card has atags.
2. Oracle tags (otags) are shown in the Function Tags section for the card object.
3. Illustration tags (atags) are shown in the Illustration Tags section for the displayed printing's artwork.
4. Each tag displays the full query syntax (e.g. `otag:ramp`, `atag:chair`) with syntax highlighting matching MenuDrawer chips.
5. Each tag is clickable and navigates to a search for that tag.
6. Each tag has a copy button that copies the query string to the clipboard.
7. Tag chips use the same height and styling as MenuDrawer chips (`min-h-11`, `text-xs font-mono`).
8. Each tag chip shows a second line with match count: "N cards" for otags, "M prints" for atags (same format as unified breakdown chips).
9. When no tags exist for the card, both tag sections are hidden.
10. Tags load asynchronously; the sections update when the worker responds.
11. Card detail works when tag data has not loaded (empty arrays, sections hidden).

## Implementation Notes

- 2026-03-08: Implemented per spec. Added `get-tags-for-card` / `card-tags` to worker protocol; built `faceToOtags` and `printingToAtags` reverse indexes in worker; App.tsx sends request when viewing card and passes tags to CardDetail; CardDetail renders Function Tags and Illustration Tags as separate sections with TagChip (syntax-highlighted `otag:value`/`atag:value`, link + copy button, same height as MenuDrawer chips) after Format Legality.
- 2026-03-08: Added match counts to card-tags response. Tag chips now have two lines: top line shows the query label; bottom line shows "N cards" (otags) or "M prints" (atags), matching unified breakdown chip format.
