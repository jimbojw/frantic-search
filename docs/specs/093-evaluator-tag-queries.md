# Spec 093: Evaluator Tag Query Support

**Status:** Implemented

**Depends on:** Spec 091 (ETL Tag Download), Spec 092 (Tag Data Model), Spec 174 (prefix union evaluation; supersedes exact-key / `unknown tag` for non-matching prefix below), ADR-017 (Dual-Domain Query Evaluation), Issue #99 (Epic: otag/atag Support)

## Goal

Wire the evaluator to process `otag:` and `atag:` (alias `art:`) queries using the tag data loaded in the worker (Spec 092). Tag queries behave like other field queries and compose with AND/OR/NOT.

## Background

Spec 092 produces two tag datasets that the worker loads progressively:

| Dataset | Type | Domain | Structure |
|---|---|---|---|
| `otags.json` | Oracle tags | Face | `Record<string, number[]>` — label → sorted canonical face indices |
| `atags.json` | Illustration tags | Printing | `Map<string, Uint32Array>` — label → printing row indices (resolved at load time) |

The worker stores these in `tagDataRef` and passes them to `runSearch`, but the evaluator does not yet consume them.

### Parser / Lexer

No changes required. The parser already produces `FIELD` nodes for `otag:ramp`, `atag:chair`, and `art:chair` — the grammar `WORD operator (WORD | QUOTED)` covers these. The lexer treats `otag`, `atag`, and `art` as `WORD` tokens.

## Field Aliases and Domain Assignment

| Field | Aliases | Canonical | Domain |
|-------|---------|-----------|--------|
| `otag` | `otag` | `otag` | Face |
| `atag` | `atag`, `art` | `atag` | Printing |

- Add to `FIELD_ALIASES` in `shared/src/search/eval-leaves.ts`: `otag: "otag"`, `atag: "atag"`, `art: "atag"`.
- Add `atag` to `PRINTING_FIELDS` in `shared/src/search/eval-printing.ts`.
- `otag` remains face-domain (not in `PRINTING_FIELDS`).

## NodeCache and Tag Data

Tag data loads asynchronously after the worker initializes. The evaluator must read from a mutable ref so that when `otags.json` or `atags.json` arrives, subsequent evaluations see the new data.

- Add optional constructor parameter to `NodeCache`: `tagDataRef?: { oracle: OracleTagData | null; illustration: Map<string, Uint32Array> | null }`.
- At evaluation time, read from this ref when handling `otag` / `atag` fields.
- The worker already constructs `NodeCache` at init; pass `tagDataRef` into the constructor so the cache holds a reference to the same object that gets populated when tag files load.

## Evaluation Logic

**Superseded for matching semantics by [Spec 174](174-otag-atag-prefix-query-semantics.md).** Implement **`otag`** / **`atag`** / **`art`** in **`eval-tags.ts`** (and prepared indices on **`TagDataRef`**) as follows:

- **Normalization:** **`normalizeForTagResolution`** on wire keys and user values (hyphens preserved; not Spec 103 **`normalizeForResolution`**).
- **`:`** — **Boundary-aligned prefix union** over tag keys; OR face or printing indices into the leaf buffer.
- **`=`** / **`!=`** — Exact match / negation of exact on **`normKey`** per Spec 174.
- **Non-empty** value with **no** matching key under the active operator → **`unknown oracle tag "…"`** / **`unknown illustration tag "…"`** (passthrough, Spec 039), not silent zero-hit.
- **Empty** value (trimmed) — **ADR-022 §5** exception: matches every face/printing with **≥1** tag in the loaded index; empty **`!=`** inverts that set. See Spec 174.
- **Tag data not loaded:** **`oracle tags not loaded`** / **`illustration tags not loaded`** when the corresponding ref is null.

### Negation

`-otag:ramp` and `-atag:chair` work via the existing NOT node — the child FIELD produces a buffer, and NOT inverts it. No special handling.

## Evaluator Integration Points

1. **`computeTree` for FIELD nodes:** Before `evalLeafField` / `evalPrintingField`, detect `otag` and `atag` and branch to tag evaluation. Tag evaluation can live in a new module `eval-tags.ts` or inline in the evaluator.
2. **`_hasPrintingLeaves`:** Add `atag` so that `otag:ramp set:mh2` correctly triggers printing-domain handling. `otag` is face-domain, so `_hasPrintingLeaves(otag:ramp)` returns false.
3. **`_intersectPrintingLeaves`:** Include `atag` when intersecting printing-domain leaves (for unique:prints/art expansion).
4. **Face-fallback:** Tags do not have a face-domain fallback. If tag data is not loaded, return an error.

## Worker and runSearch

- Pass `tagDataRef` into `NodeCache` constructor in `app/src/worker.ts`.
- `runSearch` already receives `tagData`; it is passed to the cache via the constructor. No change to `runSearch` signature beyond ensuring the worker passes the ref when constructing the cache.

## CLI parity

Non-browser consumers (`cli/` `search`, `diff`, `list-diff`, `compliance` local mode) must pass the same `tagDataRef` shape into `NodeCache` or `otag:` / `atag:` evaluation will behave as “tags not loaded.” Implementation: `cli/src/cli-eval-refs.ts` loads disk files next to `columns.json` and uses `shared/src/supplemental-index-build.ts` for atag resolution and flavor/artist key normalization (same as the worker).

## Syntax Highlighting

No changes. `otag`, `atag`, and `art` will be in `FIELD_ALIASES`, so they receive field styling. `value-error` vs `value-zero` comes from the breakdown (`error` vs `matchCount === 0`), which the evaluator will set correctly.

## Autocomplete

Implemented in Spec 094. Tag labels are sent with `otags-ready` and `atags-ready` messages for autocomplete.

## File Organization

| File | Changes |
|------|---------|
| `shared/src/search/eval-leaves.ts` | Add `otag`, `atag`, `art` to `FIELD_ALIASES` |
| `shared/src/search/eval-printing.ts` | Add `atag` to `PRINTING_FIELDS` |
| `shared/src/search/eval-tags.ts` | New: `evalOracleTag`, `evalIllustrationTag` |
| `shared/src/search/evaluator.ts` | Accept `tagDataRef`, add tag evaluation in `computeTree`, update `_hasPrintingLeaves` and `_intersectPrintingLeaves` |
| `app/src/worker.ts` | Pass `tagDataRef` to `NodeCache` constructor |
| `cli/src/cli-eval-refs.ts` | Build `tagDataRef` from dist JSON for CLI commands |
| `shared/src/supplemental-index-build.ts` | Shared atag resolution + flavor/artist index normalization (worker + CLI) |

## Types

`OracleTagData` and the illustration tag map type are already defined in `shared/src/data.ts` and used by the worker. The evaluator imports these as needed.

## Testing (TDD)

Per `shared/AGENTS.md`, use TDD for evaluator code:

1. `otag:ramp` with oracle tags loaded → matches expected face indices.
2. `otag:nonexistent` with oracle tags loaded → **zero** matches, **no** error (Spec 174).
3. `otag:ramp` with oracle tags not loaded → error `oracle tags not loaded`.
4. `atag:chair` with illustration tags loaded → matches expected printing indices.
5. `atag:nonexistent` with illustration tags loaded → **zero** matches, **no** error (Spec 174).
6. `atag:chair` with illustration tags not loaded → error `illustration tags not loaded`.
7. `-otag:ramp` and `-atag:chair` → negation works correctly.
8. `otag:ramp set:mh2` → face and printing domains compose correctly.
9. `art:chair` as alias for `atag:chair` → same behavior.
10. Tag with 0 matches (e.g. tag exists but has no cards in our dataset) → no error, matchCount 0.

## Acceptance Criteria

1. `otag:label` evaluates in face domain using `tagDataRef.oracle`.
2. `atag:label` and `art:label` evaluate in printing domain using `tagDataRef.illustration`.
3. A prefix that matches no tag key produces **zero** results, not `unknown tag` (Spec 174).
4. Tag data not loaded produces an appropriate error.
5. Negation (`-otag:`, `-atag:`) works via the existing NOT node.
6. Tag queries compose with other face- and printing-domain conditions.
7. `FIELD_ALIASES` includes `otag`, `atag`, and `art`.
8. `atag` is in `PRINTING_FIELDS`.

## Implementation Notes

- 2026-03-07: Implemented per spec. Added `eval-tags.ts` with `evalOracleTag` and `evalIllustrationTag`; extended `FIELD_ALIASES` and `PRINTING_FIELDS`; `NodeCache` accepts optional `tagDataRef`; worker passes `tagDataRef` to cache constructor. Tag evaluation branches in `computeTree` handle `otag` (face domain) and `atag` (printing domain) before `evalLeafField` / `evalPrintingField`.
- 2026-03-31: Prefix union evaluation and removal of `unknown tag` for non-matching prefix (Spec 174). Evaluator no longer calls `resolveForField` for `otag` / `atag` on the eval path.
