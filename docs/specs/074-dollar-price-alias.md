# Spec 074: `$` Alias for USD Price

**Status:** Implemented

**GitHub Issue:** [#64](https://github.com/jimbojw/frantic-search/issues/64)

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 052 (Scryfall Outlink Canonicalization)

**Updated:** Issue [#90](https://github.com/jimbojw/frantic-search/issues/90) — canonical field renamed from `price` to `usd` to match Scryfall syntax.

## Goal

Add `$` as an alias for the `usd` field so that queries like `$<1` and `$>=5` work identically to `usd<1` and `usd>=5`. This makes price filtering more ergonomic.

## Scope

### In scope

- **Filter:** `$` as a field name in filter expressions (e.g. `$<1`, `$:0.50`, `$>=10`)
- **Sort:** `sort:$` as an alias for `sort:usd`
- **Canonicalization:** When serializing to Scryfall outlinks, `$` and `usd` are emitted as `usd` (Scryfall's USD price field per <https://scryfall.com/docs/syntax#prices>)

### Out of scope

- Bare `$` — remains a bare word (no special meaning when not followed by an operator)
- `$$` or other multi‑character variants — not supported

## Design

### Lexer

No changes. The lexer already treats `$` as a `WORD` token because it is not in `SINGLE_CHAR_TOKENS` or `isSpecial`. Input `$<1` produces `WORD("$")`, `LT("<")`, `WORD("1")`.

### Parser

No changes. The parser treats `WORD` + operator + value as a `FIELD` node. `$` is passed through as `field: "$"`.

### Evaluator

- **`FIELD_ALIASES`** (`shared/src/search/eval-leaves.ts`): Add `$: "usd"` so `$` resolves to the canonical `usd` field.
- **`SORT_FIELDS`** (`shared/src/search/sort-fields.ts`): Add `$: { canonical: "usd", defaultDir: "asc", isPrintingDomain: true }` so `sort:$` behaves like `sort:usd`.

### Canonicalization

**`shared/src/search/canonicalize.ts`:** When serializing `FIELD` nodes to Scryfall, use the canonical field name for USD price. Both `$` and `usd` emit as `usd` in Scryfall outlinks.

## Implementation

| File | Change |
|------|--------|
| `shared/src/search/eval-leaves.ts` | Add `$: "usd"` to `FIELD_ALIASES` |
| `shared/src/search/sort-fields.ts` | Add `$` entry to `SORT_FIELDS` |
| `shared/src/search/canonicalize.ts` | Emit `usd` for USD price field when serializing to Scryfall |
| `shared/src/search/eval-printing.test.ts` or `evaluator-printing.test.ts` | Tests for `$<1`, `$>=5`, etc. |
| `shared/src/search/sort-fields.test.ts` | Test `sort:$` → `usd` |
| `shared/src/search/canonicalize.test.ts` | Test `$<1` → `usd<1` |

## Acceptance Criteria

- [x] `$<1` returns the same results as `usd<1`
- [x] `$>=5`, `$:0.50`, `$!=0` all match expected printings
- [x] `sort:$` sorts by price ascending (same as `sort:usd`)
- [x] `-sort:$` sorts by price descending
- [x] `toScryfallQuery(parse("$<1"))` → `"usd<1"`
