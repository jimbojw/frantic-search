# Spec 105: Keyword Search (kw: / keyword:)

**Status:** Implemented

**GitHub Issue:** [#114](https://github.com/jimbojw/frantic-search/issues/114)

**Depends on:** Spec 002 (Query Engine), Spec 003 (ETL Process), Spec 092 (Tag Data Model — inverted index pattern), Spec 098 (Syntax Help Content), Spec 103 (Categorical Field Value Auto-Resolution), ADR-009 (Bitmask-per-Node AST)

## Goal

Add Scryfall-style keyword search to Frantic Search: extract the `keywords` array from oracle-cards.json, build an inverted index, and support the `kw:` and `keyword:` field aliases for filtering cards by keyword ability.

**No new data source required.** Scryfall's oracle-cards.json already includes `keywords` (string array) per the [Scryfall Card Objects API](https://scryfall.com/docs/api/cards): "An array of keywords that this card uses, such as 'Flying' and 'Cumulative upkeep'."

## Background

Scryfall supports `kw:` and `keyword:` as aliases for searching cards by keyword ability. Unlike `o:` (oracle text), which does substring matches on arbitrary text, `kw:` targets Scryfall's structured keyword list — e.g. `kw:flying` finds cards that have the Flying keyword ability, not cards that merely mention "flying" in their rules text.

Scryfall's [keyword catalog](https://api.scryfall.com/catalog/keyword-abilities) lists **216 keyword abilities**. An inverted index (keyword → canonical face indices) matches the evaluator's query pattern ("given a keyword, which faces match?") and mirrors the design used for oracle tags (Spec 092).

## Domain

- **Face-domain:** Keywords are at the card level in Scryfall. For multi-face cards, the same `keywords` array is used for all faces. The inverted index stores **canonical face indices** — one entry per card per keyword.
- **Empty value:** `kw:` or `keyword:` with no value matches all cards (neutral filter), per Spec 002 § "Error Recovery" — same as other trailing-operator fields.

## CLI

The query CLI embeds `keywords_index` from the loaded `columns.json` into `KeywordDataRef` for every `NodeCache` (see Spec 069 supplemental data). No separate keyword file is required beyond ETL-produced columns.

## Spec Updates

This epic requires updates to the following specs:

| Spec | Update |
|------|--------|
| 003 | Add `keywords_index` to columns.json; document extraction and inverted index build |
| 002 | Add `kw`, `keyword` to Supported Fields table |
| 098 | Add `kw`, `keyword` to Fields table |
| 103 | Add `kw`, `keyword` to categorical resolution registry (candidate source: keys of loaded keywords.json) |

## Technical Details

### 1. ETL: Build inverted index

- Add `keywords?: string[]` to the `Card` interface in `etl/src/process.ts`
- During the face expansion pass, for each card: collect `card.keywords ?? []` and the card's canonical face index (first-emitted face row index)
- Build `Record<string, number[]>`: for each keyword (lowercased), append the canonical face index. Dedupe per card (multi-face cards share one canonical face)
- Sort each array for gzip compression and consistent iteration
- Add `keywords_index` to columns.json — same shape as `otags.json` (Spec 092)
- Keys are lowercase keyword strings; values are sorted canonical face indices

### 2. Worker: Load and expose keywords

- Extract `keywords_index` from columns.json when loading (already bundled)
- Store in a ref (e.g. `keywordDataRef`) passed to the evaluator — same pattern as `tagDataRef` for tags (Spec 093)
- Type: `KeywordData = Record<string, number[]>` (or reuse `OracleTagData` from `shared/src/data.ts`)

### 3. Evaluator: Filtering

- Add `kw` and `keyword` to `FIELD_ALIASES` in `shared/src/search/eval-leaves.ts` (both resolve to canonical `keyword`)
- Branch to keyword evaluation before `evalLeafField` — same pattern as `otag`/`atag` in Spec 093
- Look up `value.toLowerCase()` in the keyword index; for each index in the array, set `buf[index] = 1`
- O(1) lookup + O(k) buffer fill, where k = number of matching faces
- Supported operators: `:` and `=` only (no numeric comparisons)
- Negation via `-kw:flying` works via the existing NOT node
- Empty value: fill buffer with 1s (match all) or treat as neutral filter per existing semantics
- Unknown keyword: error (e.g. `unknown keyword "xyz"`) — same as unknown tag in Spec 093
- **Categorical resolution (Spec 103):** Before lookup, call `resolveForField("keyword", value, context)`. Candidate source: keys of loaded keywords.json (runtime, like `otag`/`atag`). When the user's prefix matches exactly one keyword (e.g. `kw:f` → `flying`, `kw:de` → `deathtouch`), resolve to the full value. When 0 or 2+ match, no resolution; existing validation applies.

### 4. Syntax highlighting and autocomplete

- Add `kw` and `keyword` to syntax highlighting field set
- Add `kw` and `keyword` to autocomplete field suggestions (prefix match on keyword vocabulary, same pattern as `otag`/`atag` in Spec 094)

## Data Format: `keywords_index` (in columns.json)

The `keywords_index` property in columns.json has the shape:

```json
{
  "keywords_index": {
    "flying": [0, 5, 12, 47, 89, ...],
    "deathtouch": [3, 18, 44, ...],
    "haste": [1, 2, 7, 9, ...],
    ...
  }
}
```

- **216 arrays** (one per keyword that appears in the dataset)
- Each array: sorted canonical face indices
- Keywords with zero matching cards are omitted
- Keys are lowercase (Scryfall keywords normalized at write time)

**Size estimate:** ~74k total entries (face × keyword pairs) × 4 bytes ≈ 300 KB raw; gzip compresses sorted arrays well. Bundled with columns.json as core face-level data.

## Files to Touch

| File | Changes |
|------|---------|
| `etl/src/process.ts` | Card interface, extract keywords, build inverted index, add to columns.json |
| `shared/src/data.ts` | Add `KeywordData` type (or document reuse of `OracleTagData`) |
| `shared/src/search/eval-leaves.ts` | Add kw/keyword aliases |
| `shared/src/search/eval-keywords.ts` | New: `evalKeyword` (mirrors `evalOracleTag`) |
| `shared/src/search/categorical-resolve.ts` | Add `kw`, `keyword` to `resolveForField` registry (candidate source: keyword keys from context) |
| `shared/src/search/evaluator.ts` | Accept keywordDataRef, branch to keyword eval in computeTree |
| `app/src/worker.ts` | Extract keywords_index from columns.json, pass keywordDataRef to NodeCache; add keyword keys to ResolutionContext for categorical resolution |
| `docs/specs/003-etl-process.md` | Document keywords_index in columns.json |
| `docs/specs/002-query-engine.md` | Add kw, keyword to Supported Fields |
| `docs/specs/098-syntax-help-content.md` | Add kw, keyword to Fields table |
| `app/` | Syntax highlighting, autocomplete |

## Testing (TDD)

Per `shared/AGENTS.md`, use TDD for evaluator code:

1. `kw:flying` with a card that has Flying → matches
2. `kw:flying` with a card that lacks Flying → no match
3. `keyword:deathtouch` matches cards with Deathtouch
4. `-kw:flying` excludes cards with Flying
5. Matching is case-insensitive (`kw:FLYING` matches Flying)
6. `kw:` with empty value → matches all cards (neutral filter)
7. Unknown keyword `kw:xyz` → error
8. Multi-face card: canonical face index appears once per keyword; `kw:flying` matches if the card has Flying
9. `kw:f` resolves to `kw:flying` when "flying" is the only keyword prefix-match (Spec 103)
10. `kw:de` resolves to `kw:deathtouch` when "deathtouch" is the only match.
11. `kw:p` with multiple matches (e.g. prowess, protection) → no resolution; error per existing validation

## Acceptance Criteria

1. `keywords_index` is present in `data/dist/columns.json` after `npm run etl -- process`
2. `kw:flying` and `keyword:flying` match cards with the Flying keyword
3. `kw:deathtouch` matches cards with Deathtouch
4. `-kw:flying` excludes cards with Flying
5. Matching is case-insensitive
6. Syntax help and autocomplete include `kw` and `keyword`
7. Prefix auto-resolution: `kw:f` behaves as `kw:flying` when that is the only matching keyword (Spec 103)
