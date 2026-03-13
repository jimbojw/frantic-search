# Spec 058: View Mode as Query Term

**Status:** Implemented

**Depends on:** Spec 041 (Result Display Modes), Spec 054 (Pinned Search Criteria), Spec 052 (Scryfall Outlink Canonicalization)

**Supersedes:** Spec 041 § "View mode persistence", § "View mode signal"

**Extended by:** Spec 083 (MenuDrawer) — adds `v:` as alias for `view:`; MenuDrawer VIEWS chips use `view:slim`, `view:detail`, `view:images`, `view:full`.

**GitHub Issue:** [#59](https://github.com/jimbojw/frantic-search/issues/59)

## Goal

Move display view mode (Slim | Detail | Images | Full) from `localStorage` persistence to a query-level field term. This allows users to persist view preferences via the pinned query and share view mode via URL, consistent with how `unique:prints` and other modifiers work.

## Background

Currently, view mode is persisted in `localStorage` as `frantic-view-mode`. With the pinned query feature (Spec 054), query-level display preferences can be persisted naturally. A user who always wants Images view can pin `view:images` alongside other criteria.

## Design

### Field syntax

- `view:slim`, `view:detail`, `view:images`, `view:full`
- `v:slim`, `v:detail`, `v:images`, `v:full` — `v:` is an alias for `view:` (Spec 083)

The `view` (or `v`) field is a display modifier (like `unique:prints`), not a filter. The evaluator does not process it as a filter — it is extracted before or during evaluation and passed to the display layer. The app derives the active view mode from the effective query (pinned AND live).

### Normalization rules

1. **Last one wins.** If there are multiple `view:` terms in the combined pinned/live query, the **last one** determines the display mode.
2. **Toggle updates.** When the user taps a Slim | Detail | Images | Full button, the app must:
   - **Trim** invalid `view:` terms (splice them out).
   - **Normalize** the live query by removing all `view:` terms from live.
   - Compute effective view from pinned + cleared-live. If it already equals the selected mode (e.g. pinned has `view:images`, user tapped Images), do not append — the pinned query supplies it. Otherwise, append `view:{mode}` (using standard append semantics that may seal the query).
3. **Pin/unpin.** When the user pins or unpins a chip that represents a `view:` term, the same procedure applies: trim invalid `view:` terms, normalize the destination query, then update, append or prepend the term.

### Default and fallback

- When the effective query has no valid `view:` term, the default is **images**.
- Invalid values (e.g. `view:invalid`, typos) are treated as errors: they are **ignored** for determining display state and must be **trimmed** (spliced out) before consolidation. For example, if the live query has `view:images view:invalid` and the user taps Detail, first `view:invalid` is spliced out, then `view:images` is replaced with `view:detail`.

### Migration

On first load after this change, if `localStorage` contains `frantic-view-mode` and the pinned query has no `view:` term, the app should migrate: append `view:{stored}` to the pinned query (this once) and clear `frantic-view-mode`. This preserves existing user preferences.

### URL sharing

Because the live query is in the URL (`?q=`), sharing a link like `?q=lightning view:images` will share both the search and the view mode with the recipient.

## Scope of changes

| File | Change |
|------|--------|
| `shared/src/search/evaluator.ts` | Handle `view:` and `v:` FIELD nodes as match-all (like `unique:prints`). Invalid values produce error or are ignored. |
| `shared/src/search/canonicalize.ts` | Skip `view:` and `v:` FIELD nodes in `serializeNode` (strip from Scryfall outlinks). |
| `shared/src/search/query-for-sort.ts` | Strip `v:` in addition to `view:` when building sort seed. |
| `app/src/view-query.ts` (new) | `extractViewMode(effectiveQuery): ViewMode` — parse, find last valid `view:` or `v:` node. |
| `app/src/query-edit.ts` | Add `setViewTerm(query, breakdown, mode)` — clear all `view:` and `v:` terms, append `v:{mode}` (or `view:{mode}`). Extend `VIEW_FIELDS` / `isViewLabel` to recognize `v`. |
| `app/src/App.tsx` | Derive `viewMode` from effective query; `changeViewMode` calls `setViewTerm` on live query; migration logic. |

**Spec 083 extension:** Add `v:` as alias for `view:`. All consumers (evaluator, canonicalize, view-query, query-edit, query-for-sort) must recognize both field names. MenuDrawer VIEWS chips display `view:slim`, `view:detail`, `view:images`, `view:full`.

## Acceptance criteria

1. Tapping Slim | Detail | Images | Full updates the live query with the corresponding `view:` term.
2. When multiple `view:` terms exist in the effective query, the last one wins.
3. View mode is derived from the effective query (pinned AND live), not from `localStorage`.
4. Pinning a chip that contains a `view:` term moves it to the pinned query with proper normalization.
5. Unpinning a `view:` chip from pinned moves it to the live query with proper normalization.
6. When the effective query has no valid `view:` term, the default is Images.
7. Invalid `view:` values are ignored for display state and are trimmed (spliced out) before consolidation when the user changes view mode.
8. The evaluator ignores `view:` for filtering (it is a display modifier only).
9. Migration from `frantic-view-mode` in `localStorage` preserves existing preferences on first load.
10. Scryfall outlinks (Spec 052) strip `view:` terms from the canonicalized query.
11. The sort seed (Spec 019) omits `view:` terms so toggling view mode does not reshuffle results (Issue #62).

## Implementation Notes

- 2026-03-08: Spec 107 adds `display:` as Scryfall alias for `view:`. `VIEW_FIELDS` extended to include `display`; `extractViewMode` and `clearViewTerms` recognize `display:`. Scryfall outlinks add `&as=` URL param when view mode is non-slim.
