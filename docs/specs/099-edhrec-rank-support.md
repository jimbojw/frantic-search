# Spec 099: EDHREC Rank Support

**Status:** Implemented

**GitHub Issue:** [#112](https://github.com/jimbojw/frantic-search/issues/112)

**Depends on:** Spec 002 (Query Engine), Spec 003 (ETL Process), Spec 059 (Sort Directives), Spec 095 (Percentile Filters), Spec 098 (Syntax Help Content), ADR-009 (Bitmask-per-Node AST)

## Goal

Add EDHREC popularity rankings to Frantic Search end-to-end: extract `edhrec_rank` from Scryfall oracle-cards.json, surface it in the columnar data model, wire it through the worker, support filtering and sorting (including percentile queries), and update syntax highlighting, autocomplete, and card detail display.

**No new data source required.** Scryfall's oracle-cards.json already includes `edhrec_rank` (Integer, nullable) per the [Scryfall Card Objects API](https://scryfall.com/docs/api/cards).

## Background

EDHREC ranks cards by Commander popularity. Lower numeric rank = more popular. Spec 095 (Percentile Filters) already anticipates `edhrec` as a percentile-capable field with **rank inversion** — e.g. `edhrec>90%` should yield the 10% most popular cards (lowest 10% of numeric rank values).

Scryfall supports `order=edhrec` for sorting ([example](https://scryfall.com/search?q=kw%3Aflying+unique%3Acards&unique=prints&as=grid&order=edhrec)), so Scryfall outlinks can include this parameter when `sort:edhrec` is active.

## Domain

- **Face-domain:** EDHREC rank is at the card (oracle) level. All faces of a multi-face card share the same rank. Same pattern as `name` percentile.
- **Null handling:** Cards without rank are excluded from percentile distribution and results (Spec 095 § "Null handling").
- **Rank inversion:** Lower numeric value = more popular. `edhrec>90%` yields top 10% most popular cards.

## Spec Updates

This epic requires updates to the following specs:

| Spec | Update |
|------|--------|
| 003 | Add `edhrec_ranks` column; document Card interface and pushFaceRow |
| 095 | Move `edhrec` from "Future" to implemented; add to percentile field set |
| 059 | Add `edhrec` to sortable fields and Scryfall outlink mapping |
| 098 | Add `edhrec` to Fields table and Exclusives |

## Technical Details

### 1. ETL: Extract edhrec_rank

- Add `edhrec_rank?: number` to the `Card` interface in `etl/src/process.ts`
- Add `edhrec_ranks: (number | null)[]` to `ColumnarData` in `shared/src/data.ts` (use `null` for missing values)
- In `pushFaceRow`, push `card.edhrec_rank ?? null` for each face row (same value for all faces of a card)
- Field source: Card-level (duplicated across all faces of the same card)

### 2. Worker: Load and expose edhrec_rank

- Ensure `CardIndex` reads `edhrec_ranks` from `ColumnarData`
- Add `edhrecRank: (number | null)[]` (or equivalent) to `CardIndex` for evaluator access
- Build `sortedEdhrecIndices` at construction for percentile queries (sort by rank ascending; lower = more popular; use `invertPercentile` so `edhrec>90%` slices the "best" end)
- Handle nulls: exclude from sorted array and from percentile result set (per Spec 095)

### 3. Evaluator: Filtering and sorting

- Add `edhrec` (and aliases e.g. `edhrecrank`) to `SORT_FIELDS` in `shared/src/search/sort-fields.ts` with `percentileCapable: true`, `invertPercentile: true`
- Add `edhrec` to `PERCENTILE_CAPABLE_FIELDS`
- Add `edhrec` to face-domain field handling in `eval-leaves.ts`
- Implement percentile branch for `edhrec`: detect `value` matching `/^\d+(\.\d+)?%$/`, use `sortedEdhrecIndices` for O(1) bounds
- Support absolute comparisons: `edhrec<100`, `edhrec>=500`, etc.
- Extend negation path for percentile queries (`-edhrec>90%` → `edhrec<=90%`) per Spec 095

### 4. Syntax highlighting and autocomplete

- Add `edhrec` to syntax highlighting field set (if applicable)
- Add `edhrec` to autocomplete field suggestions for `sort:` and general field completion

### 5. UI: Display

- Surface EDHREC rank in card detail view (e.g. card page, side panel)
- Optionally show rank in result list or breakdown (if design warrants)

## Scryfall Outlink

Scryfall supports `order=edhrec` for sorting. When `sort:edhrec` and `-sort:edhrec` are active, add `&order=edhrec&dir=asc` or `&order=edhrec&dir=desc` to Scryfall outlinks. Percentile filter terms (`edhrec>90%`, etc.) have no Scryfall equivalent and are stripped from outlinks (same as other percentile queries per Spec 095).

## Canonicalization

Percentile queries (`edhrec>90%`, etc.) have no Scryfall equivalent. Strip them from Scryfall outlinks (same as `usd>90%`). Absolute comparisons (`edhrec<100`) — check Scryfall syntax; if unsupported, strip from outlinks.

## Files to Touch

| File | Changes |
|------|---------|
| `etl/src/process.ts` | Card interface, pushFaceRow, edhrec_ranks column |
| `shared/src/data.ts` | Add edhrec_ranks to ColumnarData |
| `shared/src/search/card-index.ts` | Read edhrec_ranks, build sortedEdhrecIndices |
| `shared/src/search/sort-fields.ts` | Add edhrec with percentile + invert flags |
| `shared/src/search/eval-leaves.ts` | Add edhrec field + percentile branch |
| `shared/src/search/evaluator.ts` | Extend negation path for edhrec percentile |
| `shared/src/search/canonicalize.ts` | Strip edhrec percentile from outlinks; add order=edhrec for sort |
| `docs/specs/003-etl-process.md` | Document edhrec_ranks column |
| `docs/specs/095-percentile-filters.md` | Move edhrec from "Future" to implemented |
| `docs/specs/059-sort-directives.md` | Add edhrec to sort fields |
| `docs/specs/098-syntax-help-content.md` | Add edhrec to Fields and Exclusives |
| `app/` | Syntax highlighting, autocomplete, card detail display |

## Acceptance Criteria

1. `edhrec_rank` is present in `columns.json` after `npm run etl -- process`
2. Queries `edhrec<100`, `edhrec>=500` filter correctly
3. Percentile queries `edhrec>90%`, `edhrec<10%` work with rank inversion (higher % = more popular)
4. `sort:edhrec` and `-sort:edhrec` order results by rank
5. Cards without rank (null) are excluded from percentile distribution and results
6. Syntax help and autocomplete include `edhrec`
7. EDHREC rank is visible in card detail UI
