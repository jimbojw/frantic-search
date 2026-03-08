# Spec 096: Name Comparison Operators

**Status:** Draft

**Depends on:** Spec 002 (Query Engine), Spec 059 (Sort Directives)

**Enables:** Spec 095 (Percentile Filters) — name percentile queries (`name>50%`) require comparison operators as a prerequisite.

## Goal

Add comparison operators (`>`, `<`, `>=`, `<=`) to the `name` field so users can filter by alphabetical position. For example, `name>M` returns cards whose names come after "M" in sort order, and `name<=Light` returns cards in the first part of the alphabet.

## Background

The `name` field currently supports only `:` and `=` with substring (containment) semantics: `name:bolt` matches any card whose name contains "bolt". Scryfall does not support comparison operators on name. This is a principled Frantic Search enhancement that enables alphabetical range queries and, as a prerequisite, name percentile queries (Spec 095).

## Semantics

### Operator dispatch

The operator determines semantics. No mixing within a single term:

| Operator | Semantics |
|----------|-----------|
| `:`, `=` | Substring match (containment) — existing behavior, unchanged |
| `>`, `<`, `>=`, `<=` | Lexicographic comparison — new |

### Lexicographic comparison

Full string comparison using the same normalization as `sort:name` (so that `name>X` and `sort:name` align semantically):

- **Normalization:** Lowercase, strip non-alphanumeric. Uses `combinedNamesNormalized` (same as `ordering.ts`'s `compareName`).
- **Query value:** Normalize the same way before comparison. `name>M` compares card names to `"m"`.
- **Quoted values:** Quoted values (e.g. `name>="Aang's Defense"`) are accepted and normalized the same way.
- **Inclusive bounds:** `>=` and `<=` use standard "or equal to" — the equals sign is part of the comparison, not the query operator.

| Query | Meaning |
|-------|---------|
| `name>M` | Names that come after "M" alphabetically |
| `name>=M` | Names at or after "M" |
| `name<M` | Names that come before "M" |
| `name<=M` | Names at or before "M" |

Examples: `name>=M` matches "Mountain", "Metalworker", "Zephyr" but not "Lightning Bolt". `name<=Light` matches "Lightning Bolt", "Lightning Greaves", "Light", and any name before "Light" in sort order.

### Negation

`-name>M` yields the same result as `name<=M` (operator inversion). Extend the evaluator's negation path (cf. Spec 080 for `usd`) to apply operator inversion when the child is a `name` FIELD with a comparison operator.

## Implementation

### eval-leaves.ts

In the `name` case, branch on operator before evaluation:

1. If operator is `>`, `<`, `>=`, or `<=`: apply lexicographic comparison.
   - Normalize the value: `val.toLowerCase().replace(/[^a-z0-9]/g, "")`
   - For each face `i`, compare `index.combinedNamesNormalized[cf[i]]` to the normalized value using `localeCompare` or equivalent.
   - Mark `buf[cf[i]] = 1` when the comparison matches the operator.
2. Else (operator is `:`, `=`, `!=`): existing substring logic, unchanged.

### evaluator.ts

Extend the NOT-case operator-inversion path to include `name` when the operator is a comparison op. When child is `FIELD` with canonical `name` and operator in `{>`, `<`, `>=`, `<=}`, evaluate with inverted operator instead of buffer inversion.

### Canonicalization

Name comparison queries have no Scryfall equivalent. Strip them from Scryfall outlinks (same as `usd=null`, percentile queries).

### Error handling

- **Regex with comparison operator:** `name>/foo/` produces a `REGEX_FIELD` node. Return error: `"name field does not support comparison operators with regex; use a literal value (e.g. name>M)"`. Implement in `evalLeafRegex`: when field is `name` and operator is `>`, `<`, `>=`, or `<=`, return this error before attempting regex match.

## File Organization

| File | Changes |
|------|---------|
| `shared/src/search/eval-leaves.ts` | Branch on operator in `name` case; add lexicographic comparison path; in `evalLeafRegex`, when field is `name` and operator is `>`, `<`, `>=`, or `<=`, return error |
| `shared/src/search/evaluator.ts` | Extend negation path: `name` with comparison op → operator inversion |
| `shared/src/search/canonicalize.ts` | Strip `name>` / `name<` / `name>=` / `name<=` from Scryfall serialization |

## Testing (TDD)

1. `name>M` returns cards whose normalized name is after "m".
2. `name>=M` includes cards whose names start with M or come after.
3. `name<M` returns cards before "m".
4. `name<=M` includes cards at or before "m".
5. `name:bolt` and `name=bolt` unchanged (substring match).
6. `-name>M` equals `name<=M`.
7. `name>Lightning` returns "Lightning Greaves", "Lightning Bolt", "Mountain", etc. (full string comparison, not prefix).
8. `name>=Lightning` includes "Lightning Bolt" (equal) and names after.
9. `name>/foo/` returns error: name does not support comparison operators with regex.
10. `name>="Aang's Defense"` finds "Aang's Defense" (quoted value normalized same as card names).

## Acceptance Criteria

1. `name>X`, `name<X`, `name>=X`, `name<=X` evaluate using full lexicographic comparison (same normalization as `sort:name`).
2. `name:X` and `name=X` retain substring semantics.
3. `-name>X` yields `name<=X` (operator inversion).
4. Spec 095's `name>50%` works once this spec is implemented.
5. `name>/pattern/` returns error (regex does not support comparison operators).
6. Quoted values (e.g. `name>="Foo-Bar"`) are normalized and work correctly.

## Spec 002 Alignment

When implemented, update Spec 002's Supported Fields table: for `name`, change Comparison semantics from "Exact match (case-insensitive)" to "Substring (`:`, `=`); lexicographic comparison (`>`, `<`, `>=`, `<=`)".
