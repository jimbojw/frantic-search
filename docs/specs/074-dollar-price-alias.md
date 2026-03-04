# Spec 074: `$` Alias for Price

**Status:** Implemented

**GitHub Issue:** [#64](https://github.com/jimbojw/frantic-search/issues/64)

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 052 (Scryfall Outlink Canonicalization)

## Goal

Add `$` as an alias for the `price` field so that queries like `$<1` and `$>=5` work identically to `price<1` and `price>=5`. This makes price filtering more ergonomic.

## Scope

### In scope

- **Filter:** `$` as a field name in filter expressions (e.g. `$<1`, `$:0.50`, `$>=10`)
- **Sort:** `sort:$` as an alias for `sort:price` / `sort:usd`
- **Canonicalization:** When serializing to Scryfall outlinks, `$` is emitted as `price` (Scryfall accepts `price` for USD price filtering)

### Out of scope

- Bare `$` — remains a bare word (no special meaning when not followed by an operator)
- `$$` or other multi‑character variants — not supported

## Design

### Lexer

No changes. The lexer already treats `$` as a `WORD` token because it is not in `SINGLE_CHAR_TOKENS` or `isSpecial`. Input `$<1` produces `WORD("$")`, `LT("<")`, `WORD("1")`.

### Parser

No changes. The parser treats `WORD` + operator + value as a `FIELD` node. `$` is passed through as `field: "$"`.

### Evaluator

- **`FIELD_ALIASES`** (`shared/src/search/eval-leaves.ts`): Add `$: "price"` so `$` resolves to the canonical `price` field.
- **`SORT_FIELDS`** (`shared/src/search/sort-fields.ts`): Add `$: { canonical: "price", defaultDir: "asc", isPrintingDomain: true }` so `sort:$` behaves like `sort:price`.

### Canonicalization

**`shared/src/search/canonicalize.ts`:** When serializing `FIELD` nodes to Scryfall, use the canonical field name from `FIELD_ALIASES` instead of the raw `node.field`. This ensures `$<1` is emitted as `price<1` in Scryfall outlinks. Scryfall accepts `price` for USD price filtering.

## Implementation

| File | Change |
|------|--------|
| `shared/src/search/eval-leaves.ts` | Add `$: "price"` to `FIELD_ALIASES` |
| `shared/src/search/sort-fields.ts` | Add `$` entry to `SORT_FIELDS` |
| `shared/src/search/canonicalize.ts` | Use canonical field when serializing `FIELD` nodes |
| `shared/src/search/eval-printing.test.ts` or `evaluator-printing.test.ts` | Tests for `$<1`, `$>=5`, etc. |
| `shared/src/search/sort-fields.test.ts` | Test `sort:$` → `price` |
| `shared/src/search/canonicalize.test.ts` | Test `$<1` → `price<1` |

## Acceptance Criteria

- [x] `$<1` returns the same results as `price<1`
- [x] `$>=5`, `$:0.50`, `$!=0` all match expected printings
- [x] `sort:$` sorts by price ascending (same as `sort:price`)
- [x] `-sort:$` sorts by price descending
- [x] `toScryfallQuery(parse("$<1"))` → `"price<1"`
- [x] Existing `price` and `usd` aliases continue to work
