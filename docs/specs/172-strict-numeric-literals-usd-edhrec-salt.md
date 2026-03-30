# Spec 172: Strict Numeric Literals and Equatable-Null Prefixes (`usd`, `edhrec`, `salt`)

**Status:** Implemented

**GitHub Issue:** [#230](https://github.com/jimbojw/frantic-search/issues/230)

**Depends on:** Spec 002 (Query Engine), Spec 039 (Non-Destructive Error Handling), Spec 047 (Printing Query Fields), Spec 080 (USD Null), Spec 095 (Percentile Filters), Spec 099 (EDHREC Rank), Spec 101 (EDHREC Salt), Spec 085 (PostHog Analytics), ADR-009 (Bitmask-per-Node AST)

## Goal

For the fields `usd` (and `$`), `edhrec`, and `salt`:

1. **Reject** values that are not valid numeric literals (for that field), not valid percentile literals, and not the special `null` query value — with a **leaf error** (Spec 039), not a silent empty match.
2. While the user is typing `null`, treat **proper prefixes** of the word `null` as equivalent to `null` for operators that already support `null`, so live queries stay usable.

## Motivation

Garbage values such as `salt=abc` previously produced **zero results** with no feedback, unlike closed-set fields. That hides typos. Scryfall-style strictness for always-numeric metrics improves discoverability when combined with Spec 039 error display.

## Equatable null literal

After **trim** and **ASCII lowercasing**, a value is treated as the query literal `null` if:

- it equals `null`, or
- it is non-empty and a **proper prefix** of the string `null`: `n`, `nu`, `nul`.

Examples: `n`, `N`, ` nu ` → equatable to `null`. `no`, `nulll`, `nil` → **not** equatable (normal validation applies).

### Operators

Equatable-null semantics apply **only** for `:`, `=`, and `!=` — the same operators that support `null` today (Spec 080 / Spec 136 patterns for these fields).

For `>`, `>=`, `<`, `<=`:

- A value that is only an equatable-null prefix (e.g. `n`) is **not** reinterpreted as `null`. It is validated as a **numeric** literal and fails with the field’s invalid-numeric error (e.g. `salt>n` while typing → `invalid salt "n"` until a valid number appears).
- Exact `null` (or full equatable form `null`) with a comparison operator continues to return **`null cannot be used with comparison operators`**.

## Accepted value shapes (per field)

Order of evaluation in the evaluator:

1. Equatable-null branch (`=`, `:`, `!=` only) → same semantics as `null` today.
2. Percentile branch (value matches `(\d+(?:\.\d+)?)%` per Spec 095) → existing percentile logic.
3. Absolute numeric branch → parse and compare; on failure → leaf error.

### `usd` / `$`

- **Null family:** equatable-null or `null` for `=`, `:`, `!=` (Spec 080).
- **Percentile:** unchanged (Spec 095).
- **Price:** `parseFloat` of the value yields a **finite** number → compare in cents; otherwise **`invalid price "…"`** (existing message).

### `edhrec`

- **Null family:** equatable-null for `=`, `:`, `!=` (Spec 136 null semantics).
- **Percentile:** unchanged (Spec 095).
- **Rank:** `Number(value)` must be **finite** and **`Number.isInteger`** → comparisons; otherwise **`invalid edhrec rank "…"`**. (Non-integers such as `1.5` are errors.)

### `salt`

- **Null family:** equatable-null for `=`, `:`, `!=`.
- **Percentile:** unchanged.
- **Score:** `parseFloat` must yield a **finite** number → comparisons; otherwise **`invalid salt "…"`**.

## Cross-cutting consumers

A single predicate **`isEquatableNullLiteral(raw: string)`** in `shared/src/search/null-query-literal.ts` must drive:

| Consumer | Behavior |
|----------|----------|
| `eval-printing.ts` (`usd`) | Null branch when equatable-null |
| `eval-leaves.ts` (`edhrec`, `salt`) | Null branch when equatable-null |
| `evaluator.ts` (NOT / operator inversion) | Treat equatable-null like `null` for `usd` and nullable `edhrec`/`salt` inversion gates (Spec 080 / 136) |
| `canonicalize.ts` | Strip `usd` terms whose value is equatable-null (same as `usd=null` for Scryfall) |
| `query-extension-syntax.ts` (Spec 085) | Count `usd=…` / `edhrec=…` with equatable-null as Frantic-only `null` syntax where applicable |

## Relationship to Spec 039

Spec 039 previously grouped generic “numeric fields” with string fields where zero results need not imply an error. **Spec 172** narrows that: `usd`, `edhrec`, and `salt` use **validated** numeric (or percentile or null) literals; invalid literals are **errors**.

## Acceptance Criteria

1. `salt=abc`, `edhrec=abc`, `usd:abc` produce leaf errors (not silent 0 results).
2. `edhrec=1.5` produces `invalid edhrec rank "1.5"`.
3. `salt=n`, `edhrec=nu`, `usd=nul` with `=` or `:` or `!=` behave like full `null` for those fields.
4. `salt>n` with value `n` errors as invalid salt (not null-comparison).
5. `-salt=n` matches `-salt=null`; `-usd=n` matches `-usd=null`.
6. `toScryfallQuery` strips `usd=n` the same as `usd=null`.
7. `astUsesFranticExtensionSyntax` treats `usd=n` and `edhrec=n` as extension where `usd=null` / `edhrec` null queries are counted.

## Implementation Notes

- Implementation: `shared/src/search/null-query-literal.ts`, updates to `eval-printing.ts`, `eval-leaves.ts`, `evaluator.ts`, `canonicalize.ts`, `query-extension-syntax.ts`, and tests in `shared/`.
