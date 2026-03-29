# Spec 168: MenuDrawer Mana Value Section

**Status:** Implemented

**Depends on:** Spec 083 (MenuDrawer), Spec 038 (Collapsible Histograms), Spec 085 (PostHog analytics)

**Extends:** Spec 083 (MenuDrawer)

**Extended by:** Spec 169 (MenuDrawer Mana Cost Section)

**GitHub Issue:** [#220](https://github.com/jimbojw/frantic-search/issues/220)

## Goal

Add a **Mana value** control group inside the MenuDrawer so users can filter by mana value (`mv=0` … `mv=6`, `mv>=7`) without relying only on the mana histogram. Chips are **mutually exclusive** and **positive-only**: at most one such filter is active from this UI; the active chip replaces any other mana-value histogram-family terms in the query.

## Background

### Current behavior

The mana histogram (`ResultsBreakdown`, Spec 038) exposes the same eight buckets with **independent** drill / exclude behavior via `toggleSimple` (users can stack multiple `mv=` terms or mix include and exclude).

### Problem

There is no drawer affordance for mana value. Users who use the menu for filters may not discover the histogram row.

### Follow-on

**Mana cost** chips are specified in **Spec 169** (`m:` / `mana:` symbol and generic controls below **Mana value** in the same `mana` section).

## Design

### Section identity

- **Nav / scrollspy id:** `mana`
- **Left rail label:** Mana (uppercase in UI via existing styles)
- **First content heading:** Mana value (same pattern as Colors → Color Identity)

### Placement

Insert **`mana`** in `TERMS_SECTIONS` immediately after **`types`** and before **`layouts`**.

### Layout

- Single `<section id="mana">` for scrollspy and IntersectionObserver.
- Sticky heading **Mana value**, then the chip row.
- **Mana cost** (Spec 169): second sticky heading + chip rows below, same `<section>`, no extra `TERMS_SECTIONS` entry.

### Chips

**Binary / radio-style** (not tri-state): use `ChipButton` **`active`**, not `cycleChip`.

Eight chips, aligned with the histogram buckets and literals in [`app/src/mana-value-query.ts`](../../app/src/mana-value-query.ts):

| Display | Append term |
|---------|-------------|
| 0 … 6 (short labels) | `mv=0` … `mv=6` |
| 7+ | `mv>=7` |

**Behavior:**

1. Tapping a chip clears **all** query nodes whose labels match the mana-value **histogram family**: fields `mv` / `cmc` / `manavalue`, operators `=` or `>=`, any polarity (same membership as `isManaValueHistogramLabel` / histogram Clear).
2. If the tapped chip was **already** the sole active positive match for one of the eight buckets, step 1 clears everything and the chip turns off (empty family).
3. Otherwise append the canonical `mv=…` or `mv>=7` term after the clear.

**Aliases:** `cmc=N` / `manavalue=N` count as active for chip state and are removed when applying a drawer chip.

**Ambiguous queries:** If multiple positive terms match different drawer buckets (e.g. `mv=2 mv=3` from the histogram), **no** chip appears selected until the query is simplified; any drawer tap still clears the whole family and applies one chip.

### Intentional divergence from the histogram

The drawer uses **exclusive** replacement; the histogram uses **independent** `toggleSimple` drill/exclude. This is deliberate (issue #220).

### Single source of truth

`MV_FIELDS`, `MV_LABELS`, `MV_TERMS`, `MV_OPS`, and `MV_VALUES` live in [`app/src/mana-value-query.ts`](../../app/src/mana-value-query.ts). `ResultsBreakdown` and MenuDrawer import from there so literals never drift.

### Analytics (Spec 085)

`menu_chip_used` with `section: 'mana'` and `chip_label` equal to the term (e.g. `mv=3`, `mv>=7`).

### Technical notes

- Query helpers: `mvMenuClearPredicate`, `cycleManaValueMenuChip`, `getManaValueMenuActiveIndex` in [`app/src/query-edit-chips.ts`](../../app/src/query-edit-chips.ts), exported from [`app/src/query-edit.ts`](../../app/src/query-edit.ts).
- Tests: [`app/src/query-edit-chips.test.ts`](../../app/src/query-edit-chips.test.ts).

## Acceptance criteria

1. **Mana** appears in the left rail after **Types**; scrolling highlights one bucket for both current and future Mana subsections.
2. **Mana value** heading appears above the eight chips.
3. Exactly one of `mv=0` … `mv>=7` can be active from these chips; tapping the active chip clears all mana-value histogram-family terms.
4. Chip literals match the histogram buckets (`mana-value-query.ts`).
5. `menu_chip_used` uses `section: 'mana'` and the real term as `chip_label`.

## Files

| File | Change |
|------|--------|
| `app/src/mana-value-query.ts` | Shared MV literals + `isManaValueHistogramLabel` |
| `app/src/query-edit-chips.ts` | Exclusive menu chip cycle + active index |
| `app/src/query-edit.ts` | Re-exports |
| `app/src/query-edit-chips.test.ts` | Tests for Spec 168 |
| `app/src/ResultsBreakdown.tsx` | Import shared MV constants |
| `app/src/MenuDrawer.tsx` | `mana` section, `ManaValueMenuChip` |
| `docs/specs/083-menu-drawer.md` | Extended by Spec 168 |
| `docs/specs/085-posthog-analytics.md` | Example `section` includes `mana` |
