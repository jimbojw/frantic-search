# Spec 008: Mana Cost Matching

**Status:** Implemented

## Goal

Replace the current substring-based mana cost matching with structured symbol-map comparison, so that queries like `m:rr`, `m:1rr`, `m:r{r}`, and `m:{r}r` all work correctly — matching Scryfall's behavior.

## Background

The evaluator currently treats `m:` / `mana:` as a raw substring check against the stored mana cost string (e.g. `{2}{R}{R}`). This works for fully-braced queries (`m:{r}{r}`) but fails for bare-character shorthand (`m:rr`) and mixed forms (`m:r{r}`, `m:{r}r`), all of which Scryfall supports.

Scryfall's `m:` operator means "the card's mana cost contains at least these mana symbols." This is a component-wise ≥ check on parsed symbol counts — the same pattern used by `c:` for colors.

## Data Model

### Mana symbol map

A mana cost is decomposed into a `Record<string, number>` mapping symbol keys to counts.

| Mana cost string | Parsed map |
|------------------|------------|
| `{2}{R}{R}` | `{ generic: 2, r: 2 }` |
| `{R}{R}` | `{ r: 2 }` |
| `{1}{G}` | `{ generic: 1, g: 1 }` |
| `{W}{U}` | `{ w: 1, u: 1 }` |
| `{1}{B/P}{B/P}` | `{ generic: 1, "b/p": 2 }` |
| `{X}{R}` | `{ x: 1, r: 1 }` |
| `{2/W}{2/W}` | `{ "2/w": 2 }` |
| (empty string) | `{}` |

### Symbol key rules

1. **Braced symbols** (`{...}`): the content between braces, lowercased, is the symbol key. `{R}` → `"r"`, `{B/P}` → `"b/p"`, `{2/W}` → `"2/w"`.
2. **Generic mana**: A braced symbol whose content is a pure non-negative integer (`{1}`, `{2}`, `{10}`) contributes to the `"generic"` key with its numeric value. `{2}` adds 2 to `generic`, not 1.
3. **Bare characters in queries**: Each bare character is wrapped in braces and then follows the same rules. `rr` → `{r}{r}` → `{ r: 2 }`. `2rr` → `{2}{r}{r}` → `{ generic: 2, r: 2 }`.
4. **Hybrid/Phyrexian symbols are atomic**: `{2/W}` is the symbol key `"2/w"`, NOT `{ generic: 2 }` nor `{ w: 1 }`. `{B/P}` is `"b/p"`, not `{ b: 1 }`. The `/` is part of the key.
5. **Multi-digit bare numbers in queries**: Consecutive bare digits are grouped into a single number. `12rr` → `{ generic: 12, r: 2 }`.
6. **`{X}`**: Treated as a regular symbol with key `"x"`. `{X}{X}{R}` → `{ x: 2, r: 1 }`.

### What is NOT a generic integer

Only braced symbols whose entire content is a non-negative integer are generic: `{0}`, `{1}`, `{2}`, ..., `{16}`.

These are **not** generic and are treated as opaque symbol keys:
- `{2/W}` → key `"2/w"` (hybrid)
- `{X}` → key `"x"`
- `{C}` → key `"c"` (colorless)
- `{S}` → key `"s"` (snow)

## Parse function

```typescript
function parseManaSymbols(cost: string): Record<string, number>;
```

Accepts both card mana cost strings (always fully braced, e.g. `{2}{R}{R}`) and query values (which may use bare shorthand, e.g. `2rr`, `r{r}`, `{r}r{r}`).

### Algorithm

Walk the input left-to-right:
- If `{`, scan to the next `}`. The content (lowercased) is the symbol. If it parses as a non-negative integer, add that value to `"generic"`. Otherwise increment the symbol key by 1.
- If a digit (`0-9`), consume consecutive digits, parse as integer, add to `"generic"`.
- Otherwise, the character (lowercased) is the symbol key; increment by 1.
- Unclosed `{` at end of input: treat remaining characters as bare.

### Comparison function

```typescript
function manaContains(card: Record<string, number>, query: Record<string, number>): boolean;
```

Returns `true` if for every key in `query`, `card[key] >= query[key]`. Keys absent from `card` are treated as 0.

This implements the `:` (and `>=`) operator. Other operators if/when supported:
- `=`: maps are identical (same keys, same values).
- Future: `<`, `>`, `<=` on total mana value could use a separate `cmc`/`mv` field rather than symbol maps.

## Integration points

### CardIndex

Pre-compute `manaSymbols: Record<string, number>[]` (one entry per face row) during `CardIndex` construction, alongside the existing `manaCostsLower`.

### Evaluator

The `"mana"` case in `evalLeafField` changes from:

```typescript
buf[i] = index.manaCostsLower[i].includes(valLower) ? 1 : 0;
```

to:

```typescript
const querySymbols = parseManaSymbols(valLower);
// ... (querySymbols parsed once, outside the loop)
buf[i] = manaContains(index.manaSymbols[i], querySymbols) ? 1 : 0;
```

### AST

No changes. The AST `FieldNode.value` remains the raw query string. The evaluator parses it on the fly — it's a short string and only parsed once per evaluation.

## Test strategy

### `parseManaSymbols` unit tests (in `mana.test.ts`)

| Input | Expected output |
|-------|-----------------|
| `{2}{R}{R}` | `{ generic: 2, r: 2 }` |
| `{R}{R}` | `{ r: 2 }` |
| `rr` | `{ r: 2 }` |
| `2rr` | `{ generic: 2, r: 2 }` |
| `r{r}` | `{ r: 2 }` |
| `{r}r` | `{ r: 2 }` |
| `r{r}r` | `{ r: 3 }` |
| `{r}r{r}` | `{ r: 3 }` |
| `{1}{B/P}{B/P}` | `{ generic: 1, "b/p": 2 }` |
| `{2/W}{2/W}` | `{ "2/w": 2 }` |
| `{X}{R}` | `{ x: 1, r: 1 }` |
| `{W}{U}` | `{ w: 1, u: 1 }` |
| `12rr` | `{ generic: 12, r: 2 }` |
| `{10}` | `{ generic: 10 }` |
| `r` | `{ r: 1 }` |
| `{r}` | `{ r: 1 }` |
| `` (empty) | `{}` |
| `{1}` | `{ generic: 1 }` |
| `{C}` | `{ c: 1 }` |
| `{S}{S}` | `{ s: 2 }` |

### `manaContains` unit tests

| Card map | Query map | Expected |
|----------|-----------|----------|
| `{ generic: 2, r: 2 }` | `{ r: 2 }` | `true` |
| `{ generic: 2, r: 2 }` | `{ generic: 1, r: 2 }` | `true` |
| `{ generic: 2, r: 2 }` | `{ generic: 3, r: 2 }` | `false` |
| `{ r: 2 }` | `{ r: 3 }` | `false` |
| `{ r: 2 }` | `{ r: 2 }` | `true` |
| `{ generic: 1, "b/p": 2 }` | `{ "b/p": 1 }` | `true` |
| `{ generic: 1, "b/p": 2 }` | `{ b: 1 }` | `false` |
| `{}` | `{}` | `true` |
| `{ r: 1 }` | `{}` | `true` |
| `{}` | `{ r: 1 }` | `false` |

### Evaluator integration tests (in `evaluator.test.ts`)

Update existing mana tests and add new ones against the synthetic card pool:

- `m:rr` — should match 0 (no card has R ≥ 2)
- `m:uu` — should match 1 (Counterspell: `{U}{U}`)
- `m:1g` — should match 1 (Tarmogoyf: `{1}{G}`)
- `m:g` — should match 2 (Birds `{G}`, Tarmogoyf `{1}{G}`)
- `m:1` — should match 5 (any card with generic ≥ 1)
- `m:r{r}` — same as `m:rr` (0)
- `m:{r}r` — same as `m:rr` (0)
- `m:{b/p}` — should match 1 (Dismember: `{1}{B/P}{B/P}`)

## File organization

```
shared/src/search/
├── mana.ts           # parseManaSymbols, manaContains
├── mana.test.ts      # unit tests for the above
├── evaluator.ts      # updated mana case
├── card-index.ts     # pre-computed manaSymbols[]
└── ...
```

## Acceptance criteria

1. `m:rr`, `m:r{r}`, `m:{r}r`, `m:r{r}r`, and `m:{r}r{r}` all produce identical results.
2. `m:1rr` matches cards with generic ≥ 1 and R ≥ 2 (e.g. `{2}{R}{R}`, `{3}{R}{R}`).
3. `m:{2/w}` matches cards containing the hybrid symbol `{2/W}`, not cards with generic ≥ 2 or W ≥ 1.
4. `m:{b/p}` matches cards containing `{B/P}`, not cards with B ≥ 1.
5. All existing evaluator tests continue to pass (mana tests updated to new semantics).
6. `parseManaSymbols` has dedicated unit tests covering all rows in the test table above.
