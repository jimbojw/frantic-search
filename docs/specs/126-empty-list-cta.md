# Spec 126: Empty List CTA in Search Results

**Status:** Implemented

**Unified by:** Spec 151 (Suggestion System)

**Depends on:** Spec 125 (MenuDrawer MY LIST), Spec 077 (Query Engine — my:list), Spec 123 (# Metadata Tag Search), Spec 090 (Lists Page), Spec 083 (MenuDrawer)

## Goal

When a user has `my:list` (or `my:default`) or a `#` metadata term in the query, zero results, and an empty default list, show a contextual empty state with an informative message and a call-to-action (CTA) to visit the My List page to import a deck.

## Background

Spec 125 adds a MY LIST section at the top of the MenuDrawer with an always-present `my:list` chip. A new user may tap it to discover what it does. The query becomes `my:list`, which returns zero results when the list is empty. The generic "No cards found" message does not explain why or how to fix it. This spec addresses that by showing a targeted CTA when the conditions align. Similarly, a user may type `#` or `#ramp` (deck tag search per Spec 123); with an empty list, the metadata index is empty and the query returns zero results.

## Trigger Conditions

All of the following must hold for the empty-list CTA to appear:

1. **List-context in query** — The query contains a positive `my:list`/`my:default` term **or** a positive `#` metadata term (e.g. `#`, `#ramp`, `#combo`). Both require a non-empty list to return results; when the list is empty, both yield zero.
2. **`totalCards() === 0`** — The search returned zero results.
3. **Default list is empty** — `cardListStore.getView().instancesByList.get(DEFAULT_LIST_ID)?.size ?? 0 === 0`.
4. **`cardListStore` present** — List feature is enabled.
5. **`navigateToLists` present** — Navigation to the Lists page is available.

## Scope

- **In scope:** `my:list`, `my:default`, and `#` metadata queries when the default list is empty.
- **Out of scope:** `my:trash` with empty trash (different flow; not addressed here).

## Design

### Empty-list CTA content

- **Message:** "Your list is empty. Import a deck to search for cards in your list."
- **Primary CTA:** Button or link labeled "Import a deck" or "Go to My List" that calls `navigateToLists()`.
- **Secondary links:** Retain "Try on Scryfall ↗" and "Report a problem" below the primary CTA (same as current empty state).

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

- [x] When `my:list` or `my:default` is in the query, zero results, and the default list is empty, the empty state shows the contextual message and primary CTA.
- [x] Tapping the primary CTA navigates to the My List page (`?list`).
- [x] "Try on Scryfall" and "Report a problem" remain present as secondary links.
- [x] When the list is non-empty but the query returns zero (e.g., `my:list t:planeswalker` with no planeswalkers), the generic "No cards found" is shown (no empty-list CTA).
- [x] When both `include:extras` hint and empty-list CTA could apply, the empty-list CTA is shown.
- [x] Works in both single-pane and Dual Wield layouts.
- [x] When `#` or `#ramp` (or any positive `#` term) is in the query, zero results, and the default list is empty, the empty state shows the same CTA as for `my:list`.
