# Spec 061: Date Query Semantics — Scryfall Parity + Narrow-as-You-Type

**Status:** Implemented

**Depends on:** Spec 047 (Printing Query Fields), Spec 052 (Scryfall Outlink Canonicalization)

**GitHub Issue:** [#61](https://github.com/jimbojw/frantic-search/issues/61)

## Goal

Align Frantic Search's `date:` and `year:` fields with Scryfall's semantics for complete values while preserving the narrow-as-you-type affordance for partial input. Replace the current scalar date model with a unified range-based model.

## Background

Frantic Search's `date:` field currently diverges from Scryfall in three ways:

1. **Year-only queries** — `date=2025` is treated as exact match to `2025-01-01` instead of the full year range `[2025-01-01, 2026-01-01)`.
2. **Year-month queries** — `date=2025-02` is treated as exact match to `2025-02-01` instead of the full month range `[2025-02-01, 2025-03-01)`.
3. **Partial-date padding** — All partial dates (e.g. `date>202`) pad to the floor (round down). For `<` and `<=`, rounding up would be more generous to the user as they type.

This spec describes the **new expected behavior**: a unified range-based model that aligns with Scryfall for complete values and preserves Frantic Search's narrow-as-you-type affordance for partial input.

## Unified Range Model

**Every date query becomes a range query.** A date value (partial or complete) maps to a half-open interval `[lo, hi)` based on its granularity. Operators then apply to that range.

### Granularity and Range Mapping

| Input      | Granularity   | Range [lo, hi)           |
| ---------- | ------------- | ------------------------- |
| 2025       | year          | [2025-01-01, 2026-01-01) |
| 2025-02    | month         | [2025-02-01, 2025-03-01) |
| 2025-02-15 | day           | [2025-02-15, 2025-02-16) |
| 202        | partial year  | [2020-01-01, 2030-01-01) |
| 2025-0     | partial month | [2025-01-01, 2025-10-01) |
| 2025-02-1  | partial day   | [2025-02-10, 2025-02-20) |

For partial values, each component is expanded to the full span it could represent: pad down for `lo`, pad up for `hi`. Each additional character narrows the effective range.

### Operator Semantics

Given a range `[lo, hi)` for the date value, and `floorNext` = first day after the floor (for partial year: lo + 1 year; for complete values: hi):

| Operator | Semantics                           | Equivalent              |
| -------- | ------------------------------------ | ----------------------- |
| `=`, `:` | Card date in range                   | lo <= date < hi         |
| `!=`     | Card date not in range               | !(lo <= date < hi)      |
| `>`      | Strictly after floor                 | date >= floorNext       |
| `>=`     | At or after range start              | date >= lo              |
| `<`      | Strictly before range                | date < lo               |
| `<=`     | Up to (and including) floor          | date < floorNext        |

For **partial year** values (e.g. `202`, `20`, `2`), all comparison operators use floor semantics: the partial expands to its floor (e.g. 202 → 2020), and `>` / `<=` compare against the first day after that floor.

### Examples

| Query        | Interpretation                              |
| ------------ | ------------------------------------------- |
| date=2025    | date >= 2025-01-01 AND date < 2026-01-01    |
| date!=2015   | !(date >= 2015-01-01 AND date < 2016-01-01) |
| date>2025    | date >= 2026-01-01                          |
| date>=2025   | date >= 2025-01-01                          |
| date<2000    | date < 2000-01-01                           |
| date<=2000   | date < 2001-01-01                           |
| date=2025-02 | date >= 2025-02-01 AND date < 2025-03-01   |
| date>2025-02 | date >= 2025-03-01                          |
| date<2025-02 | date < 2025-02-01                           |
| date=202     | date >= 2020-01-01 AND date < 2030-01-01    |
| date>202     | date >= 2021-01-01 (floor: same as date>2020) |
| date>=202    | date >= 2020-01-01                          |
| date<202     | date < 2020-01-01                           |
| date<=202    | date < 2021-01-01 (floor: same as date<=2020) |
| date=2025-0  | date >= 2025-01-01 AND date < 2025-10-01    |

## Scryfall Alignment

For complete values (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`), this model matches Scryfall:

- `date=2025` → year 2025 (Scryfall: "Cards released this year")
- `date>2025` → year > 2025 (dates in 2026 or later)
- `date<2025` → year < 2025 (dates before 2025)
- `date=2025-02` → February 2025
- `date>2025-06` → July 2025 or later
- `date<2025-06` → Before June 2025

## Narrow-as-You-Type

For partial input, comparison operators use floor semantics so the user sees results as they type:

- `date>202` → `date >= 2021-01-01` — same as `date>2020`; user sees cards after 2020
- `date>=202` → `date >= 2020-01-01` — at or after floor
- `date<202` → `date < 2020-01-01` — before floor
- `date<=202` → `date < 2021-01-01` — same as `date<=2020`; user sees cards through 2020
- `date=202` → `[2020-01-01, 2030-01-01)` — equality uses the full decade range
- `date=2025-0` → `[2025-01-01, 2025-10-01)` — Jan through Sept 2025

Each additional character narrows the range. Equality and inequality both use the same generous range; `date!=202` is equivalent to `-date=202`.

## Special Values

- **`now` / `today`** — Resolve to the current date as a single-day range `[today, tomorrow)`.
- **Set codes** (e.g. `date>ori`) — Resolve to the set's `released_at` as a single-day range. Comparison operators apply to that date.

## `year:` Field

The `year:` field inherits the same range-based semantics as `date:` with one caveat: it accepts only `YYYY` (and partial-year prefixes like `202`). Anything beyond the year component is an error.

- `year=202` — Performs identically to `date=202`; can share the same code paths.
- `year=2025` — Performs identically to `date=2025` (year range `[2025-01-01, 2026-01-01)`).
- `year=2025-02` — **Error.** Produces an error from the evaluator. The `date:` field accepts `YYYY-MM`; `year:` does not.

## Scryfall Outlink Canonicalization

For `date:` and `year:` fields in Scryfall outlinks (Spec 052):

- **Complete values** — Emit as-is: `date=2025`, `date=2025-02`, `year=2025`. Scryfall supports these natively.
- **`year:` with a four-digit year and a comparison operator** — Emit the year literal and preserve the operator (e.g. `year>=2024`, `year<=2024`, `year>2023`). Do not expand to `YYYY-MM-DD`; Scryfall’s `year` syntax is year-granular. The `date:` field still expands complete `YYYY` / `YYYY-MM` operands to explicit `YYYY-MM-DD` boundaries where required (see canonicalize tests).
- **Partial values** — Expand to explicit range syntax so Scryfall receives valid queries:
  - `date=202` → `date>=2020-01-01 date<2030-01-01`
  - `date>202` → `date>=2021-01-01`
  - `date>=202` → `date>=2020-01-01`
  - `date<202` → `date<2020-01-01`
  - `date<=202` → `date<2021-01-01`
  - `date!=202` → `-(date>=2020-01-01 date<2030-01-01)`
- **Special values** — Pass through unchanged: `now`, `today`, set codes.

## Implementation Notes

- `parseDateRange(val, pIdx?)` returns `{ lo, hi, floorNext }` in YYYYMMDD format. For partial year (yearSpan > 1), `floorNext = addYears(lo, 1)`; for complete values, `floorNext = hi`.
- The evaluator uses `floorNext` for `>` and `<=` operators; `>=` and `<` use `lo`.
- Canonicalization must use the same range logic so Scryfall outlinks match evaluated results.
- Rows where `released_at === 0` (unknown) remain excluded from all date comparisons.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/search/date-range.ts` | New — `parseDateRange(val, pIdx?)` |
| `shared/src/search/eval-printing.ts` | Replace parseDateLiteral/resolveDateValue; use parseDateRange; apply range operator semantics; year validation |
| `shared/src/search/canonicalize.ts` | Replace padDate with range-based serialization for date/year fields |
| `shared/src/search/eval-printing.test.ts` | Update date/year tests; add range and error cases |
| `shared/src/search/canonicalize.test.ts` | Update date canonicalization tests |
| `shared/src/search/evaluator-printing.test.ts` | Add integration tests |
| `docs/specs/047-printing-query-fields.md` | Update date/year sections to reference this spec |

## Acceptance Criteria

1. `date=2025` returns all cards with at least one printing released in calendar year 2025 (matches Scryfall).
2. `date=2025-02` returns all cards with at least one printing in February 2025.
3. `date>2025` returns only cards with printings in 2026 or later.
4. `date<2025` returns only cards with printings before 2025.
5. `date=202` returns cards with printings in the 2020s (2020–2029).
6. `date>202` returns cards with printings in 2021 or later (same as `date>2020`).
7. `date<202` returns cards with printings before 2020.
8. `date!=2015` is equivalent to `-date=2015`.
9. Partial dates narrow the range as the user types (e.g. `date=2025-0` → Jan–Sept 2025).
10. Scryfall outlink canonicalization produces queries that match Scryfall's expected semantics.
11. `year=202` and `year=2025` behave identically to `date=202` and `date=2025` respectively.
12. `year=2025-02` (or any `year:` value with month/day components) produces an error.
