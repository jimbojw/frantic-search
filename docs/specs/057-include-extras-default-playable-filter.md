# Spec 057: Default Playable Filter & `include:extras`

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 032 (is: Operator), Spec 054 (Pinned Search Criteria), Spec 056 (Printing-Level Format Legality), ADR-009 (Bitmask-per-Node AST)

## Goal

Exclude non-playable cards and non-tournament-usable printings from search results by default, matching Scryfall's behavior. Provide an `include:extras` query modifier to bypass the filter and show all matches.

## Background

Scryfall excludes certain categories of cards from default search results:

- **`is:funny` cards** — unsets, acorn-stamped, silver-bordered, playtest cards, and other non-tournament-legal cards (see Spec 032).
- **Non-tournament printings** — gold-bordered (Collector's Edition, World Championship Decks), 30th Anniversary Edition, oversized (Commander oversized, Archenemy, Planechase) — see Spec 056's `NON_TOURNAMENT_MASK`.

To include them, Scryfall requires the special term `include:extras`. Frantic Search currently returns all matches regardless.

### Playable definition

A card/printing is _playable_ iff:

1. **Card-level:** The card is legal or restricted in at least one format — `(legalitiesLegal[face] | legalitiesRestricted[face]) !== 0`.
2. **Printing-level:** When printing data is available, the printing is tournament-usable — `!(printingFlags[p] & NON_TOURNAMENT_MASK)`.

## Design

### `include:extras` as a query modifier

`include:extras` is a query modifier, not a filter. It follows the same pattern as `unique:prints`:

- The parser produces a `FIELD` node with `field: "include"`, `operator: ":"`, `value: "extras"`.
- The evaluator recognizes it before the `FIELD_ALIASES` lookup, producing a face-domain buffer that matches all canonical faces (neutral for AND composition).
- The evaluator exposes `includeExtras: boolean` on `EvalOutput`.
- Unknown values (e.g., `include:foo`) produce an error: `unknown include value "foo"`.

### Default playable filter in the worker

Applied as a post-evaluation step in `runSearch()`, after pinned+live combination and before sorting:

1. Check `includeExtras` from both live and pinned evaluations. If either is `true`, skip the filter entirely.
2. Record pre-filter counts: `indicesIncludingExtras` (face count) and `printingIndicesIncludingExtras` (printing count, when printing data is relevant).
3. Filter the `deduped` face array: keep only faces where `(legalitiesLegal[face] | legalitiesRestricted[face]) !== 0`.
4. Filter `rawPrintingIndices` (when present): keep only printings where `!(printingFlags[p] & NON_TOURNAMENT_MASK)` AND `(legalitiesLegal[canonicalFaceRef[p]] | legalitiesRestricted[canonicalFaceRef[p]]) !== 0`.
5. Histograms and sorting operate on the filtered results.

Pre-filter counts are populated only when `include:extras` is **not** in the query and the filter actually removed something (i.e., the pre-filter count differs from the post-filter count).

### Worker protocol additions

New optional fields on the `result` variant of `FromWorker`:

```typescript
indicesIncludingExtras?: number
printingIndicesIncludingExtras?: number
```

Present only when `include:extras` was not in the query and the playable filter removed at least one result.

### Empty-results UX

When the playable-filtered result set is empty but the unfiltered counts are non-zero, replace "No cards found" with a hint:

> No cards found. Try again with `include:extras` (N cards)?

When printing counts are relevant (`uniquePrints` or `hasPrintingConditions`), include both:

> No cards found. Try again with `include:extras` (N cards, M printings)?

## Changes by Layer

### `shared/src/search/ast.ts`

Add `includeExtras: boolean` to `EvalOutput`.

### `shared/src/search/evaluator.ts`

- Add `_hasIncludeExtras(ast)` private method (mirrors `_hasUniquePrints`).
- In the `FIELD` case of `computeTree()`, before the alias lookup: recognize `include:extras` as matching all canonical faces. Handle unknown `include:` values as errors.
- Return `includeExtras` from `evaluate()`.

### `shared/src/worker-protocol.ts`

Add `indicesIncludingExtras?: number` and `printingIndicesIncludingExtras?: number` to the `result` variant.

### `shared/src/index.ts`

Re-export `NON_TOURNAMENT_MASK` from `eval-printing.ts` so the app workspace can import it.

### `app/src/worker-search.ts`

- Import `NON_TOURNAMENT_MASK` from `@frantic-search/shared`.
- After pinned+live combination, before sorting: apply the playable filter when `!includeExtras`.
- Populate `indicesIncludingExtras` and `printingIndicesIncludingExtras` when the filter is active and removed results.

### `app/src/App.tsx`

- Store `indicesIncludingExtras` and `printingIndicesIncludingExtras` from the result message.
- Replace "No cards found" with a conditional hint when the filter hid results.

## Acceptance Criteria

1. A default query (e.g., `t:creature`) excludes cards that are neither legal nor restricted in any format.
2. A default query with `unique:prints` excludes non-tournament printings (gold-bordered, oversized, 30A).
3. `include:extras` in the live query bypasses the playable filter — all matches shown.
4. `include:extras` in the pinned query bypasses the playable filter for all results.
5. When the playable filter produces zero results but unfiltered results exist, the empty-results hint appears with correct counts.
6. `include:foo` produces an error in the query breakdown.
7. `include:extras` is `false` by default for all queries without it.
8. Histograms reflect the filtered (post-playable-filter) results.
