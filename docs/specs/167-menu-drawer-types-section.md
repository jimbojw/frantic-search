# Spec 167: MenuDrawer Types Section

**Status:** Implemented

**Depends on:** Spec 083 (MenuDrawer), Spec 044 (Tri-state Chips), Spec 032 (`is:` operator), Spec 040 (Extended `is:` keywords), Spec 025 (Results Breakdown), Spec 038 (Collapsible Histograms)

**Extends:** Spec 083 (MenuDrawer)

**GitHub Issue:** [#219](https://github.com/jimbojw/frantic-search/issues/219)

## Goal

Add a **Types** section to the MenuDrawer so users can tri-state toggle card-type filters and `is:permanent` without relying only on the types histogram. Chips use the same query shapes as the histogram type bars (`t:` terms) where applicable.

## Background

### Current behavior

The types histogram (`ResultsBreakdown`, Spec 038) exposes `t:legendary`, `t:creature`, etc. The only MenuDrawer affordance overlapping type semantics is **`is:permanent`** and **`is:spell`**, grouped under **Roles**.

### Problem

Users who open the menu for filters may not discover type-line filtering from the collapsed sparkline row. A dedicated **Types** section matches mental models and mirrors histogram behavior.

## Design

### Section identity

- **Nav / scrollspy id:** `types`
- **Left rail label:** Types
- **Content heading:** Types (same as rail; no `SECTION_HEADINGS` override)

### Placement

Insert **types** in `TERMS_SECTIONS` immediately after `color` and before `layouts` (between **Color Identity** and **Layouts** in the content column).

### Chips

**Tri-state** (neutral → positive → negative → neutral) via existing `cycleChip` / `getChipState` (Spec 044), same as FORMATS / LAYOUTS chips.

1. **`t:` / `type:` chips** — Eight values, aligned with `TYPE_TERMS` / `TYPE_VALUES` in `app/src/ResultsBreakdown.tsx`:

   | Value | Display / append term |
   |-------|------------------------|
   | legendary | `t:legendary` |
   | creature | `t:creature` |
   | instant | `t:instant` |
   | sorcery | `t:sorcery` |
   | artifact | `t:artifact` |
   | enchantment | `t:enchantment` |
   | planeswalker | `t:planeswalker` |
   | land | `t:land` |

   Chip definition: `field: ['t', 'type']`, `operator: ':'`, `value` as in the table, `term` exactly `t:{value}`.

2. **`is:permanent`** — Same `isChip` pattern as other `is:` drawer chips (Spec 032 / 040).

**Order:** List the eight `t:` chips first in the table order above, then `is:permanent` (permanent is a superset role; placing it after type words keeps related literals together).

### Roles cleanup

Remove **`is:permanent`** from the **Roles** section chip list so it appears only under Types. **Keep `is:spell`** in Roles.

### Histogram parity

MenuDrawer type chips and the histogram type bars both append/remove the same `t:{value}` strings; tri-state cycling matches other drawer chips. **`t:battle`** is not on the histogram today; this spec does not add a battle chip (defer to a future change if needed).

### Analytics (Spec 085)

Tapping a Types chip fires `menu_chip_used` with `section: 'types'` and `chip_label` matching the displayed label (e.g. `t:creature`, `is:permanent`).

## Technical notes

- Implementation lives in `app/src/MenuDrawer.tsx`: extend `TERMS_SECTIONS`, `SECTION_CHIPS`, `SECTION_LABELS`; add a small `typeChip(value)` helper (mirror `isChip` but with type field list).
- No special render branch: Types uses the default chip grid (`section !== 'color'`).
- Dual Wield and modal contexts reuse the same `MenuDrawer`; no extra props.

## Acceptance criteria

1. **Types** appears in the left rail and in the scrollable content between Color Identity and Layouts.
2. Each `t:` chip and `is:permanent` cycles neutral → include → exclude → neutral.
3. Query terms match histogram-equivalent `t:` toggles for the eight values.
4. **`is:permanent`** appears only under Types, not under Roles.
5. `menu_chip_used` includes `section: 'types'` for these chips.

## Files

| File | Change |
|------|--------|
| `app/src/MenuDrawer.tsx` | `types` section, `typeChip`, `TERMS_SECTIONS` order, remove `permanent` from `roles` |
| `docs/specs/083-menu-drawer.md` | Extended by Spec 167 |
| `docs/specs/085-posthog-analytics.md` | Example `section` list includes `types` |
