# Spec 055: Color / Color Identity Number Queries

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine)

**GitHub Issue:** [#43](https://github.com/jimbojw/frantic-search/issues/43)

## Goal

Support numeric values for `color:` and `identity:` (and all aliases: `c:`, `ci:`, `id:`, `commander:`, `cmd:`) so that queries like `ci:2`, `ci>=2`, and `c<3` filter by the **number of colors** in a card's color identity or color, not by a specific color bitmask.

## Background

### Current behavior

Color/identity values are resolved in this order (Spec 002 § "Color value parsing"):

1. Named lookup (`azorius`, `red`, etc.) → bitmask.
2. Special predicates (`colorless`/`c` → `COLOR_COLORLESS`, `multicolor`/`m` → `COLOR_MULTICOLOR`).
3. Letter-sequence fallback (`wur` → W|U|R bitmask).

A numeric value like `2` falls through all three steps: it is not a named color, not a special predicate, and contains no WUBRG letters. `parseColorValue("2")` returns `0`, so `ci:2` currently matches colorless cards — clearly wrong.

### Scryfall behavior

Scryfall supports numeric values for both `color:` and `identity:` fields. The number represents a count of distinct colors (popcount of the color bitmask, range 0–5):

- `ci:2` → cards with exactly 2 colors in their identity.
- `ci>=2` → cards with 2 or more colors.
- `c<3` → cards with fewer than 3 colors.
- `ci:0` → colorless (same result as `ci:c`).
- `ci:5` → five-color identity.

All comparison operators (`:`, `=`, `!=`, `<`, `>`, `<=`, `>=`) work with numeric values.

## Design

### Detection

A value is numeric if it matches `/^\d+$/` (one or more ASCII digits, no sign, no decimal). This is checked **before** the existing color resolution pipeline.

Detection order in the `identity`/`color` case of `evalLeafField` becomes:

1. Empty value → `fillCanonical` (existing behavior, unchanged).
2. **Numeric value** → color-count comparison (new).
3. Named lookup / special predicates / letter-sequence fallback → bitmask comparison (existing behavior, unchanged).

### Popcount computation

The number of colors is the popcount of the 5-bit color bitmask. The existing `COLOR_MULTICOLOR` path already computes this inline:

```typescript
let v = col[i];
v = (v & 0x55) + ((v >> 1) & 0x55);
v = (v & 0x33) + ((v >> 2) & 0x33);
const count = (v + (v >> 4)) & 0x0f;
```

The numeric path reuses this pattern.

### Operator semantics

For numeric color queries, all operators compare the card's color count against the query number using standard numeric comparison — the same pattern used by `manavalue`, `power`, etc.

The `:` operator means **equality** for numeric values (matching Scryfall). This differs from `:` with color letters, where it means subset/superset. The distinction is unambiguous because a value is either numeric or not.

| Query | Semantics |
|-------|-----------|
| `ci:2` | Color identity has exactly 2 colors |
| `ci=2` | Color identity has exactly 2 colors |
| `ci>=2` | Color identity has 2 or more colors |
| `ci<=2` | Color identity has 2 or fewer colors |
| `ci>2` | Color identity has more than 2 colors |
| `ci<2` | Color identity has fewer than 2 colors |
| `ci!=2` | Color identity does not have exactly 2 colors |

### Applies to both `color` and `identity`

Both `c:` and `ci:` (and all their aliases) support numeric values with the same semantics. `c:2` counts the card's face colors; `ci:2` counts the card's color identity.

### Edge cases

| Value | Behavior | Rationale |
|-------|----------|-----------|
| `0` | Matches colorless (popcount = 0) | Same result as `ci:c`, but via count comparison |
| `5` | Matches five-color cards | Maximum possible popcount of a 5-bit mask |
| `6` or higher | Error | Color count must be 0–5; Scryfall yields "Unknown color" — we provide a clearer message |
| Negative (e.g. `-1`) | Not applicable | Negative numbers are not matched by `/^\d+$/` — the `-` is parsed as a negation operator by the lexer, so `ci:-1` parses as `-ci:1` (NOT of ci:1). This is consistent with Scryfall. |

### Invalid numeric values (queryNum > 5)

If the parsed number is greater than 5, return an error string (e.g. `"color count must be 0–5"`) so the node is marked as an error. This matches Scryfall's behavior (which reports "Unknown color") but with a clearer message. Error nodes are skipped in AND/OR per Spec 039.

### No changes to `parseColorValue`

The numeric detection happens in `evalLeafField` before calling `parseColorValue`. The function `parseColorValue` continues to handle only color-name/letter resolution. This avoids adding yet another sentinel to that function's return type.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/search/eval-leaves.ts` | Add numeric detection and color-count comparison path in the `identity`/`color` case |
| `shared/src/search/evaluator.test.ts` | Add test cases for `ci:0`–`ci:5` and all operators |
| `shared/src/search/evaluator-errors.test.ts` | Verify that `ci:6` (or higher) produces an error node |
| `docs/specs/002-query-engine.md` | Add implementation note referencing this spec |

## Test Strategy

Tests use the existing synthetic card pool (9 cards, 10 face rows):

| Card | Color Identity | Count |
|------|---------------|-------|
| Sol Ring | (none) | 0 |
| Birds of Paradise | G | 1 |
| Lightning Bolt | R | 1 |
| Counterspell | U | 1 |
| Tarmogoyf | G | 1 |
| Thalia | W | 1 |
| Dismember | B | 1 |
| Azorius Charm | WU | 2 |
| Ayara | BR | 2 |

Distribution: 1× zero-color, 6× one-color, 2× two-color.

### Identity number queries

| Query | Expected count | Matched cards |
|-------|---------------|---------------|
| `ci:0` | 1 | Sol Ring |
| `ci:1` | 6 | Birds, Bolt, Counterspell, Tarmogoyf, Thalia, Dismember |
| `ci:2` | 2 | Azorius Charm, Ayara |
| `ci:3` | 0 | (none in pool) |
| `ci:5` | 0 | (none in pool) |
| `ci>=2` | 2 | Azorius Charm, Ayara |
| `ci>=1` | 8 | All except Sol Ring |
| `ci<=1` | 7 | Sol Ring + all monocolor |
| `ci>0` | 8 | All except Sol Ring |
| `ci<2` | 7 | Sol Ring + all monocolor |
| `ci!=1` | 3 | Sol Ring, Azorius Charm, Ayara |
| `ci=2` | 2 | Azorius Charm, Ayara |
| `ci:6` | Error | Invalid color count (see error tests) |

### Color number queries

| Query | Expected count | Notes |
|-------|---------------|-------|
| `c:0` | 1 | Sol Ring (colorless face) |
| `c:1` | 7 | Monocolor faces (6 single-face + Ayara front) |
| `c:2` | 2 | Azorius Charm (WU face), Ayara back face (BR) |

### Interaction with negation

| Query | Expected count | Notes |
|-------|---------------|-------|
| `-ci:2` | 7 | NOT of "exactly 2 colors" |
| `-ci:0` | 8 | NOT of "colorless" |

### Combination with other terms

| Query | Expected count | Notes |
|-------|---------------|-------|
| `ci:1 t:creature` | 3 | Monocolor creatures: Birds, Tarmogoyf, Thalia |
| `ci>=1 t:instant` | 4 | Non-colorless instants: Bolt, Counterspell, Azorius Charm, Dismember |

### Invalid color count (error)

| Query | Expected | Notes |
|-------|-----------|-------|
| `ci:6` | Error | `matchCount: -1`, error message e.g. `"color count must be 0–5"` |
| `ci:99` | Error | Same as above |
| `c:6` | Error | Same validation for `color` field |

### Aliases

| Query | Expected count | Notes |
|-------|---------------|-------|
| `id:2` | 2 | `id` alias for identity |
| `commander:1` | 6 | `commander` alias |
| `cmd:0` | 1 | `cmd` alias |

## Acceptance Criteria

1. `ci:N` where N is a non-negative integer filters by color identity count, not color bitmask.
2. All six comparison operators (`=`, `!=`, `<`, `>`, `<=`, `>=`) plus `:` work with numeric values.
3. `:` means equality for numeric values (matching Scryfall).
4. `c:N` filters by face color count using the same logic.
5. All identity aliases (`id`, `ci`, `identity`, `commander`, `cmd`) work with numeric values.
6. `ci:0` produces the same result set as `ci:c` (colorless).
7. Values above 5 produce error nodes (e.g. `"color count must be 0–5"`).
8. Numeric detection does not interfere with existing color name/letter parsing — `ci:2` is numeric, `ci:wub` is still letter-sequence.
