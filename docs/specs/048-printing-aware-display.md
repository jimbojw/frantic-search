# Spec 048: Printing-Aware Display

**Status:** Draft

**Depends on:** Spec 041 (Result Display Modes), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), ADR-017 (Dual-Domain Query Evaluation)

## Goal

Adapt the result display to show printing-specific information when the query contains printing-level conditions. Define how each view mode handles printing results and introduce the `unique:prints` modifier for showing all matching printings.

## Background

Currently, search results are a list of canonical face indices. Each result shows the oracle card's art crop or card image (via the oracle-level `scryfall_id`), name, type line, and other face-level data. There is no concept of "which printing" — results represent cards, not printings.

Spec 047 adds printing-level query fields (`set:`, `r:`, `is:foil`, `price:`, etc.) that evaluate in the printing domain. The evaluator returns both `indices` (matching canonical face indices, for card-level display) and `printingIndices` (matching printing rows, for printing-level display). This spec defines how the display layer uses `printingIndices`.

## Display Rules

### No printing conditions in query

Behavior is unchanged. Results are canonical face indices rendered as oracle cards. The oracle-level `scryfall_id` is used for art crops and card images.

### Printing conditions present

When the evaluator returns `printingIndices` (non-empty), the display adapts per view mode:

| View mode | Behavior |
|---|---|
| **Slim** | One row per card. Art crop uses the **first matching printing's** `scryfall_id` instead of the oracle card's. A small set code badge appears next to the name. |
| **Detail** | Same as Slim: one row per card, first matching printing's art and set badge. |
| **Images** | One image per **matching printing**. Each card may appear multiple times if multiple printings matched. Images use the printing's `scryfall_id`. A rarity/set overlay appears on each image. |
| **Full** | Same as Images: one row per matching printing. Card image and detail text, with set/rarity/price metadata displayed alongside. |

"First matching printing" means the first entry in `printingIndices` whose `canonical_face_ref` matches the card's canonical face index.

### `unique:prints` modifier

`unique:prints` is a special directive (not a filter) that forces Images and Full modes to show **all printings that survived the AST**, even for pure card-level queries. It has no effect on Slim and Detail modes (they always show one row per card).

When `unique:prints` is present and the query has no printing conditions, every printing of every matching card is shown in Images/Full. This is equivalent to Scryfall's `unique:prints` behavior.

`unique:prints` is parsed as a `FieldNode` with `field: "unique"` and `value: "prints"`. The evaluator does not process it as a filter — it is extracted before evaluation and passed as a flag to the display layer.

## Result Protocol Changes

### Worker protocol (`shared/src/worker-protocol.ts`)

The result message gains two optional fields:

```typescript
type ResultMessage = {
  type: 'result'
  queryId: number
  indices: Uint32Array
  breakdown: BreakdownNode
  histograms: Histograms
  printingIndices?: Uint32Array
  hasPrintingConditions: boolean
}
```

- `printingIndices`: Matching printing-row indices, transferred as a `Transferable`. Only present when the query contains printing-domain conditions or `unique:prints`.
- `hasPrintingConditions`: True when the query contained any printing-domain leaf nodes. The display layer uses this to decide whether to show printing-level UI elements.

### Printing display data

The main thread needs printing-level display columns to render set badges, rarity icons, and prices. These are extracted from `PrintingColumnarData` and stored in a signal:

```typescript
type PrintingDisplayColumns = {
  scryfall_ids: string[]
  collector_numbers: string[]
  set_codes: string[]
  set_names: string[]
  rarity: number[]
  finish: number[]
  price_usd: number[]
  canonical_face_ref: number[]
}
```

This is loaded alongside `printings.json` as a supplemental file (Spec 045 pattern). `set_codes` and `set_names` are pre-expanded from `set_lookup` during extraction to avoid shipping the dictionary to the main thread.

## Loading Sequence

```
Worker                                    Main Thread
──────                                    ───────────
1. Fetch columns.json
2. Build CardIndex + NodeCache
3. Post { ready, display }           ──►  4. Store display, enable search
                                          5. Start fetch: printings.json
                                          6. Parse JSON, extract PrintingDisplayColumns
                                          7. Store in printing display signal
                                          8. Post printing data to worker
                                     ◄──  9. Worker builds PrintingIndex
                                          10. Printing queries now available
```

Until step 10, queries with printing conditions return empty printing results and the evaluator flags `printingsUnavailable`. The UI shows a non-destructive notice (Spec 039 pattern).

## Rendering Changes

### Slim / Detail: set code badge

When `hasPrintingConditions` is true, each card row shows a small badge with the set code of its first matching printing. The badge appears after the card name:

```
⚡ Lightning Bolt [MH2]  {R}          Instant
```

The badge uses the set code from `printingDisplayColumns.set_codes[printingIndex]`.

### Images: printing-level expansion

When showing printing-level results in Images mode, the result list iterates `printingIndices` instead of `indices`. Each printing index maps to a card via `canonical_face_ref`, and the image uses the printing's `scryfall_id`:

```typescript
for (const pi of printingIndices) {
  const ci = printingDisplay.canonical_face_ref[pi]
  const imageUrl = normalImageUrl(printingDisplay.scryfall_ids[pi])
  const setCode = printingDisplay.set_codes[pi]
  // render card image with set/rarity overlay
}
```

Set code and rarity are shown beneath each image, not overlaid on the card art.

### Full: printing metadata panel

In Full mode with printing results, each row shows the card image (from the printing's `scryfall_id`) alongside the oracle text and a metadata panel:

| Field | Source |
|---|---|
| Set | `set_names[pi]` (`set_codes[pi]`) |
| Collector # | `collector_numbers[pi]` |
| Rarity | Decoded from `rarity[pi]` bitmask |
| Finish | Decoded from `finish[pi]` enum |
| Price | `price_usd[pi]` formatted as `$X.XX` (or "—" if 0) |

### Result count

The results header shows card count (from `indices.length`) as today. When printing results are present, it additionally shows printing count: "42 cards (87 printings)".

## `unique:prints` Handling

### Parsing

`unique:prints` is recognized during evaluation (not parsing). When the evaluator encounters a `FieldNode` with `field === "unique"` and `value === "prints"`, it:

1. Does not evaluate it as a filter (it does not produce a buffer).
2. Sets a `uniquePrints: true` flag on the result.
3. The node is displayed in the breakdown as a modifier, not a filter term.

### Display behavior

When `uniquePrints` is true:

- Images and Full: show all printings of matching cards (expand `indices` to all printing rows via `faceToPrintings`), not just the printings that matched printing conditions.
- Slim and Detail: unchanged (one row per card).
- If combined with printing conditions (e.g., `r:mythic unique:prints`), show all printings of cards that have at least one mythic printing — not just the mythic printings. This matches Scryfall's behavior where `unique:prints` overrides the default deduplication.

## Scope of Changes

| File | Change |
|---|---|
| `shared/src/worker-protocol.ts` | Add `printingIndices`, `hasPrintingConditions` to result type. Add `PrintingDisplayColumns` type. |
| `app/src/worker.ts` | Compute `printingIndices` from evaluator result. Extract `PrintingDisplayColumns` from printing data. |
| `app/src/App.tsx` | Fetch `printings.json` as supplemental file. Printing display signal. Adapt rendering per view mode for printing results. Result count with printing count. |
| `app/src/ArtCrop.tsx` | Accept optional printing `scryfall_id` override. |
| `app/src/CardImage.tsx` | Accept optional printing `scryfall_id` override. |
| `app/src/view-mode.ts` | No type changes, but batch sizes may need adjustment for printing-expanded results. |
| `app/vite.config.ts` | Serve and build `printings.json` (similar to `thumb-hashes.json` in Spec 045). |

## Acceptance Criteria

1. A query with no printing conditions renders identically to today.
2. `set:mh2` in Slim/Detail shows one row per card with the MH2 printing's art crop and a `[MH2]` set badge.
3. `set:mh2` in Images shows one image per matching MH2 printing (including separate foil/nonfoil if both match).
4. `is:foil price<1` in Images shows one image per matching foil printing under $1.
5. `unique:prints` in Images shows all printings of matching cards.
6. `r:mythic unique:prints` in Images shows all printings (not just mythic) of cards that have at least one mythic printing.
7. Full mode with printing conditions shows set, rarity, finish, collector number, and price.
8. The results header shows both card count and printing count when printing results are present.
9. Before `printings.json` loads, queries with printing conditions show a "loading" notice and return no printing results.
10. `unique:prints` has no effect on Slim and Detail modes.
