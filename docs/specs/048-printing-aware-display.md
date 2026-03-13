# Spec 048: Printing-Aware Display

**Status:** Implemented

**Depends on:** Spec 041 (Result Display Modes), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), ADR-017 (Dual-Domain Query Evaluation)

## Goal

Adapt the result display to show printing-specific information when the query contains printing-level conditions. Define how each view mode handles printing results and introduce the `unique:` modifier for controlling deduplication (Scryfall-aligned: `unique:cards` default vs `unique:prints`).

## Background

Currently, search results are a list of canonical face indices. Each result shows the oracle card's art crop or card image (via the oracle-level `scryfall_id`), name, type line, and other face-level data. There is no concept of "which printing" — results represent cards, not printings.

Spec 047 adds printing-level query fields (`set:`, `r:`, `is:foil`, `usd:`, etc.) that evaluate in the printing domain. The evaluator returns both `indices` (matching canonical face indices, for card-level display) and `printingIndices` (matching printing rows, for printing-level display). This spec defines how the display layer uses `printingIndices`.

## Display Rules

### No printing conditions in query

Behavior is unchanged. Results are canonical face indices rendered as oracle cards. The oracle-level `scryfall_id` is used for art crops and card images.

### Printing conditions present

When the evaluator returns `printingIndices` (non-empty), the display adapts per view mode and unique mode. Scryfall defines three `unique` display keywords ([Display Keywords](https://scryfall.com/docs/syntax#display)): `unique:cards` (default), `unique:prints`, and `unique:art`. Frantic Search supports all three.

| View mode | `unique:cards` (default) | `unique:prints` | `unique:art` |
|---|---|---|---|
| **Slim** | One row per card, first matching printing's art and set badge | (unchanged — always one per card) | (unchanged — always one per card) |
| **Detail** | Same as Slim: one row per card, first matching printing's art and set badge | (unchanged — always one per card) | (unchanged — always one per card) |
| **Images** | One image per **card** (first matching printing) | One image per matching printing | One image per unique artwork |
| **Full** | One row per card (first matching printing) | One row per matching printing | One row per unique artwork |

"First matching printing" means the first entry in `printingIndices` whose `canonical_face_ref` matches the card's canonical face index.

### `unique:` modifier

The `unique:` modifier controls deduplication in Images and Full modes. It has no effect on Slim and Detail modes (they always show one row per card).

- **`unique:cards` (default):** One row per oracle card. When `unique:cards` is present or no legal `unique:` term exists, this is the effective mode.
- **`unique:prints`:** Forces Images and Full to show **all printings that survived the AST**, even for pure card-level queries. When present and the query has no printing conditions, every printing of every matching card is shown. This matches Scryfall's `unique:prints` behavior.
- **`unique:art`:** One row per unique artwork per card. Uses `illustration_id_index` from printing data (Spec 046). First occurrence in `printingIndices` wins per artwork.

**Resolution rule (like `view:` in Spec 058):** The **last legal `unique:` term wins** across the combined pinned/live query. Invalid values (e.g., `unique:bogus`) are ignored; if no legal term remains, default to `unique:cards`.

**Scryfall aliases:** The bare words `++` and `@@` are desugared to `unique:prints` and `unique:art` respectively ([Scryfall Display Keywords](https://scryfall.com/docs/syntax#display)). They behave identically to the canonical forms. Desugared nodes carry `sourceText` (`"++"` or `"@@"`) so the breakdown displays the original token rather than the canonical form.

`unique:cards`, `unique:prints`, and `unique:art` (and their aliases `++`, `@@`) are parsed as `FieldNode` with `field: "unique"` and `value` in `["cards", "prints", "art"]`. The parser desugars bare `++` and `@@` tokens into the corresponding FIELD nodes before evaluation, setting `sourceText` for display. The evaluator does not process them as filters — they are extracted before evaluation and passed as `uniqueMode` to the display layer.

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

- `printingIndices`: Matching printing-row indices, transferred as a `Transferable`. Only present when the query contains printing-domain conditions or `uniqueMode` is `prints` or `art`.
- `hasPrintingConditions`: True when the query contained any printing-domain leaf nodes. The display layer uses this to decide whether to show printing-level UI elements.
- `uniqueMode`: `'cards' | 'prints' | 'art'` — the effective unique mode (last legal `unique:` term wins; default `cards`).

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
  illustration_id_index: number[]  // uint16; enables unique:art dedup
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

## `unique:` Handling

### Parsing

The parser desugars bare words `++` and `@@` into `{ field: "unique", value: "prints", sourceText: "++" }` and `{ field: "unique", value: "art", sourceText: "@@" }` respectively. The lexer emits them as WORD tokens; the parser converts them to FIELD nodes before they reach the evaluator. The breakdown uses `sourceText` when present so the user sees the original token (`++` or `@@`) rather than the canonical form.

The evaluator recognizes `field === "unique"` with `value` in `["cards", "prints", "art"]`. When encountered:

1. Does not evaluate it as a filter (it does not produce a buffer).
2. Sets `uniqueMode` on the result (last legal value wins across the AST).
3. The node is displayed in the breakdown as a modifier, not a filter term.

### Display behavior (unique mode)

The display layer derives the effective unique mode from the combined pinned/live query (last legal `unique:` term wins; default `cards`). Deduplication rules:

- **`unique:cards` (default):** Deduplicate `printingIndices` by `canonical_face_ref` (one printing per oracle card). First occurrence in `printingIndices` wins. Applies when no `unique:` modifier is present.
- **`unique:prints`:** No deduplication; show all matching printings. Finish variants (foil/nonfoil) appear as separate tiles. When printing conditions are absent, expand `indices` to all printing rows via `faceToPrintings`. When printing conditions are present (e.g., `is:foil unique:prints`, `r:mythic unique:prints`), show only the printings that match, with each finish variant as a separate tile (no `scryfall_id` deduplication). When the query contains `my:` (Spec 077) with a mixed list, the evaluator overrides the expansion so generic list entries contribute only their canonical nonfoil printing — `printingIndices` then reflects exactly what's in the list.
- **`unique:art`:** Deduplicate by `illustration_id_index` per card. Algorithm: (1) Group `printingIndices` by `canonical_face_ref`. (2) For each card group: Pass 1 — `maxIdx = max(illustration_id_index)`; Pass 2 — allocate `Uint32Array(maxIdx + 1)` filled with sentinel (0xFFFFFFFF); for each printing in group, if `slot[illustration_id_index]` unset, set to printing index; append filled slots to result. First occurrence per artwork wins.
- Slim and Detail: unchanged (always one row per card).

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
3. `set:mh2` in Images shows one image per **card** with an MH2 printing (first matching printing's art). `set:mh2 unique:prints` in Images shows all MH2 printings.
4. `is:foil price<1` in Images shows one image per card (first matching foil under $1). With `unique:prints`, shows all matching foil printings under $1.
5. `unique:prints` in Images shows all printings of matching cards.
6. `r:mythic unique:prints` in Images shows only mythic printings, with each finish variant as a separate tile (no `scryfall_id` deduplication).
7. Full mode with printing conditions shows set, rarity, finish, collector number, and price.
8. The results header shows both card count and printing count when printing results are present.
9. Before `printings.json` loads, queries with printing conditions show a "loading" notice and return no printing results.
10. `unique:prints` and `unique:art` have no effect on Slim and Detail modes.
11. The sort seed (Spec 019) omits all `unique:` terms so adding or changing them does not reshuffle the card order (Issue #62).
12. `t:forest a:avon unique:art` in Images shows one result per unique Forest artwork by John Avon.

## Implementation Notes

- 2026-02-27: Images and Full modes now deduplicate `printingIndices` by `scryfall_id` before rendering. Foil and nonfoil variants of the same physical printing share a Scryfall image, so displaying both produced visually identical adjacent tiles. The display layer groups finish variants by `scryfall_id`, renders one tile per unique ID, and shows aggregated finish/price metadata (e.g., "Foil · Nonfoil") on the collapsed tile. `unique:prints` bypasses the dedup and shows every finish row individually. The raw printing count in the results header remains the evaluator's matched count, not the deduped count. Acceptance criterion 3 is narrowed: `set:mh2` in Images shows one image per unique `scryfall_id` among matching printings, not one per finish variant.
- 2026-02-28: When `unique:prints` bypasses dedup, each tile/row now shows its individual finish label ("Foil", "Nonfoil", or "Etched") and price rather than the aggregated group. Foil tiles receive a holographic shimmer overlay (animated linear-gradient sweep via CSS `::after`, class `.foil-overlay`). Etched tiles receive a distinct sparkle overlay (two layers of drifting radial-gradient dots via `::before` and `::after`, class `.etched-overlay`). The two-layer sparkle uses mismatched tile sizes and drift directions so individual dots appear to twinkle independently. Both animations respect `prefers-reduced-motion`. Overlays are confined to the card image only; metadata bars use the same styling for all finishes (Issue #56). This addresses the problem of visually identical adjacent tiles when the same `scryfall_id` appears for multiple finishes.
- 2026-03-02: With Spec 054 (Pinned Search Criteria), "the query" means the effective query (pinned AND live). `unique:prints` and printing conditions in either part apply to the whole. The worker combines `printingIndices` from both evaluations per the rules in Spec 054 § "Printing-level result combination." The display layer is unchanged — it sees a single `printingIndices` and `uniqueMode` regardless of which query contributed them.
- 2026-03-03 (Issue #67): When unique mode is `cards` (default), the display layer deduplicates by `canonical_face_ref`, not `scryfall_id`. The existing `scryfall_id` dedup (2026-02-27) applies only when unique mode is `prints` — it collapses foil/nonfoil of the same physical printing when we intentionally show all printings. Structure the dedup logic as a mode-based switch (e.g., `uniqueMode: 'cards' | 'prints'`) so `unique:art` can be added without refactoring. Resolution: last legal `unique:` term wins across pinned/live query.
- 2026-03-03 (Issue #74): When building `_printingsOf`, PrintingIndex sorts each face's printing list so the canonical printing (from columns.json `scryfall_ids`) comes first. The evaluator collects `printingIndices` by iterating over matching faces and their `printingsOf(face)` (canonical-first) rather than raw printing row order. This ensures format-only queries (e.g., `f:commander celestus`) display the oracle card's canonical printing (Scryfall's default image) rather than an arbitrary printing from default_cards order.
- 2026-03-03 (Issue #75): Implemented `unique:art`. Replaced `uniquePrints: boolean` with `uniqueMode: 'cards' | 'prints' | 'art'`. Added `illustration_id_index` to PrintingColumnarData and PrintingDisplayColumns. Parser accepts `unique:cards`, `unique:prints`, `unique:art`; last legal wins.
- 2026-03-03: Added Scryfall display aliases: `++` for `unique:prints`, `@@` for `unique:art`. Parser desugars bare words to FIELD nodes; lexer unchanged.
- 2026-03-03: Desugared nodes carry `sourceText` for display. Breakdown shows `++` or `@@` instead of canonical form. `nodeKey` includes `sourceText` for unique aliases so cache does not deduplicate them (preserves correct spans and labels).
- 2026-03-05: `unique:prints` + `my:list` override (Spec 077): when both are present and the list has mixed entries, the evaluator uses `promoteFaceToPrintingCanonicalNonfoil` for generic face entries instead of `promoteFaceToPrinting`. This shows exactly what's in the list in Images/Full view — one tile per generic entry (canonical nonfoil) plus one tile per explicit printing entry — preserving the distinction between "I added this card" and "I added this specific printing."
- 2026-03-12: Printing-only list fix (Spec 076): when a list had only printing-level entries with `finish: null` (e.g. `1 Reliquary Tower (TDC) 386`), mask building previously skipped `printingMask`, so `hasPrintingConditions` was false and `unique:prints` expanded to all printings. Fix: treat null finish as nonfoil in `list-mask-builder.buildMasksForList`. Printing-only lists now correctly show "1 card (1 print)" for `my:list unique:prints`.
