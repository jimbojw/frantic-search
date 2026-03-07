# Spec 087: Aggregation Counts

**Status:** Implemented

**Depends on:** Spec 048 (Printing-Aware Display), Spec 041 (Result Display Modes)

## Goal

When deduplication has occurred, individual cards in Images|Full, and rows in Slim|Detail represent many printings consolidated into a single record. Show the count of how many printings are being aggregated together so users understand the scope of each displayed item.

## Background

Frantic Search deduplicates search results by default. A card-level query like `ci:boros` yields many printings of many cards, but only the canonical printing of any card is shown by default. The `unique:` term allows overriding this deduplication in Images and Full modes (Spec 048).

When `unique:cards` (default) or `unique:art` is in effect, each displayed item represents one or more printings. For example, Lightning Bolt in a `ci:boros` search has dozens of printings; the displayed row shows one, but the user has no indication that it aggregates many. This spec adds that indication.

## Scope

- **When to show:** Only when `printingIndices` is present and deduplication occurred. That is `uniqueMode` is `cards` or `art`, and the displayed item aggregates more than one printing.
- **When not to show:** `unique:prints` — each item = 1 printing; no count shown. No count when `printingIndices` is absent (pure card-level results).

## Display Rules

### Slim and Detail views

- One row per card per Spec 048. When printing results are present and the card aggregates multiple printings, show a small count in parentheses underneath the thumbnail (ArtCrop).
- Placement: below the thumbnail, muted text, e.g. `(12)`.
- Only show when count > 1.

### Images view

- Reuse the existing meta bar (set code, rarity, finish) beneath each image. Append the aggregation count when > 1, e.g. ` · 12 printings` or `12×`.
- Format: `{count} printings` or `{count}×` — compact, consistent with existing meta bar style.

### Full view

- Same as Images: add the count to the metadata area when count > 1. The Full view has a metadata panel (set, collector #, rarity, finish, price); append the count there or in a dedicated line when aggregated.

## Aggregation Count Logic

### Per unique mode

- **`unique:cards`:** Group raw `printingIndices` by `canonical_face_ref`. For each displayed item (printing index or canonical face index), count = number of printings in that card's group.
- **`unique:art`:** Group by `(canonical_face_ref, illustration_id_index)`. For each displayed item (printing index), count = number of printings in that artwork's group.
- **`unique:prints`:** No deduplication; each item = 1. Do not show count.

### Data sources

- **Slim/Detail:** Use canonical face indices; count = printings per `canonical_face_ref` from `printingIndices`.
- **Images/Full:** Use deduped printing indices; for each displayed printing index, count = size of its group in the raw `printingIndices` (grouped by the same key used for deduplication).

## Implementation Notes

### Files to change

| File | Change |
|------|--------|
| `app/src/dedup-printing-items.ts` | Add `aggregationCountsPerDisplayItem()` or extend `dedupePrintingItems` to return counts. |
| `app/src/DualWieldLayout.tsx` | Add `aggregationCountMap` memo in `buildPaneContext`; expose via context. |
| `app/src/SearchContext.tsx` | Add `aggregationCount: (key: number) => number` to context interface. |
| `app/src/SearchResults.tsx` | Render count in Slim, Detail, Images, Full when count > 1. |

### Edge cases

- No printing data: `printingIndices` absent → no count. Fallback to canonical cards only.
- Pinned + live: `printingIndices` is already combined; aggregation counts derived from combined list.
- `include:extras` hidden: count reflects displayed `printingIndices`; no special handling.

## Acceptance Criteria

1. `ci:boros` in Images (unique:cards) shows aggregation count under each image when the card has multiple printings.
2. `ci:boros` in Slim/Detail with printing conditions shows `(N)` under thumbnail when N > 1.
3. `ci:boros unique:prints` shows no count (each tile = 1 printing).
4. `unique:art` with multiple printings per artwork shows count when > 1.
5. Count is 1: do not show (avoid redundant "(1)" everywhere).

## Implementation Notes

- 2026-03-07: Implemented. Added `aggregationCounts()` in `dedup-printing-items.ts` returning `{ byCard, byPrinting }`. Slim/Detail show `(N)` under thumbnail; Images meta bar appends ` · N printings`; Full adds Printings row to metadata panel. All only when count > 1.
- 2026-03-07: Card-level queries (e.g. `t:basic -snow`) did not show aggregation counts because the evaluator only returns `printingIndices` for printing conditions or `unique:prints`/`unique:art`. Added worker-side expansion in `worker-search.ts`: when `printingIndices` is undefined but `printingIndex` exists and there are matching cards, expand to all printings of those cards so the display can compute aggregation counts.
- 2026-03-07: For `my:list` queries, aggregation counts now reflect list entry count per card (e.g. generic Bolt + specific Bolt printing = 2), not total printings in the database. Added `countListEntriesPerCard` in `list-mask-builder.ts`, `hasMyInQuery` in `query-edit.ts`; when `my:` is in the effective query, use list entry count instead of printing-based aggregation.
