# Spec 169: MenuDrawer Mana Cost Section

**Status:** Implemented

**Depends on:** Spec 083 (MenuDrawer), Spec 168 (Mana section layout / scrollspy), Spec 044 (terms drawer / tri-state chips), Spec 085 (PostHog analytics), Spec 008 (mana cost matching — evaluator semantics), Spec 102 (percentile chips — mutually exclusive `cyclePercentileChip` pattern)

**Extends:** Spec 168 (MenuDrawer Mana Value Section)

**GitHub Issue:** [#218](https://github.com/jimbojw/frantic-search/issues/218)

## Goal

Add a **Mana cost** control group below **Mana value** inside the same `mana` MenuDrawer section so users can discover and compose `m:` / `mana:` filters (colored pips, colorless, generic amounts, and `{X}`) without memorizing syntax.

## Background

The `m:` field filters by mana cost symbol counts (Spec 008). There was no drawer affordance; issue #218 documents users guessing `MV=x` instead of `m:x`.

## Design

### Layout / navigation

- Same `<section id="mana">` and left-rail **Mana** as Spec 168. **No** new `TERMS_SECTIONS` entry or scrollspy id.
- **Order:** Sticky heading **Mana value** and its eight chips (Spec 168), then sticky subheading **Mana cost**, then chip rows: **WUBRG+C**, then one row **`m:x`** (mana `{X}` glyph) **first**, then **`m>=1`–`m>=8`** left to right.

### Colored + colorless row (6 chips)

Symbols `w`, `u`, `b`, `r`, `g`, `c` → canonical terms `m:w` … `m:g`, `m:c`.

**Tri-state** per chip (Spec 044 / `cycleChip`): neutral → positive term → negated term → neutral.

**Presentation:** Like COLOR `ci:` chips — `m:` prefix with query syntax highlighting plus mana-font glyph (`ms ms-cost` + `ms-w`, etc.) in neutral and active states. Negative state uses `ChipButton` negative styling (strikethrough); show `-m:` + the same glyph (or equivalent readable label).

**Implementation:** `cycleChip` with `field: ['m', 'mana']`, `operator: ':'`, `value` equal to the lowercase symbol key, `term: m:<value>`.

**Composable** with the generic row (`m:x` + generic pip chips; see below).

### Generic and `{X}` row (`m:x`, then `m>=1` … `m>=8`)

**`m:x` (first chip, `{X}` mana symbol):** **Tri-state** `cycleChip` — **independent** of the generic-pip chips (does **not** match the clear predicate). Same presentation pattern as colored chips (`m:` + glyph).

**Generic pip chips `m>=1`–`m>=8`:** Eight chips (**no `m>=9`**; **`m>=0`** omitted — vacuous for superset matching, same as `m:0`). **Drawer canonical form** is **`m>=N`** / **`mana>=N`** (operator **`>=`**, numeric value **`N`** as a string). **Mutually exclusive** among this family (Spec 102 / **`cyclePercentileChip`** + **`manaCostGenericClearPredicate`**). **Tri-state per tapped chip** after clearing the family.

**Rationale:** `m:N` is equivalent to `m>=N` for generic-only queries in the evaluator (both use component-wise ≥ / `manaContains`; see Spec 008 and `eval-leaves` `mana` case). The drawer uses **`>=`** in chip labels and appended terms so the “at least this much generic mana” intent is obvious.

**Clear predicate:** Remove every query node in this family:

1. **`m>=` / `mana>=`** with a value matching **`/^\d+$/`** (drawer form and negated forms), or
2. **`m:` / `mana:`** with **`:`** and a digit-only value (legacy `m:3`, `m:12`, …), so old queries still clear when the user picks a drawer chip.

Does **not** clear `m:x`, colored `m:w`, `m:wu`, hybrid keys, etc.

**Semantics:** Spec 008 — component-wise ≥ on parsed symbol maps; **`m>=N`** matches faces whose cost includes at least **`N`** generic mana; **`m:x`** matches faces with `{X}` in the cost.

No evaluator or ETL changes.

### Interaction with Mana value

- **Independent:** Mana cost chips do not clear `mv` / `cmc` / `manavalue` histogram-family terms; Mana value chips (Spec 168) do not clear `m:` / `mana:` terms.

### Chip state / aliases (non-numeric)

- **`mana:`** is treated like **`m:`** for node lookup (field list includes both).
- User-typed combined values (e.g. `m:wu`) do **not** activate individual W/U drawer chips unless those exact single-symbol nodes exist.

### Analytics (Spec 085)

`menu_chip_used` with `section: 'mana'` (same bucket as mana value).

`chip_label`: always the **canonical positive term** the chip applies (`m:w`, `m>=3`, `m:x`, …) on every tap, including when cycling to negative or clearing.

### Technical notes

- UI: [`app/src/MenuDrawer.tsx`](../../app/src/MenuDrawer.tsx) — `ManaCostMenuChip` (WUBRG+C + `m:x` in the generic row), `PercentileTermChip` for `m>=1`–`m>=8` with `manaCostGenericClearPredicate`.
- Query: [`app/src/query-edit-chips.ts`](../../app/src/query-edit-chips.ts) — `manaCostGenericClearPredicate`, `cyclePercentileChip` with `operator: '>='` for generic pip chips; `cycleChip` for WUBRG+C and `m:x`.
- Tests: [`app/src/query-edit-chips.test.ts`](../../app/src/query-edit-chips.test.ts).

## Acceptance criteria

1. One **Mana** rail entry highlights the whole `mana` section (Mana value + Mana cost).
2. **Mana value** heading and chips remain above **Mana cost** heading and chips.
3. WUBRG+C and **`m:x`** use tri-state `cycleChip` and compose independently with each other.
4. In one row, **`m:x`** appears before **`m>=1`–`m>=8`**. Those eight chips use mutually exclusive **`cyclePercentileChip`** behavior; the clear predicate removes prior **`m>=N`** or digit-only **`m:N`** generic terms; **`m:x`** and colored chips are unaffected.
5. `menu_chip_used` uses `section: 'mana'` and canonical positive `chip_label` for every tap.

## Files

| File | Change |
|------|--------|
| `app/src/query-edit-chips.ts` | `manaCostGenericClearPredicate`; generic pip row uses `cyclePercentileChip` with `>=` |
| `app/src/query-edit.ts` | Re-export `manaCostGenericClearPredicate` |
| `app/src/MenuDrawer.tsx` | Mana cost rows: symbols; one row `m:x` then `m>=1`–`m>=8` |
| `app/src/query-edit-chips.test.ts` | Exclusive generic pip + composition with `m:x` |
| `docs/specs/168-menu-drawer-mana-value-section.md` | Pointer to Spec 169 |
| `docs/specs/083-menu-drawer.md` | Extended by Spec 169 |
| `docs/specs/085-posthog-analytics.md` | Example `chip_label`s for mana cost |

## Implementation Notes

- 2026-03-29: Generic pip chips use mutually exclusive `cyclePercentileChip` + `manaCostGenericClearPredicate`; `m:9` / `m>=9` not in drawer. `m:x` uses `cycleChip` outside the clear predicate. **Layout:** one row, **`m:x` first**, then **`m>=1`–`m>=8`**.
- 2026-03-29: Drawer generic pip terms switched from **`m:N`** to **`m>=N`** (labels + query); clear predicate still removes legacy digit-only **`m:N`** when applying a drawer chip.
