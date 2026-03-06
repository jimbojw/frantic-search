# Spec 084: MenuDrawer View Consolidation

**Status:** Implemented

**Depends on:** Spec 083 (MenuDrawer), Spec 048 (unique: semantics), Spec 054 (Pinned Search Criteria), Spec 057 (include:extras)

**Modifies:** Spec 083 (VIEWS layout), Spec 044 (remove modifiers from TERMS)

## Goal

Consolidate all view-affecting terms in the MenuDrawer VIEWS section. Add a mutually exclusive `unique:` row (cards | art | prints), move `include:extras` into VIEWS, and remove these modifiers from the TERMS sections. Implement minimum-viable-change logic for `unique:cards`: append only when the pinned query's effective unique value is non-cards; otherwise splice out the live query's unique term.

## Background

### Current behavior (Spec 083)

- **VIEWS:** Four chips (`v:slim`, `v:detail`, `v:images`, `v:full`) at the top of the MenuDrawer.
- **TERMS:** The sections formats, roles, rarities, and printings each have a modifier row at the bottom containing `unique:prints` and `include:extras` chips.

### Problem

`unique:prints` and `include:extras` are view-affecting modifiers, not filters. They control how results are displayed (deduplication, playability filter) rather than which cards match. Grouping them with format/rarity/printing filters is conceptually wrong. Additionally, only `unique:prints` is exposed; `unique:cards` and `unique:art` have no UI.

## Design

### VIEWS section layout (three rows)

```
VIEWS
[v:slim] [v:detail] [v:images] [v:full]
[unique:cards] [unique:art] [unique:prints]
[include:extras]
```

### Row 1: View mode (unchanged)

Four chips: `v:slim`, `v:detail`, `v:images`, `v:full`. Behavior unchanged from Spec 083.

### Row 2: Unique mode (mutually exclusive)

Three chips: `unique:cards`, `unique:art`, `unique:prints`. Exactly one is active at any time. Active chip = matches effective `uniqueMode` from pinned + live query (last legal `unique:` term wins; default `cards` per Spec 048).

Tapping a chip calls `changeUniqueMode(mode)`, which makes the minimum viable edit to the live query.

**Minimum viable change for `unique:cards`:**
- **Pinned has a different unique:** (e.g. `unique:art`) — append `unique:cards` to live to override.
- **Pinned empty or has no unique:** — splice out the unique term from live (no append).

**Minimum viable change for `unique:art` / `unique:prints`:**
- Always clear all unique terms from live, then append the desired term.

### Row 3: include:extras (unchanged behavior)

Single chip: `include:extras`. Simple on/off toggle. Behavior unchanged from Spec 057; only location changes (moves from TERMS modifier rows to VIEWS).

### TERMS cleanup

Remove `unique:prints` and `include:extras` from the modifier rows of formats, roles, rarities, and printings. FORMATS, LAYOUTS, ROLES, LANDS, RARITIES, PRINTINGS, PRICES, and SORT sections no longer show these chips.

### Data source

MenuDrawer uses `useSearchContext()`:

- `uniqueMode()` — already provided (from worker effective query)
- `changeUniqueMode(mode)` — new; edits live query per the rules above
- `hasIncludeExtras(breakdown)` — for include:extras chip state (from live query breakdown)
- `toggleIncludeExtras` — for include:extras chip tap (unchanged)

### clearUniqueTerms

Removes all `unique:` terms from the live query, including aliases:
- `unique:cards`, `unique:art`, `unique:prints`
- `++` (alias for `unique:prints`)
- `@@` (alias for `unique:art`)

Predicate: `isFieldLabel(['unique'], [':'])` OR `label === '++'` OR `label === '@@'` (breakdown labels may show display form).

### setUniqueTerm

**Signature:** `setUniqueTerm(liveQuery, liveBreakdown, pinnedQuery, desiredMode): string`

**Logic:**
1. `cleared = clearUniqueTerms(liveQuery, liveBreakdown)`
2. `effectiveAfterClear = getUniqueModeFromQuery(pinnedQuery + ' ' + cleared)` (from `@frantic-search/shared`)
3. If `desiredMode === 'cards'`:
   - If `effectiveAfterClear === 'cards'`: return `cleared` (no append)
   - Else: return `appendTerm(cleared, 'unique:cards', parseBreakdown(cleared))`
4. Else (`desiredMode === 'art'` or `'prints'`): return `appendTerm(cleared, 'unique:' + desiredMode, parseBreakdown(cleared))`

## Scope of Changes

| File | Change |
|------|--------|
| `docs/specs/084-menu-drawer-view-consolidation.md` | New spec (this document). |
| `docs/specs/083-menu-drawer.md` | Add "Extended by Spec 084" note. |
| `app/src/query-edit.ts` | Add `clearUniqueTerms`, `setUniqueTerm`. Remove or deprecate `toggleUniquePrints`/`hasUniquePrints` if no longer used. |
| `app/src/App.tsx` | Add `changeUniqueMode`, pass to SearchContext. |
| `app/src/SearchContext.tsx` | Add `changeUniqueMode: (mode: UniqueMode) => void` to interface. |
| `app/src/MenuDrawer.tsx` | Expand VIEWS to 3 rows; add UniqueChip row (cards/art/prints), IncludeExtrasChip row; remove modifiers from TERMS sections. |

## Acceptance Criteria

1. VIEWS section has three rows: v:, unique:, include:extras.
2. unique: row shows exactly one active chip; tapping sets effective mode.
3. When pinned has `unique:art` and user taps `unique:cards`, live query gets `unique:cards` appended.
4. When pinned is empty and live has `unique:art`, tapping `unique:cards` splices out `unique:art` (no append).
5. `include:extras` appears only in VIEWS; removed from FORMATS, ROLES, RARITIES, PRINTINGS modifier rows.
6. All existing tests pass; add tests for `setUniqueTerm` and `clearUniqueTerms`.

## Edge Cases

- **Pinned has `unique:prints`, live empty:** Tap cards → append `unique:cards`.
- **Pinned empty, live has `unique:art`:** Tap cards → remove `unique:art` from live.
- **Pinned has `unique:art`, live has `unique:prints`:** Tap cards → clear live (removes prints), effectiveAfterClear = art; append `unique:cards`.
- **Aliases:** User has `@@` in query; clear must remove it (predicate matches `@@`).
