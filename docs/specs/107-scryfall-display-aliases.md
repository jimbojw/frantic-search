# Spec 107: Scryfall Display Aliases

**Status:** Implemented

**Depends on:** Spec 052 (Scryfall Outlink Canonicalization), Spec 058 (View Mode as Query Term), Spec 059 (Sort Directives), Spec 098 (Syntax Help Content)

**GitHub Issue:** [#132](https://github.com/jimbojw/frantic-search/issues/132)

## Goal

Add Scryfall-style `display:` and `order:` aliases so that queries like `display:full` and `order:name` work. This mirrors Scryfall's documented syntax and aligns with ADR-019 (Scryfall parity by default).

## Background

Scryfall documents display options as keywords: `display:grid`, `display:checklist`, `display:full`, `display:text`, and sort options as `order:artist`, `order:cmc`, etc. Frantic Search uses `view:` and `sort:` instead. Users typing Scryfall syntax (e.g. `display:full`) currently get 0 results because the evaluator treats `display` as an unknown field.

## Value Mappings

### display: → view:

| Scryfall `display:` | Frantic `view:` |
|--------------------|-----------------|
| `display:checklist` | `view:slim` |
| `display:text` | `view:detail` |
| `display:grid` | `view:images` |
| `display:full` | `view:full` |

### order: → sort:

`order:` maps 1:1 to `sort:` — same values (name, cmc, power, toughness, usd, date, rarity, etc.). Scryfall uses `order:cmc`; Frantic uses `sort:mv` internally but accepts `cmc` as an alias.

## Canonicalize / Scryfall Outlinks

Display and sort terms are **stripped from the query string** (`q=`) and emitted as **URL parameters**:

- `as=` — when view/display is active. Map Frantic view to Scryfall `as=`:
  | Frantic view | Scryfall `as=` |
  |--------------|----------------|
  | slim | checklist |
  | detail | text |
  | images | grid |
  | full | full |

- `order=` and `dir=` — when sort/order is active (already implemented for `sort:`).

When the user has no view/display term, omit `as=` (let Scryfall use its default grid).

## Implementation

### Parser / Evaluator

- **display:** Treat as display modifier (match-all). Map values at extraction time: checklist→slim, text→detail, grid→images, full→full.
- **order:** Treat as sort modifier (match-all). Same semantics as `sort:`; `findSortDirective` and evaluator recognize field `order` in addition to `sort`.

### Categorical resolution

- Add `display` to `resolveForField`. Scryfall values (checklist, text, grid, full) map to Frantic view values before resolution.
- Add `order` — resolve via SORT_FIELDS (same as sort).

### Files to touch

| File | Change |
|------|--------|
| `shared/src/search/evaluator.ts` | Treat `display` as view modifier (match-all); treat `order` as sort modifier (match-all) |
| `shared/src/search/query-sort.ts` | `findSortDirective` recognizes field `order` |
| `shared/src/search/categorical-resolve.ts` | Add `display`, `order` to CATEGORICAL_FIELDS; map display values to view |
| `app/src/view-query.ts` | `collectViewValues` includes `display`; map display values to view before validation |
| `shared/src/search/query-for-sort.ts` | Add `display`, `order` to DISPLAY_FIELDS |
| `shared/src/search/canonicalize.ts` | Strip `display`, `order` in serializeNode |
| `app/src/app-utils.ts` | Add `as=` to `buildScryfallSearchUrl` when view mode is active |
| `app/src/App.tsx` | Pass view mode to `buildScryfallSearchUrl` |
| `app/src/DualWieldLayout.tsx` | Pass view mode to `buildScryfallSearchUrl` |

### Syntax help

Add `display:` and `order:` to Spec 098 syntax help content (aliases table).

## Acceptance Criteria

1. `display:full` matches all cards and sets view mode to full (no filtering effect).
2. `display:checklist`, `display:text`, `display:grid` map to slim, detail, images respectively.
3. `order:name`, `order:cmc`, `order:usd` behave identically to `sort:name`, `sort:mv`, `sort:usd`.
4. `-order:name` reverses sort direction (NOT semantics).
5. `display:` and `order:` are stripped from the canonical query for Scryfall outlinks.
6. Scryfall outlinks add `&as=` when view mode is non-slim (slim maps to Scryfall checklist; omit `as=` when slim).
7. `display:` and `order:` are stripped from the sort seed (queryForSortSeed).
8. Unknown `display:` or `order:` values produce visible errors but do not filter (match-all preserved).
