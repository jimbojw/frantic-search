# Spec 043: Graduated Color Identity Interaction

**Status:** Implemented

**Depends on:** Spec 037 (Histogram Toggles), Spec 036 (Source Spans)

## Goal

Replace the binary toggle model for Color Identity histogram bars and × buttons with a graduated "more of this / less of this" interaction. Tapping a bar progresses the tapped color through three inclusion levels (`ci>=` → `ci:` → `ci=`). Tapping × regresses through the same levels and ultimately excludes the color.

## Background

### Current behavior (Spec 037)

The WUBRG bars share a single `ci>=` node. Clicking a bar adds or removes a color letter from that node. The × buttons share a single `ci:` node and toggle whether a color is in the allowed set. This is a binary on/off toggle — there is no way to express "exactly red" or "fits in a red deck" from the histogram alone.

### Problems

1. **No graduation.** Every bar click operates at the same level (`ci>=`). A user who wants "only cards that fit in a red deck" (`ci:r`) or "exactly mono-red" (`ci=r`) must type the query manually.
2. **Disconnected bar and × semantics.** The bar and × operate on different nodes (`ci>=` vs `ci:`). There is no sense of "more" and "less" along a continuum.

### Design principles

- **More / less.** A bar tap means "more of this color." An × tap means "less of this color." Repeated taps walk along a progression of increasing or decreasing specificity.
- **Whole-node level changes.** When a color is already in a multi-color node and the user advances or retreats it, the entire node changes level. This avoids producing contradictory constraints (e.g., `ci>=w ci:r` is unsatisfiable). At the `>=` floor, per-color removal applies because there is no lower level.
- **Single-node principle.** Operator upgrades *are* exclusion — moving from `>=` to `:` excludes absent colors; from `:` to `=` additionally excludes colorless. The algorithm avoids creating multi-node CI states whenever possible, preferring operator-level changes on the existing node.
- **In-place edits.** Operator and value changes are spliced via source spans, preserving surrounding query text.

## Design

### Inclusion levels

Each WUBRG color can be at one of four conceptual levels relative to the query:

| Level | Operator | Semantics | Example |
|-------|----------|-----------|---------|
| 0 | (none) | No filter on this color | — |
| 1 | `>=` | Identity contains at least this color (superset) | `ci>=r` |
| 2 | `:` | Identity fits within this color set (subset / commander) | `ci:r` |
| 3 | `=` | Identity is exactly this color set | `ci=r` |

There is also a negative state: **excluded**, meaning a `ci:` or `ci=` node exists that does not contain the color.

### Node search

All algorithms use `findFieldNode` from `query-edit.ts` to locate CI nodes by operator. The field alias list is `['ci', 'identity', 'id', 'commander', 'cmd']`. For `ci:` nodes, a value predicate filters to WUBRG-only values (`/^[wubrg]+$/i`), skipping the special `c` and `m` pseudo-values.

The three node types are searched in priority order: `ci=` first, then `ci:` (WUBRG), then `ci>=`.

### WUBRG bar tap ("more of this color")

For a tapped color C:

1. **`ci=` node found:**
   - C in value → **no change** (already at level 3).
   - C not in value → splice operator `=` → `:`, add C to value. E.g., `ci=w` + tap R → `ci:wr`.

2. **`ci:` WUBRG node found:**
   - C in value → splice operator `:` → `=` (whole-node upgrade). E.g., `ci:r` + tap R → `ci=r`. Multi-color: `ci:wr` + tap R → `ci=wr`.
   - C not in value → add C to value. E.g., `ci:w` + tap R → `ci:wr`.

3. **`ci>=` node found:**
   - C in value → splice operator `>=` → `:` (whole-node upgrade). E.g., `ci>=r` + tap R → `ci:r`. Multi-color: `ci>=wr` + tap R → `ci:wr`.
   - C not in value → add C to value. E.g., `ci>=w` + tap R → `ci>=wr`.

4. **No CI node found** → append `ci>=C`.

### WUBRG × tap ("less of this color")

For a tapped color C:

1. **`ci=` node found:**
   - C in value → splice operator `=` → `:` (whole-node downgrade). E.g., `ci=r` + tap R × → `ci:r`. Multi-color: `ci=wr` + tap R × → `ci:wr`.
   - C not in value → **no change** (C excluded by exact match).

2. **`ci:` WUBRG node found:**
   - C in value, multi-color → remove C from value (narrow the allowed set). E.g., `ci:wurg` + tap G × → `ci:wur`. `ci:wr` + tap R × → `ci:w`.
   - C in value, single-color → splice operator `:` → `>=` (downgrade). E.g., `ci:r` + tap R × → `ci>=r`.
   - C not in value → **no change** (C excluded by subset).

3. **`ci>=` node found:**
   - C in value, single-color → remove node. E.g., `ci>=r` + tap R × → (empty).
   - C in value, multi-color → remove C from value. E.g., `ci>=wr` + tap R × → `ci>=w`.
   - C not in value → upgrade operator `>=` → `:` to exclude absent colors (including C). E.g., `ci>=w` + tap R × → `ci:w`.

4. **No CI node found** → append `ci:` with all five colors minus C. E.g., × on R → `ci:wubg`.

### Colorless bar tap

1. `ci=c` node exists (un-negated) → **no change** (already filtering for colorless).
2. `-ci=c` node exists → remove it (un-exclude colorless).
3. `ci>=` node exists → splice operator `>=` → `:` (subset semantics include colorless). E.g., `ci>=wu` → `ci:wu`.
4. `ci=` WUBRG node exists → splice operator `=` → `:` (relax exact-match to include colorless).
5. `ci:` WUBRG node exists → splice operator `:` → `=` and value → `c`. Colorless is already included by subset semantics, so the only way to get *more* colorless is to narrow to exclusively colorless. E.g., `ci:ur` → `ci=c`.
6. No relevant node → append `ci=c`.

### Colorless × tap

1. `ci=c` node exists → remove it.
2. `-ci=c` node exists → **no change** (already excluding colorless).
3. `ci=` WUBRG node exists → **no change** (colorless implicitly excluded by exact match).
4. `ci:` WUBRG node exists → splice operator `:` → `=` (exclude colorless by upgrading to exact match).
5. `ci>=` node exists → **no change** (colorless implicitly excluded by superset).
6. No relevant node → append `-ci=c`.

### Multicolor bar/×

Multicolor uses the graduated `toggleSimple` pattern (same 3-step "more / less" logic as MV and type bars, defined in Spec 037). Bar callers pass `negated=false`; × callers pass `negated=true`. The algorithm is:

1. Same-polarity node exists → **no change** (already active).
2. Opposite-polarity node exists → remove it (cross-cancel).
3. Neither → append the term.

### Operator splicing

Changing an operator in place (e.g., `=` → `:` or `>=` → `:`) requires computing the operator's position in the source string. Given a `BreakdownNode` with `span` and `valueSpan`:

```
operatorEnd   = valueSpan.start
operatorStart = valueSpan.start - currentOperator.length
```

When the replacement operator has a different length (e.g., `>=` is 2 chars, `:` is 1 char), the splice shifts subsequent positions. For combined operator + value changes (e.g., downgrade `=` and add a color), a single splice from `operatorStart` to `valueSpan.end` avoids double-splice offset issues:

```typescript
spliceQuery(query, { start: opStart, end: valueSpan.end }, newOp + newValue)
```

### Active state detection

#### WUBRG bar indicator

The bar indicates whether the color is included at **any** level (1, 2, or 3). This is a boolean: active if the color appears in the value of any un-negated `ci>=`, `ci:` (WUBRG), or `ci=` node.

A multi-level indicator (showing which of the three levels) could be added in a future iteration but is not required for this spec.

#### WUBRG × indicator

Active when the color is **excluded** by any constraint:
- A `ci:` WUBRG node exists and the color is NOT in its value.
- A `ci=` node exists and the color is NOT in its value.

Note: `ci>=` does not exclude absent colors (superset semantics allow cards with additional colors).

#### Colorless indicators

- **Bar active:** `ci=c` node exists (un-negated) OR a `ci:` WUBRG node exists (colorless is included by subset semantics).
- **× active:** `-ci=c` node exists, OR a `ci=` WUBRG node exists (colorless excluded by exact match), OR a `ci>=` node exists (colorless excluded by superset requirement).

#### Multicolor indicators

- **Bar active:** `ci:m` node exists (un-negated).
- **× active:** `-ci:m` node exists.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/query-edit.ts` | Replace `toggleColorDrill` with `graduatedColorBar`; replace `toggleColorExclude` with `graduatedColorX`; add `colorlessBar` and `colorlessX`; refactor `toggleSimple` to graduated 3-step "more / less" pattern (used by multicolor, MV, and type); add operator-splice helper |
| `app/src/query-edit.test.ts` | Replace WUBRG drill/exclude test suites with graduated tests; add colorless interaction tests; update multicolor/MV/type tests for graduated semantics |
| `app/src/ResultsBreakdown.tsx` | Update color handlers and active-state detection to use new functions; multicolor uses `toggleSimple` |
| `docs/specs/037-histogram-toggles.md` | Add implementation notes noting WUBRG/colorless/multicolor sections superseded by this spec; update MV/type sections to graduated semantics |

## Test Strategy

### Single-color bar progression

| Initial query | Action | Expected |
|---------------|--------|----------|
| (empty) | tap R bar | `ci>=r` |
| `ci>=r` | tap R bar | `ci:r` |
| `ci:r` | tap R bar | `ci=r` |
| `ci=r` | tap R bar | `ci=r` (no change) |

### Single-color × regression

| Initial query | Action | Expected |
|---------------|--------|----------|
| `ci=r` | tap R × | `ci:r` |
| `ci:r` | tap R × | `ci>=r` |
| `ci>=r` | tap R × | (empty) |
| (empty) | tap R × | `ci:wubg` |
| `ci:wubg` | tap R × | `ci:wubg` (no change) |

### Cross-color bar interactions

| Initial query | Action | Expected |
|---------------|--------|----------|
| `ci>=w` | tap R bar | `ci>=wr` |
| `ci:w` | tap R bar | `ci:wr` |
| `ci=w` | tap R bar | `ci:wr` |

### Cross-color × interactions

| Initial query | Action | Expected |
|---------------|--------|----------|
| `ci>=w` | tap R × | `ci:w` |
| `ci:w` | tap R × | `ci:w` (no change) |
| `ci=w` | tap R × | `ci=w` (no change) |

### Multi-color same-node upgrade/downgrade

| Initial query | Action | Expected |
|---------------|--------|----------|
| `ci>=wr` | tap R bar | `ci:wr` |
| `ci:wr` | tap R bar | `ci=wr` |
| `ci=wr` | tap R × | `ci:wr` |
| `ci:wr` | tap R × | `ci:w` |
| `ci>=wr` | tap R × | `ci>=w` |

### Colorless bar

| Initial query | Action | Expected |
|---------------|--------|----------|
| (empty) | tap C bar | `ci=c` |
| `ci=c` | tap C bar | `ci=c` (no change) |
| `-ci=c` | tap C bar | (empty) |
| `ci>=w` | tap C bar | `ci:w` |
| `ci:w` | tap C bar | `ci=c` |
| `ci:ur` | tap C bar | `ci=c` |
| `ci=w` | tap C bar | `ci:w` |

### Colorless ×

| Initial query | Action | Expected |
|---------------|--------|----------|
| (empty) | tap C × | `-ci=c` |
| `-ci=c` | tap C × | `-ci=c` (no change) |
| `ci=c` | tap C × | (empty) |
| `ci>=w` | tap C × | `ci>=w` (no change) |
| `ci:w` | tap C × | `ci=w` |
| `ci=w` | tap C × | `ci=w` (no change) |

### Multicolor bar

| Initial query | Action | Expected |
|---------------|--------|----------|
| (empty) | tap M bar | `ci:m` |
| `ci:m` | tap M bar | `ci:m` (no change) |
| `-ci:m` | tap M bar | (empty) |

### Multicolor ×

| Initial query | Action | Expected |
|---------------|--------|----------|
| (empty) | tap M × | `-ci:m` |
| `-ci:m` | tap M × | `-ci:m` (no change) |
| `ci:m` | tap M × | (empty) |

### Splice correctness

| Initial query | Action | Expected |
|---------------|--------|----------|
| `f:edh ci>=r t:creature` | tap R bar | `f:edh ci:r t:creature` |
| `f:edh ci:r t:creature` | tap R bar | `f:edh ci=r t:creature` |
| `f:edh ci>=wr t:creature` | tap R × | `f:edh ci>=w t:creature` |
| `f:edh ci=w t:creature` | tap R bar | `f:edh ci:wr t:creature` |
| `f:edh ci:ur t:creature` | tap C bar | `f:edh ci=c t:creature` |

### Multi-node scenarios

| Initial query | Action | Expected |
|---------------|--------|----------|
| `ci>=w ci:wubg` | tap R bar | `ci>=wr ci:wubg` |
| `ci:wubg ci>=w` | tap R × | `ci:wubg ci>=w` (no change, R already excluded) |

## Edge Cases

### User-typed aliases

The search matches any CI field alias (`ci`, `identity`, `id`, `commander`, `cmd`). The alias is preserved when splicing. E.g., `identity>=r` + tap R bar → `identity:r`.

### Multiple CI nodes of the same operator

DFS finds the first (leftmost). The algorithms operate on that node. Duplicate nodes may become semantically redundant but are not consolidated (consistent with Spec 037).

### Operator length change during splice

Changing `>=` (2 chars) to `:` (1 char) or vice versa shifts all subsequent spans. Each toggle produces at most one splice, so offset tracking is not needed. When both operator and value change (e.g., downgrade `=` to `:` and add a color), a single splice covers both.

### Single-node principle avoids contradictions

The graduated algorithm prefers operator upgrades over appending new terms. For example, `ci>=w` + tap R × produces `ci:w` (single node) rather than `ci>=w ci:wubg` (two nodes). Multi-node CI states can still arise from manual query editing but not from the graduated histogram controls alone (except for `ci:m` / `-ci:m` which are independent).

### Reversibility

The graduated model is not perfectly reversible across all multi-color sequences. A round-trip on a single color (bar then ×, or × then bar) returns to the previous state. But multi-color interactions (e.g., bar on R, then bar on W, then × on R) may not restore the exact original query because whole-node level changes affect all colors in the node.

## Out of Scope

- Multi-level bar visual indicator (1/2/3 pips). The bar is boolean "included or not" for this iteration.
- TERMS drawer color identity controls. Those will reuse the same functions (future spec).
- Consolidating duplicate CI nodes across operator types.

## Acceptance Criteria

1. Tapping a WUBRG bar advances the tapped color through `ci>=` → `ci:` → `ci=` levels.
2. Tapping a WUBRG × retreats through the levels and ultimately excludes the color.
3. When a color is added to an existing multi-color node, it joins at that node's level.
4. When a color already in a multi-color node is advanced or retreated, the entire node changes level.
5. Colorless bar/× use `ci=c` / `-ci=c` with interaction-aware logic for existing WUBRG nodes.
6. Multicolor, MV, and type bar/× all follow the graduated `toggleSimple` pattern: bar is idempotent when the positive node exists and cross-removes the negative node; × is idempotent when the negative node exists and cross-removes the positive node.
7. Active state detection reflects the new semantics: bar active = any inclusion level, × active = excluded.
8. All operator and value changes are spliced in place, preserving surrounding query text.

## Implementation Notes

- 2026-02-26: Any operation that would produce `ci:wubrg` (a tautology matching every card) now removes the node instead. This affects `graduatedColorBar` (adding the 5th color to a `ci:` or `ci>=` node, or upgrading `ci>=wubrg`), `graduatedColorX` (downgrading `ci=wubrg`), and `colorlessBar` (downgrading `ci>=wubrg` or `ci=wubrg`). Guards compare the resulting color mask against `ALL_FIVE` and call `removeNode` when matched.
