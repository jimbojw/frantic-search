# Spec 130: MenuDrawer COLOR Section

**Status:** Implemented

**Depends on:** Spec 083 (MenuDrawer), Spec 043 (Graduated Color Identity Interaction), Spec 044 (Tri-state Chips), Spec 055 (Color Number Queries), ADR-015 (Mana Symbol Rendering)

**Extends:** Spec 083 (MenuDrawer)

**GitHub Issue:** [#144](https://github.com/jimbojw/frantic-search/issues/144)

## Goal

Add a COLOR section to the MenuDrawer with color identity toggle chips to improve discoverability beyond the histogram. Users can filter by specific colors (WUBRG, colorless), by color count (1–5), or by multicolor without relying on the histogram bars.

## Background

### Current behavior

The only tappable color identity controls are in the histogram (Spec 037, Spec 043). The histogram supports graduated drill/exclude interactions but is less discoverable than a dedicated section in the MenuDrawer.

### Problem

Users who open the MenuDrawer to filter by format or layout may not think to use the histogram for color identity. Adding COLOR chips alongside FORMATS makes color filtering more discoverable and consistent with other filter patterns.

## Design

### Section placement

Insert COLOR after FORMATS. Updated section order:

1. MY LIST
2. VIEWS
3. FORMATS
4. **COLOR** — new
5. LAYOUTS
6. ROLES
7. LANDS
8. RARITIES
9. PRINTINGS
10. PRICES
11. POPULARITY
12. SALT
13. SORT

### Two-row layout

**Row 1 — Color toggles (WUBRG + C):** Six chips. WUBRG use `ci:{X}` (syntax-highlighted `ci:` + mana symbol); C uses `ci={C}` (syntax-highlighted `ci=` + mana symbol). Binary toggles. WUBRG terms use `:`; C uses `=` for consistency with the histogram and the equality-priority helper.

| Chip | Label (display) | Term (append) | Behavior |
|------|-----------------|--------------|----------|
| W | `ci:{W}` | `ci:w` | Binary |
| U | `ci:{U}` | `ci:u` | Binary |
| B | `ci:{B}` | `ci:b` | Binary |
| R | `ci:{R}` | `ci:r` | Binary |
| G | `ci:{G}` | `ci:g` | Binary |
| C | `ci={C}` | `ci=c` | Binary, all-or-nothing |

**Row 2 — Color count and multicolor:** Six chips. Tri-state (neutral → positive → negative → neutral), same as `f:commander` (Spec 044).

| Chip | Label | Term (append) | Behavior |
|------|-------|---------------|----------|
| 1 | `ci=1` | `ci=1` | Tri-state |
| 2 | `ci=2` | `ci=2` | Tri-state |
| 3 | `ci=3` | `ci=3` | Tri-state |
| 4 | `ci=4` | `ci=4` | Tri-state |
| 5 | `ci=5` | `ci=5` | Tri-state |
| m | `ci:m` | `ci:m` | Tri-state |

### Visual treatment

- **Neutral styling.** No colored backgrounds on chips. Use the same chip styling as FORMATS (muted when inactive, filled when active).
- **Row 1 chip labels — intentional divergence from histogram:** Each chip displays syntax-highlighted `ci:` (or `ci=` for C) followed by a mana-font symbol. The histogram shows only the symbol; the MenuDrawer shows the full term prefix so users learn what tapping *does* to their query. The histogram may produce `ci>=`, `ci:`, or `ci=` depending on graduated context; the MenuDrawer always produces `ci:` for WUBRG and `ci=` for colorless. Chips thus teach Scryfall nomenclature as a side-effect of interaction.
- **Mana symbols** for Row 1: Use mana-font (ADR-015) — `<i class="ms ms-w ms-cost" />` etc. Classes: `ms-w`, `ms-u`, `ms-b`, `ms-r`, `ms-g`, `ms-c`.
- **Layout:** Both rows use `flex flex-wrap`. Row 1 and Row 2 may wrap independently; with fixed chip width, Row 1 (6 chips) and Row 2 (6 chips) will typically wrap to 2–3 lines each.

### Active state detection (Row 1: WUBRG + C)

**Shared logic with histogram (Spec 043):** The histogram and the MenuDrawer use the *same* algorithm for WUBRG active state. No change to histogram behavior.

**WUBRG active state:** A WUBRG chip (e.g. U) is active when the color letter appears in the value of **any** un-negated CI node whose value matches `WUBRG_VALUE_RE` (`/^[wubrg]+$/i`). Check all three operator types:

- `ci=` node with WUBRG value (excludes `ci=c`)
- `ci:` node with WUBRG value (excludes `ci:m`, `ci:1`–`ci:5`, named values)
- `ci>=` node with WUBRG value (excludes `ci>=2` etc.)

If any such node's value (case-insensitive) contains the color letter, the chip is active. This matches the histogram's current `colorDrillActive` logic: it checks `ciEqNode`, `ciColonNode`, and `ciGteNode` and returns true if any contains the color.

**C chip active state (intentionally different from histogram):** The C chip is active *only* when `ci=c` or `ci:c` exists. It is inactive in all other cases, including when a term like `ci:wu` is present — even though subset semantics would allow colorless cards, that state is not a useful representation in the MenuDrawer. The histogram's colorless bar, by contrast, is active when `ci=c` OR when any `ci:` WUBRG node exists (colorless included by subset). We always write `ci=c`, but users may type `ci:c` directly — detection must accept both.

**Helper for active state:** Extract `isWubrgColorActive(breakdown, color)` in `query-edit-color.ts` that implements the "any node" logic (check ci=, ci:, ci>= with WUBRG values; active if any contains the color). Refactor the histogram's `colorDrillActive` (WUBRG branch) to call it. The MenuDrawer's `getIdentityColorChipState` uses it for Row 1 WUBRG chips. Both UIs share this function so active state stays identical.

**Write logic node selection:** When modifying the query (tap to add/remove a color), we must pick which node to edit when multiple exist. Use **priority order**: `ci=` first, then `ci:` (WUBRG), then `ci>=` — most specific wins. Extract this into `findFirstCiWubrgNode(breakdown)` in `query-edit-color.ts`. The graduated functions (`graduatedColorBar`, `graduatedColorX`, `colorlessBar`, `colorlessX`) already implement this selection inline; consolidate into a single helper. The histogram's write handlers already use these functions, so no histogram change. The MenuDrawer's toggle handlers use the same helper for write logic only.

### Active state detection (Row 2: ci:1–5, ci:m)

**Numeric (1–5):** A chip is positive when an un-negated node exists with value `'1'`, `'2'`, etc., under *either* operator `:` or `=`. Users may type `ci:2` or `ci=2`; both mean "exactly 2 colors" (Spec 055). Detection must accept both.

**Multicolor (m):** Use `findFieldNode` with operator `:`, value `'m'`. Tri-state: positive when un-negated node exists, negative when negated node exists, neutral otherwise.

### Write logic (Row 1: WUBRG + C)

**WUBRG tap (binary):**

- **Active → inactive:** Remove the color letter from the selected node (first in priority order). If the value becomes empty, remove the node. When modifying, always write `ci:` — e.g. `ci>=u` → tap U → remove; `ci:wu` → tap U → `ci:w`.
- **Inactive → active:** Remove any `ci=c` or `ci:c` node first (to avoid contradiction). If a WUBRG node exists (from `findFirstCiWubrgNode`), add the color to its value (canonicalize to WUBRG order). If none exists, append `ci:X` (e.g. `ci:u`). When modifying an existing node, always write `ci:` — e.g. `ci>=u` + tap W → replace with `ci:wu` (normalize to `:` operator).

**C tap (binary, all-or-nothing):**

- **Active → inactive:** Remove the `ci=c` or `ci:c` node (whichever exists).
- **Inactive → active:** Replace the selected WUBRG node (if any) with `ci=c`, or append `ci=c` if none exists. Rationale: Colorless is exclusive — you either filter for colorless or for specific colors, not both.

**Canonicalization:** When editing a WUBRG value, serialize in WUBRG order (`wubrg`). Reuse `parseColorMask` / `serializeColors` from `query-edit-color.ts`.

### Write logic (Row 2: ci:1–5, ci:m)

**Numeric (1–5):** Write `ci=N` (operator `=`) when appending. Use the same tri-state cycle as `cycleChip`, but with `operator: '='` and `term: 'ci=N'`. When removing or negating, operate on whichever node exists (`ci:N` or `ci=N`).

**Multicolor (m):** Use `cycleChip` (Spec 044) with `field: CI_FIELDS`, `operator: ':'`, `value: 'm'`, `term: 'ci:m'`.

### Edge cases

| Scenario | Behavior |
|----------|----------|
| Query has only `ci:m` | No WUBRG node. Row 1: all inactive. Row 2: `ci:m` chip positive. |
| Query has `ci:2` or `ci=2` | No WUBRG node (numeric). Row 1: all inactive. Row 2: `ci=2` chip positive (detect either operator). |
| Query has `ci:grixis` | No WUBRG node (named value). Row 1: all inactive. Row 2: all inactive. |
| Query has `ci>=u` | WUBRG node exists, value contains U. Row 1: U active. Tap U → remove `ci>=u`. Tap W → replace with `ci:wu`. |
| Query has `ci=c` or `ci:c` | C active. Tap C → remove. Tap W → replace with `ci:w`. |
| Multiple CI nodes (e.g. `ci=w ci>=u`) | **Active state:** Both W and U active (color appears in any node). **Write logic:** When tapping to modify, operate on first node in priority order (`ci=` before `ci:` before `ci>=`). |
| `ci:wubrg` (tautology) | If an edit would produce `ci:wubrg`, remove the node instead (same as Spec 043). One could imagine treating "no ci term" as "all five colors on" (they're included by default), but that is more confusing than having them all off — unmentioned means unfiltered. |

### Field aliases

All CI operations use the same field alias list as the histogram: `['ci', 'identity', 'id', 'commander', 'cmd']`. When splicing, preserve the user's original field name if present. When appending: WUBRG use `ci:`, C use `ci=`.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/query-edit-color.ts` | Extract `findFirstCiWubrgNode` for write logic (graduated functions use it). Add `isWubrgColorActive(breakdown, color)` for active state (checks any ci=, ci:, ci>= node with WUBRG value). Add `getIdentityColorChipState`, `toggleIdentityColorChip`, `toggleIdentityColorlessChip`. Add `cycleCiNumericChip` for Row 2 numeric chips (detect `ci:N` or `ci=N`; write `ci=N`). Reuse `CI_FIELDS`, `WUBRG_VALUE_RE`, `parseColorMask`, `serializeColors`. |
| `app/src/ResultsBreakdown.tsx` | Refactor `colorDrillActive` (WUBRG) to call `isWubrgColorActive` — same behavior, shared logic. No change to histogram active-state semantics. |
| `app/src/query-edit-chips.ts` | Row 2 uses existing `cycleChip`; ensure CI_FIELDS available |
| `app/src/query-edit.ts` | Export new identity functions |
| `app/src/MenuDrawer.tsx` | Add COLOR section: Row 1 (6 mana-symbol chips), Row 2 (6 tri-state chips); wire to handlers |
| `docs/specs/083-menu-drawer.md` | Add "Extended by Spec 130" note |

## Test Strategy

### Unit tests for `findFirstCiWubrgNode` (write logic)

| Breakdown | Expected (priority: ci=, ci:, ci>=) |
|-----------|--------------------------------------|
| `AND(ci>=r, t:creature)` | `ci>=r` node |
| `AND(ci=w, ci>=u)` | `ci=w` node (ci= wins over ci>=) |
| `AND(ci:u, ci>=w)` | `ci:u` node (ci: wins over ci>=) |
| `AND(ci:m, ci:u)` | `ci:u` node (skips ci:m) |
| `AND(ci:2, ci:wu)` | `ci:wu` node (skips numeric ci:2) |
| `AND(ci:grixis)` | `null` (named value) |
| `AND(ci:m)` | `null` |
| `AND(t:creature)` | `null` |

### Unit tests for `isWubrgColorActive` (active state — matches histogram)

| Breakdown | Color | Expected |
|-----------|-------|----------|
| `AND(ci=w, ci>=u)` | W | true (ci=w contains w) |
| `AND(ci=w, ci>=u)` | U | true (ci>=u contains u — any node) |
| `AND(ci=w)` | U | false |
| `AND(ci:m)` | U | false (ci:m excluded) |

### Unit tests for Row 1 toggle logic

| Initial query | Action | Expected |
|---------------|--------|----------|
| (empty) | tap U | `ci:u` |
| `ci:u` | tap U | (empty) |
| `ci>=u` | tap U | (empty) |
| `ci>=u` | tap W | `ci:wu` |
| `ci:wu` | tap U | `ci:w` |
| `ci=c` | tap C | (empty) |
| `ci=c` | tap W | `ci:w` |
| `ci:c` | tap C | (empty) |
| `ci:c` | tap W | `ci:w` |
| `ci:wr` | tap C | `ci=c` |

### Unit tests for Row 2 (tri-state)

**Numeric:** Verify `ci=1` through `ci=5` cycle correctly. Active state: `ci:2` and `ci=2` both show chip positive. Write: append produces `ci=N`.

**Multicolor:** Reuse `cycleChip` test pattern for `ci:m` (neutral → positive → negative → neutral).

## Acceptance Criteria

1. COLOR section appears after FORMATS in the MenuDrawer. Left rail shows "Color" as section label.
2. Row 1: Six chips (W, U, B, R, G, C). Each displays syntax-highlighted `ci:` (or `ci=` for C) plus a mana-font symbol. Neutral chip styling. Binary toggles.
3. Row 2: Six chips (`ci=1`–`ci=5`, `ci:m`). Tri-state cycling. Numeric chips write `=`; multicolor writes `:`.
4. Row 1 active state uses the same logic as the histogram: WUBRG chip active when color appears in any ci=, ci:, or ci>= node (WUBRG values only); C chip when ci=c or ci:c exists. Row 2 numeric chips detect either `:` or `=` for active state; multicolor detects `:` only.
5. WUBRG taps add/remove colors from the selected node. C tap replaces other colors with `ci=c` or removes `ci=c`.
6. WUBRG node selection excludes `ci:m`, numeric (`ci:1`–`ci:5`), and named values (e.g. `grixis`).
7. Edits that would produce `ci:wubrg` remove the node instead (tautology; unmentioned means unfiltered).
8. Works in both modal overlay and inline MenuDrawer contexts.

---

**Note:** The section is labeled "COLOR" (not "IDENTITY") so players can find it quickly when looking for color filters.
