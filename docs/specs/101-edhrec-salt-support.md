# Spec 101: EDHREC Salt Support

**Status:** In Progress

**GitHub Issue:** [#113](https://github.com/jimbojw/frantic-search/issues/113)

**Depends on:** Spec 100 (ETL MTGJSON Download), Spec 002 (Query Engine), Spec 003 (ETL Process), Spec 059 (Sort Directives), Spec 095 (Percentile Filters), Spec 098 (Syntax Help Content), ADR-009 (Bitmask-per-Node AST)

## Goal

Add EDHREC saltiness scores to Frantic Search end-to-end: extract `edhrecSaltiness` from MTGJSON AtomicCards, join to the columnar data by `oracle_id`, surface it in the data model, wire it through the worker, support filtering and sorting (including percentile queries), and update syntax highlighting, autocomplete, and card detail display.

**New data source required.** Scryfall does not provide salt scores. MTGJSON's AtomicCards includes optional `edhrecSaltiness` (number) per the [Card (Atomic) Data Model](https://mtgjson.com/data-models/card/card-atomic/). Spec 100 provides the download command; this spec covers the join, column, and full vertical.

## Background

EDHREC saltiness measures how "salty" (frustrating/annoying) a card is perceived to be in Commander. Higher numeric value = saltier. Unlike EDHREC rank (Spec 099), salt does **not** require percentile inversion — `salt>90%` means the top 10% saltiest cards (highest 10% of numeric values).

MTGJSON AtomicCards is keyed by card name (`Record<string, CardAtomic[]>`). Each `CardAtomic` has:

| Field                          | Type     | Description                                                                 |
|--------------------------------|----------|-----------------------------------------------------------------------------|
| `identifiers.scryfallOracleId` | `string` | Scryfall oracle UUID — join key matching `oracle_id` in the columnar data   |
| `edhrecSaltiness`              | `number` | Salt score (optional; not all cards have it)                               |

For multi-face cards (e.g., Unstable variants), the same name may map to multiple `CardAtomic` entries. Prefer `scryfallOracleId` when joining to match the correct face.

## Domain

- **Face-domain:** EDHREC salt is at the card (oracle) level. All faces of a multi-face card share the same salt score. Same pattern as `edhrec` rank.
- **Null handling:** Cards without salt are excluded from percentile distribution and results (Spec 095 § "Null handling").
- **No percentile inversion:** Higher numeric value = saltier. `salt>90%` yields top 10% saltiest cards. Sort ascending (lowest salt first); the slice logic is identical to `usd` and `date`.

## Spec Updates

This epic requires updates to the following specs:

| Spec | Update |
|------|--------|
| 003 | Add `edhrec_salts` column; document optional AtomicCards load and pushFaceRow |
| 095 | Add `salt` to percentile-capable field set |
| 059 | Add `salt` to sortable fields |
| 098 | Add `salt` to Fields table and Exclusives |

## Technical Details

### 1. ETL: Extract and join edhrecSaltiness

- Optionally load `atomic-cards.json` from `data/raw/` if present (Spec 100 output)
- Build `Map<oracle_id, edhrecSaltiness>` from MTGJSON:
  - Iterate over `data` entries (card name → `CardAtomic[]`)
  - For each atomic card with `identifiers.scryfallOracleId` and `edhrecSaltiness` defined, add to map
  - For multiple entries per name (e.g., Unstable variants), prefer matching by `scryfallOracleId` when available
- Add `edhrec_salts: (number | null)[]` to `ColumnarData` in `shared/src/data.ts`
- In `pushFaceRow`, look up `card.oracle_id` in the salt map; push value or `null`
- If `atomic-cards.json` is missing, push `null` for all rows (graceful degradation)
- Field source: Card-level (duplicated across all faces of the same card)

### 2. Worker: Load and expose edhrec_salt

- Ensure `CardIndex` reads `edhrec_salts` from `ColumnarData`
- Add `edhrecSalt: (number | null)[]` to `CardIndex` for evaluator access
- Build `sortedSaltIndices` at construction for percentile queries (sort ascending; higher index = saltier; no inversion)
- Handle nulls: exclude from sorted array and from percentile result set (per Spec 095)

### 3. Evaluator: Filtering and sorting

- Add `salt` (and aliases e.g. `edhrecsalt`, `saltiness`) to `SORT_FIELDS` in `shared/src/search/sort-fields.ts` with `percentileCapable: true`, `invertPercentile: false`
- Add `salt` to `PERCENTILE_CAPABLE_FIELDS`
- Add `salt` to face-domain field handling in `eval-leaves.ts`
- Implement percentile branch for `salt`: detect `value` matching `/^\d+(\.\d+)?%$/`, use `sortedSaltIndices` for O(1) bounds
- Support absolute comparisons: `salt>50`, `salt<=100`, etc.
- Extend negation path for percentile queries (`-salt>90%` → `salt<=90%`) per Spec 095
- Add `salt` to sort directive validation

### 4. Syntax highlighting and autocomplete

- Add `salt` to syntax highlighting field set
- Add `salt` to autocomplete field suggestions for `sort:` and general field completion

### 5. UI: Display

- Surface EDHREC salt in card detail view (e.g., card page, side panel)
- Optionally show salt in result list or breakdown (if design warrants)

## Scryfall Outlink

Scryfall does not support salt scores. All salt filter terms (absolute and percentile) and `sort:salt` have no Scryfall equivalent. Strip them from Scryfall outlinks (same as `edhrec` per Spec 099).

## Canonicalization

Percentile queries (`salt>90%`, etc.) and absolute comparisons (`salt>50`) have no Scryfall equivalent. Strip them from Scryfall outlinks. `sort:salt` and `-sort:salt` have no Scryfall equivalent; strip from outlinks.

## Files to Touch

| File | Changes |
|------|---------|
| `etl/src/process.ts` | Optional AtomicCards load, salt map, pushFaceRow, edhrec_salts column |
| `shared/src/data.ts` | Add edhrec_salts to ColumnarData |
| `shared/src/search/card-index.ts` | Read edhrec_salts, build sortedSaltIndices |
| `shared/src/search/sort-fields.ts` | Add salt with percentile flag (invertPercentile: false) |
| `shared/src/search/eval-leaves.ts` | Add salt field + percentile branch |
| `shared/src/search/evaluator.ts` | Extend negation path for salt percentile |
| `shared/src/search/canonicalize.ts` | Strip salt filters and sort from outlinks |
| `shared/src/search/ordering.ts` | Add salt sort comparator |
| `shared/src/worker-protocol.ts` | Add edhrec_salt to DisplayColumns |
| `docs/specs/003-etl-process.md` | Document edhrec_salts column, MTGJSON dependency |
| `docs/specs/095-percentile-filters.md` | Add salt to percentile field set |
| `docs/specs/059-sort-directives.md` | Add salt to sort fields |
| `docs/specs/098-syntax-help-content.md` | Add salt to Fields and Exclusives |
| `app/src/worker.ts` | Add edhrec_salt to extractDisplayColumns |
| `app/` | Syntax highlighting, autocomplete, card detail display |

## Acceptance Criteria

1. `npm run etl -- download-mtgjson` followed by `npm run etl -- process` produces `edhrec_salts` in `columns.json` (with nulls where MTGJSON has no salt)
2. Process succeeds when `atomic-cards.json` is absent; `edhrec_salts` is all null
3. Queries `salt>50`, `salt<=100` filter correctly
4. Percentile queries `salt>90%`, `salt<10%` work (higher % = saltier; no inversion)
5. `sort:salt` and `-sort:salt` order results by salt score
6. Cards without salt (null) are excluded from percentile distribution and results
7. Syntax help and autocomplete include `salt`
8. EDHREC salt is visible in card detail UI
