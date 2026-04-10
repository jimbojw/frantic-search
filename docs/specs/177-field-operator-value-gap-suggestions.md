# Spec 177: Field operator–value gap suggestions (Scryfall-style spacing)

**Status:** Implemented

**Depends on:** Spec 151 (Suggestion System), Spec 002 (Query Engine — whitespace-aware field clauses, GitHub #240), Spec 036 (Source Spans)

**Addresses:** UX follow-up to [GitHub #240](https://github.com/jimbojw/frantic-search/issues/240) — users who type a **space between the field operator and the value** get a `FIELD` with an **empty** value and a separate **`BARE`** term; combined results are often zero. Offer a targeted rewrite that **removes the gap** when evaluation proves it helps.

## Goal

When the effective query returns **zero cards** and the parse contains at least one **`FIELD` with empty `value` immediately followed by a `BARE` sibling** in the same `AND` group, suggest joining operator and value **without whitespace** (Scryfall-style). Only emit the suggestion when the rewritten query returns **`cardCount > 0`** via the same `evaluateAlternative` path as Specs 156–157.

Teach users briefly: **no space between the operator and the value**.

## Background

After #240, `ci: blue` parses as `AND(FIELD("ci", ":", ""), BARE("blue"))` rather than `FIELD("ci", ":", "blue")`. Many users expect Scryfall-style adjacency; `ancestral ci: blue` can return **zero** results while `ancestral ci:blue` matches cards.

This is **suggestion-only** — parser and evaluator behavior are unchanged.

## Design

### Detection (normative)

1. Use the **parsed AST** of the **effective query string** (trimmed as elsewhere in suggestion building) and the **original query string** for slices.
2. Walk the AST and collect **gap pairs** from **`AND` nodes**:
   - For each `AND`’s `children`, for each index `i` from `0` to `length - 2`, consider the consecutive pair `(children[i], children[i+1])`.
   - **Match** when `children[i]` is `FIELD` with `value === ""`, both nodes have **`span`**, and `children[i+1]` is `BARE` (quoted or unquoted).
   - **Guard:** `query.slice(field.span.end, bare.span.start)` must contain **only** whitespace characters (otherwise skip — not a simple operator/value gap).
   - **Replacement text:** `query.slice(field.span.start, field.span.end) + query.slice(bare.span.start, bare.span.end)` (preserves user casing and quoting on the value token).
   - **Splice span:** `{ start: field.span.start, end: bare.span.end }`.
3. **Recursion:** For each child of `AND`, recursively collect from nested `AND` / `OR` subtrees. For **`OR`**, recurse into each child. **Do not** recurse into **`NOT`** in v1 (negation boundaries make “merge” ambiguous).
4. **Multiple pairs:** Collect all pairs, **dedupe** identical splice spans, sort by `span.start` **descending**, apply splices sequentially on a working copy of the query to produce **one** `cleanedQuery`. Emit **at most one** suggestion per distinct `cleanedQuery` for this trigger class.

### Suggestion model

| Property | Value |
|----------|--------|
| **`id`** | `field-value-gap` |
| **`priority`** | **15** — after `nonexistent-field` (14), before `bare-term-upgrade` (16) |
| **`variant`** | `rewrite` |
| **`explain`** | Teaching copy, e.g. omit space between operator and value (Scryfall-style) |
| **`docRef`** | `reference/syntax` |
| **`label`** | Fixed clause snippet(s): space-separated fragments in query order (e.g. `ci:blue`; multiple gaps → `ci:blue o:surveil`). Fallback short label if needed. |
| **`query`** | **Live** query after all gap fixes (same string `setQuery` receives; Spec 151 / Issue #258). Detection uses the effective query AST; derive the live apply string when pinned + live (e.g. prefix-strip sealed pinned + space from the cleaned effective string when the pinned half is unchanged). |
| **`count` / `printingCount`** | From `evaluateAlternative` when `cardCount > 0` |

### Trigger conditions (worker)

1. `totalCards === 0`.
2. Same **pinned empty** gate as Spec 131 / 154 (`!(hasPinned && pinnedIndicesCount === 0)`).
3. `hasLive` (live query contributes to the search) as for other empty-state refinements.
4. `cleanedQuery !== effectiveQuery` (after normalization consistent with implementation).
5. `evaluateAlternative(cleanedQuery)` yields **`cardCount > 0`**.
6. **Dedup:** Omit if another suggestion in the same `buildSuggestions` pass already emitted the same `query` string.

**Placement:** Empty state only (no rider in v1).

## Out of scope (v1)

- Space **before** the operator (`kw :foo`) — different parse shape (not `FIELD` + `BARE` as defined above).
- **Regex** value after a gap (`REGEX_FIELD` vs. split tokens) — not required for MVP.
- **`NOT`** subtrees — no merging inside negated groups in v1.
- Educational chip when `cardCount === 0` after merge.
- Queries with **`totalCards > 0`**.

## Tests

- **Shared:** `field-operator-gap-cleanup.test.ts` — eligible vs ineligible gaps; whitespace guard; quoted value token; multiple pairs in one query; nested `(ci: blue)`; no suggestion when non-whitespace between spans.
- **Worker:** Integration test that a zero-result query matching the pattern yields `field-value-gap` with positive count when data supports it (optional if covered by shared + manual).

## Acceptance criteria

1. `ci: blue` (and `ancestral ci: blue` when the dataset yields hits for the merged form) can surface a `field-value-gap` suggestion with **`priority` 15** and correct **`query`** / **`label`**.
2. Tapping applies the rewrite via the same path as other Spec 151 rewrites (`setQuery` with the **live** `query` payload).
3. Suggestion does **not** appear when the gap contains non-whitespace or when merged query still returns zero results.
4. No duplicate row when another trigger emits the same `query`.
5. `npm test` and `npm run typecheck` pass.

## Scope of changes

| Area | Change |
|------|--------|
| `docs/specs/177-…` (this file) | Spec |
| `docs/specs/151-suggestion-system.md` | Priority row, type union, migration/placement |
| `docs/specs/002-query-engine.md` | Optional cross-ref to recovery UX |
| `app/src/docs/reference/scryfall/differences.mdx` | Optional note on suggestion |
| `shared/src/field-operator-gap-cleanup.ts` | Detection + `cleanedQuery` / `label` |
| `shared/src/field-operator-gap-cleanup.test.ts` | Unit tests |
| `shared/src/index.ts` | Re-export |
| `shared/src/suggestion-types.ts` | `field-value-gap` id |
| `app/src/worker-suggestions.ts` | Emit suggestion |
| `app/src/SuggestionList.tsx` | `EMPTY_STATE_IDS` |

## Implementation notes

- Implementation: [`shared/src/field-operator-gap-cleanup.ts`](../../shared/src/field-operator-gap-cleanup.ts), [`app/src/worker-suggestions.ts`](../../app/src/worker-suggestions.ts).
