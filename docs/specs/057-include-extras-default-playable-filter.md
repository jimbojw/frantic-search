# Spec 057: Default Playable Filter & `include:extras`

**Status:** Superseded by [Spec 178](178-default-search-inclusion-filter.md) (default inclusion model). Spec 178 is now implemented; treat it as canonical for default filtering. This document remains the historical reference for the original legality-based design and **`include:extras` / `**`** parser behavior.

**Status (historical):** Implemented (pre–Spec 178)

**Extended by:** Spec 150 (ChipButton — suggestion chips)

**Unified by:** Spec 151 (Suggestion System)

**UI (accordion counts):** Spec 175 — optional `indicesIncludingExtras` / `printingIndicesIncludingExtras` on the worker `result` are the canonical source for **MATCHES** vs **SHOWING** in the query breakdown footer.

**Depends on:** Spec 002 (Query Engine), Spec 032 (is: Operator), Spec 054 (Pinned Search Criteria), Spec 056 (Printing-Level Format Legality), ADR-009 (Bitmask-per-Node AST)

**Ongoing research:** Scryfall’s server-side default filtering is not fully reverse-engineered and may depend on query shape (not only bulk legalities). Empirical notes and a repeatable test matrix: [`docs/research/scryfall-default-result-filtering.md`](../research/scryfall-default-result-filtering.md); tracking [GitHub #227](https://github.com/jimbojw/frantic-search/issues/227). **Successor spec:** [Spec 178](178-default-search-inclusion-filter.md).

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

**Frantic Search–exclusive alias:** The bare word `**` desugars to `include:extras`. It behaves identically to the canonical form. Desugared nodes carry `sourceText` (`"**"`) so the breakdown displays the original token rather than `include:extras`. This shorthand is not from Scryfall.

### Default playable filter in the worker

Applied as a post-evaluation step in `runSearch()`, after pinned+live combination and before sorting:

1. Check `includeExtras` from both live and pinned evaluations. If either is `true`, skip the filter entirely.
2. Record pre-filter counts: `indicesIncludingExtras` (face count) and `printingIndicesIncludingExtras` (printing count, when printing data is relevant).
3. **When `hasPrintingConditions` and `rawPrintingIndices` exist (Issue #58):** The face result is **derived** from the filtered printing indices (unique canonical faces). Filter `rawPrintingIndices` first: keep only printings where `!(printingFlags[p] & NON_TOURNAMENT_MASK)` AND `(legalitiesLegal[canonicalFaceRef[p]] | legalitiesRestricted[canonicalFaceRef[p]]) !== 0`. Then set `deduped` to the unique canonical faces from the filtered printings. Cards with no surviving printings are excluded. Do not filter `deduped` independently.
4. **When printing conditions are absent:** Filter the `deduped` face array: keep only faces where `(legalitiesLegal[face] | legalitiesRestricted[face]) !== 0`. Filter `rawPrintingIndices` (when present) as above.
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

When printing counts are relevant (`uniqueMode` is `prints` or `art`, or `hasPrintingConditions`), include both:

> No cards found. Try again with `include:extras` (N cards, M printings)?

### Non-empty results rider

When the playable-filtered result set is **non-empty** but the filter removed at least one result, show a rider at the bottom of the search results:

> N cards (M printings) not shown. Try again with `include:extras`?

- N = `indicesIncludingExtras - totalCards` (hidden card count).
- M = `printingIndicesIncludingExtras - totalPrintingItems` when printing counts are relevant (`uniqueMode` is `prints` or `art`, or `hasPrintingConditions`). Omit the printing count otherwise.
- Only show when N > 0 (i.e., at least one card was hidden).
- The rider appears below the results list, styled consistently with the existing "…and N more" pagination sentinel. The `include:extras` term is clickable and appends it to the query.

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

### `app/src/SearchResults.tsx`

- When results exist and `indicesIncludingExtras` indicates hidden cards, render a rider at the bottom of the results list with the hidden count and a clickable `include:extras` hint.

### Terms Drawer chip (implementation follow-up)

The Terms Drawer (`app/src/TermsDrawer.tsx`) exposes an `include:extras` chip on the FORMATS, ROLES, RARITIES, and PRINTINGS tabs. On RARITIES and PRINTINGS it appears alongside `unique:prints` in the modifier section; on FORMATS and ROLES it appears alone. Uses `toggleIncludeExtras` and `hasIncludeExtras` from `query-edit.ts`.

## Acceptance Criteria

1. A default query (e.g., `t:creature`) excludes cards that are neither legal nor restricted in any format.
2. A default query with `unique:prints` excludes non-tournament printings (gold-bordered, oversized, 30A).
3. `include:extras` in the live query bypasses the playable filter — all matches shown.
4. `include:extras` in the pinned query bypasses the playable filter for all results.
5. When the playable filter produces zero results but unfiltered results exist, the empty-results hint appears with correct counts.
6. When the playable filter produces non-zero results but hid at least one card, a rider at the bottom shows the hidden count and a clickable `include:extras` hint.
7. `include:foo` produces an error in the query breakdown.
8. `include:extras` is `false` by default for all queries without it.
9. Histograms reflect the filtered (post-playable-filter) results.
10. When a query has printing conditions (e.g. `set:30a`) and the playable filter removes all matching printings, the result is zero cards (Issue #58).
