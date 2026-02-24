# Spec 034: Numeric Stat Value Parsing

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine)

## Goal

Define how non-numeric power, toughness, loyalty, and defense strings (e.g. `*`, `1+*`, `7-*`, `∞`) are converted to numbers for comparison operators (`<`, `>`, `<=`, `>=`, `=`, `!=`, `:`). Bring Frantic Search's handling of these values in line with Scryfall, which treats variable components (`*`, `X`, `Y`, `?`) as zero.

## Background

### The bug

The query `pow<2 pow>2` returns 49 cards on Scryfall but only 46 on Frantic Search. The missing cards have `*`-based power strings (e.g. `*`, `1+*`). Scryfall treats `*` as `0` for numeric comparisons, so `*` satisfies `pow<2`. Frantic Search currently calls `Number(raw)` on the dictionary string, gets `NaN`, and skips the card entirely.

### Stat value landscape

Power and toughness strings from Scryfall's oracle-cards bulk data include these non-numeric forms:

| Value | Count (approx) | Numeric interpretation | Notes |
|---|---|---|---|
| `*` | ~280 power, ~207 toughness | `0` | Variable: "equal to some game quantity" |
| `1+*` | 6 power, 16 toughness | `1` | Base plus variable |
| `2+*` | 2 power, 2 toughness | `2` | Base plus variable |
| `*+1` | 0 power, 4 toughness | `1` | Variable plus constant (commutative) |
| `7-*` | 0 power, 1 toughness | `7` | Base minus variable (Shapeshifter) |
| `*²` | 1 power, 1 toughness | `0` | Variable squared (S.N.O.T., Un-set) |
| `+0` through `+4` | Various (Un-set augments) | `0` through `4` | Modifier cards with leading `+` |
| `-1` | 1 power, 1 toughness | `-1` | Char-Rumbler |
| `-0` | 0 power, 1 toughness | `0` | Spinal Parasite |
| `.5` | 1 each | `0.5` | Little Girl (Un-set) |
| `1.5`, `2.5`, `3.5` | Various (Un-set) | `1.5`, `2.5`, `3.5` | Half-stat Un-set cards |
| `001` | 1 each | `1` | Ormacar, Relic Wraith (Un-set) |
| `?` | 3 power, 3 toughness | `0` | Shellephant, Catch of the Day, Loopy Lobster (Un-set) |
| `∞` | 1 power, 0 toughness | `Infinity` | Infinity Elemental (Un-set) |

Loyalty has additional forms: `X` (Nissa, Steward of Elements), `*` (B.O.B.), `1d4+1` (Dungeon Master, Un-set).

Defense currently has only numeric values (`4`) in the bulk data.

### Scryfall's behavior

Scryfall treats the special query values `x` and `y` (case-insensitive) as `0` for numeric comparisons. Querying `pow=x` yields "cards where the power = 0". Any other non-numeric query value like `pow=a` is rejected ("invalid expression"). This tells us that `x` and `y` are recognized aliases for zero at the **query** level, not just at the card-data level.

Scryfall's handling of `1d4+1` (Dungeon Master's loyalty) appears to be an accidental fallthrough: it strips non-digit characters and casts the result to a number, yielding `141`. The query `include:extras -legal:commander loy=141` returns exactly Dungeon Master and nothing else. We intentionally diverge here — see § Known Divergences.

## Design

### Parsing function: `parseStatValue`

A single pure function converts a stat string to a number. This function is used in two contexts:

1. **At `CardIndex` construction time** — to build pre-computed numeric lookup arrays from the dictionary.
2. **At query time** — to parse the user's query value (e.g. the `2` in `pow>2`).

```typescript
function parseStatValue(raw: string): number
```

#### Algorithm

1. **Trim whitespace** (defensive, not expected in practice).
2. **Empty string or null-ish** → return `NaN`. This signals "this face has no stat" and excludes it from all comparisons.
3. **Case-insensitive special values:**
   - `*`, `x`, `y`, `?` → return `0`.
   - `∞` → return `Infinity`.
4. **Normalize variables to `0`:**
   - Replace all occurrences of `*` with `0`.
   - Replace `²` with `**2`.
   - Replace dice notation `NdM` (e.g. `1d4`) with `N*1` — the minimum possible roll (each die contributes its minimum value of 1). This treats variable dice the same way we treat `*`: use the minimum.
5. **Attempt `Number()` parse.** If the normalized string is a valid number (including integers, decimals, negative numbers, leading `+`/`-`, leading zeros like `001`), return the result. `Number()` handles `+3` → `3`, `001` → `1`, `.5` → `0.5` natively.
6. **Simple arithmetic fallback.** If `Number()` fails (e.g. `"1+0"` from `"1+*"`), attempt to match against a simple two-operand expression: `/^([+-]?\d*\.?\d+)\s*([+\-*])\s*([+-]?\d*\.?\d+)(?:\s*\*\*\s*(\d+))?$/`. If matched, compute the result (addition, subtraction, or multiplication, with optional exponentiation).
   - `1+0` → `1` (from `1+*`)
   - `0+1` → `1` (from `*+1`)
   - `7-0` → `7` (from `7-*`)
   - `0**2` → `0` (from `*²`)
   - `1*1+1` → `2` (from `1d4+1`, after dice normalization produces `1*1+1`)
7. **Everything else** → `NaN`.

The function never throws.

For step 6, since dice normalization can produce compound expressions like `1*1+1`, the arithmetic evaluator should handle left-to-right evaluation of `*`, `+`, and `-` operators (standard precedence: multiplication before addition). In practice, the known forms are simple enough that a single-pass evaluation suffices.

### Pre-computed numeric lookups on `CardIndex`

Add four new `number[]` arrays to `CardIndex`, computed at construction time from the corresponding string dictionaries:

```typescript
readonly numericPowerLookup: number[];
readonly numericToughnessLookup: number[];
readonly numericLoyaltyLookup: number[];
readonly numericDefenseLookup: number[];
```

Each is built by mapping `parseStatValue` over the string dictionary:

```typescript
this.numericPowerLookup = data.power_lookup.map(parseStatValue);
```

These are tiny arrays (typically < 40 entries). Computing them once avoids repeated string parsing during evaluation.

### Query value parsing

The user's query value (e.g. the `2` in `pow>2`, or `x` in `pow=x`) is also parsed with `parseStatValue`. This means:
- `pow=x` is equivalent to `pow=0` (matching Scryfall).
- `pow=y` is equivalent to `pow=0`.
- `pow=*` is equivalent to `pow=0`.
- `pow=a` → `NaN` → no matches (matching Scryfall's "invalid expression" behavior, but we don't show an error — consistent with the parser-never-throws principle).

### Evaluator changes

The `power`/`toughness`/`loyalty`/`defense` case in `evalLeafField` changes from:

```typescript
const raw = lookup[idxCol[i]];
if (!raw) continue;
const cardNum = Number(raw);
if (isNaN(cardNum)) continue;
```

to:

```typescript
const cardNum = numericLookup[idxCol[i]];
if (isNaN(cardNum)) continue;
```

Where `numericLookup` is the pre-computed `numericPowerLookup` (etc.) from `CardIndex`.

The check `if (isNaN(cardNum)) continue` still correctly skips faces with no stat (empty string in the dictionary → `NaN`). But faces with `*`, `1+*`, etc. now get a real number and participate in comparisons.

### Impact on `is:bear`

The `is:bear` check in the `is:` operator evaluator currently uses `Number(index.powerLookup[...])`, which returns `NaN` for `*`. After this change, it should use the same `numericPowerLookup`/`numericToughnessLookup` arrays. A card with `*`/`*` power/toughness and cmc 2 would then match `is:bear` — this matches Scryfall's behavior.

## Test Strategy

### Unit tests for `parseStatValue`

A dedicated test suite for the pure function, covering every known form plus synthetic edge cases:

| Input | Expected | Category |
|---|---|---|
| `""` | `NaN` | Empty (no stat) |
| `"0"` | `0` | Zero |
| `"1"` | `1` | Integer |
| `"-1"` | `-1` | Negative |
| `"13"` | `13` | Multi-digit |
| `"001"` | `1` | Leading zeros |
| `".5"` | `0.5` | Decimal |
| `"1.5"` | `1.5` | Decimal |
| `"3.5"` | `3.5` | Decimal |
| `"+0"` | `0` | Leading plus |
| `"+3"` | `3` | Leading plus |
| `"-0"` | `0` | Negative zero |
| `"*"` | `0` | Wildcard |
| `"1+*"` | `1` | Base plus wildcard |
| `"2+*"` | `2` | Base plus wildcard |
| `"*+1"` | `1` | Wildcard plus constant |
| `"7-*"` | `7` | Base minus wildcard |
| `"*²"` | `0` | Wildcard squared |
| `"?"` | `0` | Unknown |
| `"∞"` | `Infinity` | Infinity |
| `"x"` | `0` | Variable (query alias) |
| `"X"` | `0` | Case-insensitive |
| `"y"` | `0` | Variable (query alias) |
| `"Y"` | `0` | Case-insensitive |
| `"1d4+1"` | `2` | Dice: `1d4` → `1*1`, so `1*1+1` → `2` |
| `"2d6"` | `2` | Dice: `2d6` → `2*1` → `2` (synthetic) |
| `"abc"` | `NaN` | Garbage |
| `"*+1"` | `1` | Commutative check |
| `"*+*"` | `0` | Double wildcard (synthetic, `0+0`) |

### Evaluator integration tests

Extend the existing synthetic card pool with a `*`-power card that is expected to match `pow<2`:

| Query | Before fix | After fix | Reason |
|---|---|---|---|
| `pow<2` | Misses `*` cards | Includes `*` cards | `* = 0 < 2` |
| `pow=0` | Misses `*` cards | Includes `*` cards | `* = 0 = 0` |
| `pow>0` | Misses `1+*` cards | Includes `1+*` cards | `1+* = 1 > 0` |
| `pow=x` | No matches (NaN query) | Matches `* = 0` cards | `x` parsed as `0` |

The existing test data already has Tarmogoyf at row 4 with power `*` (dict index 2, lookup `"*"`). Tests for `pow<2` should now include Tarmogoyf.

## Known Divergences from Scryfall

| Value | Scryfall | Frantic Search | Rationale |
|---|---|---|---|
| `1d4+1` | `141` (strip non-digits) | `2` (minimum roll: `1×1+1`) | Scryfall's `141` is an accidental fallthrough from stripping non-digit characters. We treat dice variables the same way we treat `*` — use the minimum possible value. A d4 rolls 1–4, so `1d4` = 1. |

This divergence only affects Dungeon Master (Un-set, `is:funny`). It is unlikely to be noticed in practice and produces a more defensible result.

## Acceptance Criteria

1. `parseStatValue` returns correct numeric values for all forms listed in the test table.
2. `parseStatValue` never throws, returning `NaN` for unrecognizable inputs.
3. Cards with `*` power satisfy `pow<1`, `pow=0`, `pow<=0`, `pow>=0`, `pow!=1`.
4. Cards with `1+*` power satisfy `pow=1`, `pow>0`, `pow<2`.
5. Cards with `7-*` toughness satisfy `tou=7`, `tou>6`.
6. Cards with no power/toughness (empty string) are excluded from all numeric comparisons (not treated as zero).
7. Query values `x`, `y`, `X`, `Y` are treated as `0`, matching Scryfall's behavior.
8. `is:bear` uses the same numeric lookup and correctly handles `*`-stat creatures.
9. The `pow<2 pow>2` query returns the same count as Scryfall (modulo known divergences documented in the comparison guide).
10. Pre-computed numeric lookups are built once at `CardIndex` construction, not re-parsed per query.
