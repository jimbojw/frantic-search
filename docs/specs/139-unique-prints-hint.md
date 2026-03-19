# Spec 139: Recommend `unique:prints` When Printings Hidden

**Status:** In Progress

**Implements:** [GitHub #155](https://github.com/jimbojw/frantic-search/issues/155)

**Depends on:** Spec 048 (Printing-Aware Display), Spec 057 (include:extras)

## Goal

When search results are deduplicated by `unique:cards` or `unique:art`, additional printings of matching cards are hidden. Suggest `unique:prints` so users can reveal them, analogous to the existing `include:extras` hint for playable-filtered results.

## Background

Spec 057 adds a rider when the playable filter hides results: "N cards (M printings) not shown. Try again with `include:extras`?" Another way results are hidden is when `unique:cards` (default) or `unique:art` deduplicates printings — only one row per card (or per artwork) is shown.

When there are additional printings and `unique:prints` is not already the effective deduplication mode, we should suggest switching to `unique:prints`.

## Design

### When to show the hint

Show the hint when **all** of the following hold:

1. **`uniqueMode` is `cards` or `art`** — `unique:prints` is not already effective.
2. **Printing data is available** — `printingIndices` exists and has length > 0.
3. **Printings are hidden** — `totalPrintingItems > totalDisplayItems`. The display layer deduplicates; when the raw printing count exceeds the displayed count, printings are hidden.

### Message and placement

**Empty results:** When `totalCards === 0` but the query would return results with `unique:prints`, we do not special-case this. The hint appears only when there are **non-empty** results with hidden printings. (Zero-result flows are handled by `include:extras` and oracle hint.)

**Non-empty results:** Add a rider below the results list (same location as the `include:extras` rider):

> Additional printings not shown. Try again with `unique:prints`?

- The `unique:prints` term is clickable and appends it to the query (same pattern as `include:extras`).
- Styled consistently with the existing rider (gray text, clickable chip).

### Ordering with `include:extras`

When **both** hints apply (hidden printings due to deduplication **and** hidden cards due to playable filter), show **`unique:prints` first**, then `include:extras`:

1. "Additional printings not shown. Try again with `unique:prints`?"
2. "N cards (M printings) not shown. Try again with `include:extras`?"

Rationale: The user sees results; the most immediate way to expand them (show more printings) is `unique:prints`. The playable filter hint addresses a different kind of hidden content.

### Scope of changes

| File | Change |
|------|--------|
| `docs/specs/139-unique-prints-hint.md` | New spec (this document). |
| `app/src/SearchResults.tsx` | Add `unique:prints` hint rider when `uniqueMode !== 'prints'` and `totalPrintingItems > totalDisplayItems`. Order before `include:extras` when both apply. |

No worker protocol changes. The display layer already has `totalPrintingItems`, `totalDisplayItems`, and `uniqueMode`; the hint is computed client-side.

## Acceptance Criteria

1. When `uniqueMode` is `cards` or `art` and `totalPrintingItems > totalDisplayItems`, a rider appears: "Additional printings not shown. Try again with `unique:prints`?"
2. Clicking the `unique:prints` chip appends it to the query.
3. When both `unique:prints` and `include:extras` hints apply, the `unique:prints` hint appears first.
4. When `uniqueMode` is `prints`, the hint does not appear.
5. When printing data is not loaded or `printingIndices` is empty, the hint does not appear.
