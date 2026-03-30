# Spec 080: USD Null and Negated Price Semantics

**Status:** Implemented

**GitHub Issue:** [#91](https://github.com/jimbojw/frantic-search/issues/91)

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 052 (Scryfall Outlink Canonicalization)

## Goal

Fix the semantics of negated USD price terms so they exclude printings without price data (matching mathematical negation), and add `usd=null` to explicitly surface printings with missing price data.

## Background

### Current bug

Positive price terms like `usd<0.10` correctly exclude printings where `price_usd === 0` (no price data). The evaluator skips null-price rows in `evalPrintingField`, so they never match.

Negated price terms like `-usd>100` use the standard NOT handling: invert the child's result buffer with XOR. Printings that didn't match (including null-price printings, which were never considered) end up with `buf[i] = 1` after inversion. So `-usd>100` incorrectly includes printings without price data.

### Scryfall behavior

Scryfall does not support negated price queries. A query like `-usd<2000` on Scryfall produces a text search for "usd<2000" exclusion, not a price filter. Frantic Search's treatment of `-` as a NOT operator for price terms is a principled divergence, giving us design space to define correct semantics.

### Mathematical expectation

`-usd<2000` should equal `usd>=2000` (excluding nulls). Implementing this via operator inversion preserves the ability to find price-missing printings via a new `usd=null` term.

## Design

### `usd=null` / `usd:null`

The value `null` (case-insensitive) is a special sentinel for the `usd` field. **Spec 172:** The same semantics apply to **equatable-null prefixes** — after trim and lowercasing, `n`, `nu`, and `nul` — but **only** for `:`, `=`, and `!=`. Comparison operators treat those prefixes as invalid numeric values, not as `null`.

| Operator | Semantics |
|----------|-----------|
| `:`, `=` | Match printings where `price_usd === 0` (no price data) |
| `!=` | Match printings where `price_usd !== 0` (has price data) |
| `>`, `>=`, `<`, `<=` | Error: `"null cannot be used with comparison operators"` |

Examples: `usd=null`, `usd:null`, `usd!=null`, `$=null` (via Spec 074 alias).

### Negated price semantics

When a NOT node wraps a FIELD with canonical `usd` and value is **not** `null`, negation is implemented by **operator inversion** instead of buffer inversion. This excludes null-price printings from the negated result.

| Original | Inverted |
|----------|----------|
| `>` | `<=` |
| `>=` | `<` |
| `<` | `>=` |
| `<=` | `>` |
| `=` | `!=` |
| `!=` | `=` |

So `-usd>100` = `usd<=100` (excluding nulls), and `-usd>=0.01` = `usd<0.01` (excluding nulls).

When the value **is** `null` or equatable-null (Spec 172), negation uses normal buffer inversion: `-usd=null` / `-usd=n` matches printings with price data (correct).

### Canonicalization

When serializing to Scryfall outlinks, `usd=null`, `usd!=null`, and any **equatable-null** value (Spec 172) have no Scryfall equivalent. Strip these terms from the serialized query (emit empty for the node, same as other Frantic Search–only constructs).

## Implementation

| File | Change |
|------|--------|
| `shared/src/search/eval-printing.ts` | Add `val === "null"` branch for `usd`; match `priceUsd[i] === 0` for `=`, `priceUsd[i] !== 0` for `!=`; error for comparison ops with null |
| `shared/src/search/evaluator.ts` | In NOT case: when child is FIELD with canonical `usd` and val ≠ `null`, evaluate inverted operator instead of buffer invert |
| `shared/src/search/canonicalize.ts` | Strip `usd=null` / `usd!=null` when serializing to Scryfall |
| `docs/specs/047-printing-query-fields.md` | Add reference to Spec 080 for extended `usd` semantics |

## Test Plan

### eval-printing.test.ts

- `usd=null` matches printings with `price_usd === 0`
- `usd!=null` matches printings with `price_usd !== 0`
- `usd>null` returns error

### evaluator-printing.test.ts

- `-usd>X` excludes null-price printings (same as `usd<=X`)
- `-usd=null` matches printings with price data

### canonicalize.test.ts

- `usd=null` and `usd!=null` are stripped from Scryfall serialization

## Acceptance Criteria

- [x] `usd=null` returns printings without price data
- [x] `usd!=null` returns printings with price data
- [x] `-usd>=0.01` returns same results as `usd<0.01` (excluding nulls)
- [x] `-usd=null` returns printings with price data
- [x] `toScryfallQuery` strips `usd=null` and `usd!=null`

## Scope

- **In scope:** `usd` field only. The `$` alias (Spec 074) inherits behavior via `FIELD_ALIASES`.
- **Out of scope:** `year:` and `date:` have the same null-exclusion pattern and could exhibit the same negation bug. Deferred; the issue specifies `usd` only.
