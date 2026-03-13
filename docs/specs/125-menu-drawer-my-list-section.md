# Spec 125: MenuDrawer MY LIST Section

**Status:** Implemented

**Depends on:** Spec 083 (MenuDrawer), Spec 077 (Query Engine — my:list), Spec 123 (# Metadata Tag Search), Spec 109 (Deck Instance Model)

**Extends:** Spec 083 (MenuDrawer)

## Goal

Add a MY LIST section above VIEWS in the MenuDrawer with an always-present `my:list` tri-state toggle and tri-state chips for each tag from the user's deck list (e.g. `#ramp`, `#commander`).

## Design

### Section order (updated)

1. **MY LIST** — new, top
2. VIEWS
3. TERMS (formats, layouts, …)

### MY LIST content

- **Row 1:** `my:list` chip (always present). Tri-state: neutral | positive | negative. Same cycling behavior as other TERMS chips (Spec 044).
- **Row 2:** One chip per unique tag from `Instance.tags[]` across non-trash lists. Label: `#${tag}` (e.g. `#Ramp`, `#Commander`). Tri-state same as row 1. Sorted alphabetically (case-insensitive).

### Empty list / no tags

When the list is empty or has no tags: show only the `my:list` chip. Tag chips appear only when the deck has at least one tag.

### Data flow

- `SearchContext` has optional `deckTags: Accessor<string[]>` — derived from `cardListStore.getView()` by collecting unique tags from all non-trash Instances.
- Helper: `getUniqueTagsFromView(view: MaterializedView): string[]` in `shared/src/list-mask-builder.ts`. Returns sorted unique tags; excludes trash.
- `App.tsx` and `DualWieldLayout` pass `deckTags` in the search context when `cardListStore` is present.

### Query-edit extensions

- **`findBareNode(breakdown, valuePredicate, negated)`** — find BARE node where `valuePredicate(value)` is true. For negated, matches NOT node whose inner label matches.
- **`cycleMetadataTagChip(query, breakdown, { tag, term })`** — tri-state cycle for `#value`. Uses same pattern as `cycleChip` but for BARE nodes.
- **`getMetadataTagChipState(breakdown, tag)`** — returns `'neutral' | 'positive' | 'negative'` for a tag chip.
- `my:list` uses existing `findFieldNode` and `cycleChip` (field: `['my']`, value: `'list'`).

### Tag display and matching

- Chip label: `#${tag}` using the original tag string from Instance (e.g. `#Ramp`, `#Commander/Partner`).
- Query append: `#${tag}`. Matching is case-insensitive per Spec 123 (normalized alphanumeric substring).

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/list-mask-builder.ts` | Add `getUniqueTagsFromView(view)` |
| `shared/src/index.ts` | Export `getUniqueTagsFromView` |
| `app/src/query-edit-core.ts` | Add `findBareNode` |
| `app/src/query-edit-chips.ts` | Add `getMetadataTagChipState`, `cycleMetadataTagChip` |
| `app/src/query-edit.ts` | Export new functions |
| `app/src/SearchContext.tsx` | Add `deckTags?: Accessor<string[]>` |
| `app/src/App.tsx` | Pass `deckTags` in searchContextValue |
| `app/src/DualWieldLayout.tsx` | Pass `deckTags` in buildPaneContext |
| `app/src/MenuDrawer.tsx` | Add MY LIST section, `my:list` chip, tag chips |
| `docs/specs/083-menu-drawer.md` | Add "Extended by Spec 125" note |

## Acceptance Criteria

- [x] MY LIST section appears above VIEWS in the MenuDrawer.
- [x] `my:list` chip is always present; tri-state cycles correctly (neutral → positive → negative → neutral).
- [x] Tag chips appear for each unique tag from the user's deck list, sorted alphabetically.
- [x] Tag chips use tri-state cycling; label format `#${tag}`.
- [x] Empty list or no tags: only `my:list` chip shown.
- [x] Trash list tags are excluded from the tag chip set.
- [x] Left rail shows "My List" as section label.
- [x] Works in both single-pane and Dual Wield layouts.
