# Spec 126: Empty List CTA in Search Results

**Status:** Implemented

**Unified by:** Spec 151 (Suggestion System)

**Layout (Spec 151, Spec 152):** Empty-list suggestions appear in the unified SuggestionList below the Results Summary Bar. One row per offending term; chip shows the term in amber with "0 cards (0 prints)", description varies by term type (my vs tag). Same placement as other refinement suggestions.

**Depends on:** Spec 125 (MenuDrawer MY LIST), Spec 077 (Query Engine — my:list), Spec 123 (# Metadata Tag Search), Spec 090 (Lists Page), Spec 083 (MenuDrawer)

## Goal

When a user has `my:list` (or `my:default`), `-my:list`, or a `#` metadata term (e.g. `#ramp`, `-#combo`) in the query and the default list is empty, show one or more refinement suggestions—each targeting an offending term—with a call-to-action (CTA) to visit the My List page to import a deck. The suggestion appears regardless of result count (zero or non-zero).

## Background

Spec 125 adds a MY LIST section at the top of the MenuDrawer with an always-present `my:list` chip. A new user may tap it to discover what it does. The query becomes `my:list`, which returns zero results when the list is empty. The generic "No cards found" message does not explain why or how to fix it. This spec addresses that by showing a targeted CTA when the conditions align. Similarly, a user may type `#` or `#ramp` (deck tag search per Spec 123); with an empty list, the metadata index is empty and the query returns zero results.

## Trigger Conditions

All of the following must hold for the empty-list suggestion(s) to appear:

1. **List-context in query** — The query contains any `my:` term (e.g. `my:list`, `my:default`, `-my:list`) **or** any `#` metadata term (e.g. `#`, `#ramp`, `#combo`, `-#combo`). Positive and negated terms both trigger.
2. **Default list is empty** — `cardListStore.getView().instancesByList.get(DEFAULT_LIST_ID)?.size ?? 0 === 0`.
3. **`cardListStore` present** — List feature is enabled.
4. **`navigateToLists` present** — Navigation to the Lists page is available.

The `totalCards() === 0` constraint is removed. The suggestion appears even when results exist (e.g. `-my:list` with empty list returns all cards).

## Scope

- **In scope:** `my:list`, `my:default`, and `#` metadata queries when the default list is empty.
- **Out of scope:** `my:trash` with empty trash (different flow; not addressed here).

## Design

### Empty-list suggestion content (unified SuggestionList layout, Spec 151)

One row per offending term. Each row uses the same flex-row pattern as other suggestions (chip left, description right):

| Left (chip) | Right (description) |
|-------------|---------------------|
| Offending term (e.g. `my:list`, `#combo`) in amber styling; second line "0 cards (0 prints)"; click navigates to list view | **my:** "This term requires an imported deck list. [Import one now?](navigateToLists)" |
| | **#tag:** "This term requires a list with tags. [Import one now?](navigateToLists)" |

- Chip uses amber styling (Spec 088 error/zero-results) and shows the literal term from the query.
- Tapping the chip calls `navigateToLists()` — same broad semantics as other chips ("click to fix").

### Priority with other hints

When both the `include:extras` hint (Spec 057) and the empty-list CTA could apply (e.g., `my:list` + empty list + playable filter removed results), show the **empty-list CTA** — it is more actionable for new users who have no list yet. The `include:extras` hint addresses "filter hid results"; the empty list is a different problem.

Empty-state priority order: empty-list CTA (Spec 126) > `include:extras` hint (Spec 057) > oracle "did you mean?" hint (Spec 131).

### Data flow

- `SearchContext` gains optional `navigateToLists?: () => void` — navigates to `?list`.
- `SearchContext` gains optional `defaultListEmpty?: Accessor<boolean>` — true when the default list has no instances.
- `App.tsx` and `buildPaneContext` (Dual Wield) populate these when `cardListStore` is present.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/SearchContext.tsx` | Add `navigateToLists?: () => void`, `defaultListEmpty?: Accessor<boolean>` |
| `app/src/App.tsx` | Add `navigateToLists`, `defaultListEmpty` to searchContextValue; pass `navigateToLists` to createPaneState |
| `app/src/pane-state-factory.ts` | Add `navigateToLists?: () => void` to CreatePaneStateOpts; pass through to PaneState |
| `app/src/DualWieldLayout.tsx` | Add `navigateToLists` to PaneState; add `navigateToLists`, `defaultListEmpty` in buildPaneContext |
| `app/src/SearchResults.tsx` | Conditional empty state: when trigger conditions hold, show empty-list CTA instead of generic "No cards found" |
| `docs/specs/090-lists-page.md` | Implementation Notes: reference Spec 126 for empty-state CTA |

## Acceptance Criteria

- [x] When `my:list` or `my:default` is in the query and the default list is empty, a refinement suggestion row appears (chip = term in amber, description = "requires an imported deck list").
- [x] When `-my:list` is in the query and the default list is empty, a refinement suggestion row appears (same chip + description).
- [x] When `#` or `#ramp` (or any `#` term) is in the query and the default list is empty, a refinement suggestion row appears with tag-specific copy ("requires a list with tags").
- [x] Multiple offending terms (e.g. `my:list #combo`) yield multiple rows.
- [x] Tapping the chip navigates to the My List page (`?list`).
- [x] Empty-list suggestions appear in both empty state (zero results) and rider context (non-zero results).
- [x] Works in both single-pane and Dual Wield layouts.
