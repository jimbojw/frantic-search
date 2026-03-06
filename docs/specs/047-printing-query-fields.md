# Spec 047: Printing Query Fields

**Status:** Implemented 

**Depends on:** Spec 002 (Query Engine), Spec 046 (Printing Data Model), ADR-017 (Dual-Domain Query Evaluation)

## Goal

Add printing-level query fields to the search engine: set, rarity, finish, frame, price, collector number, and printing-level `is:` keywords. These fields evaluate in the printing domain (ADR-017) and compose with existing face-level conditions via promotion at AND/OR/NOT boundaries.

## Background

The query engine (Spec 002) evaluates all fields against face-level columnar data. Spec 046 introduces a printing-level columnar dataset with ~120–150k rows (one per finish variant). ADR-017 establishes the dual-domain evaluation architecture where leaf nodes tagged as printing-domain produce `Uint8Array(printingCount)` buffers and composite nodes handle cross-domain promotion.

This spec defines which printing fields are queryable, their syntax and semantics, and the engine changes needed to evaluate them.

## New Fields

All fields below are **printing-domain**: they evaluate against the `PrintingColumnarData` arrays via a `PrintingIndex` wrapper.

### `set:` / `s:` / `e:` — Set code

| Operator | Semantics |
|---|---|
| `:`, `=` | Printing's set code matches the value (case-insensitive) |

Examples: `set:mh2`, `s:znr`, `e:usg`

The value is matched against the `code` field of `set_lookup[set_indices[i]]`. Exact match only (no substring). Multiple sets can be combined with OR: `set:mh2 OR set:mh3`.

### `r:` / `rarity:` — Rarity

| Operator | Semantics |
|---|---|
| `:`, `=` | Printing has this exact rarity |
| `>`, `>=`, `<`, `<=` | Ordinal rarity comparison |

Rarity values: `common`, `uncommon`, `rare`, `special`, `mythic` (plus abbreviations `c`, `u`, `r`, `s`, `m`).

Ordinal ordering for comparison operators: common(0) < uncommon(1) < rare(2) < special(3) < mythic(4).

Implementation: Rarity is bitmask-encoded (`common=1, uncommon=2, rare=4, mythic=8, special=16`). For `:` and `=`, test `rarity[i] & targetBit`. For comparisons like `r>=rare`, build a mask of all qualifying rarities (`rare | special | mythic = 0b11100`) and test `rarity[i] & mask`.

Examples: `r:mythic`, `rarity>=rare`, `r:special`, `r:c`

### `is:foil` / `is:etched` — Finish

| Operator | Semantics |
|---|---|
| `:` | Printing's finish matches the keyword |

These `is:` keywords evaluate in the printing domain against the `finish` enum column. `is:foil` matches rows where `finish === Finish.Foil`. `is:etched` matches rows where `finish === Finish.Etched`.

`is:nonfoil` is accepted as a keyword but is equivalent to `-is:foil` at the printing-row level (matches any row whose finish is not foil, including etched). The PRINTINGS tab does not show an `is:nonfoil` chip — the `is:foil` chip's negate state covers this use case.

When promoted to face domain via AND/OR/NOT, the semantics are "card has at least one printing with this finish" — e.g., `t:creature is:foil` returns creatures that have been printed in foil.

### `is:fullart` / `is:textless` / `is:reprint` / `is:promo` / `is:digital` / `is:borderless` / `is:extended` — Printing flags

| Operator | Semantics |
|---|---|
| `:` | Printing has this flag set in `printing_flags` |

Each keyword maps to a bit in the `printing_flags` bitmask column. Evaluation: `printing_flags[i] & flagBit`.

These move from `UNSUPPORTED_IS_KEYWORDS` in the evaluator to active printing-domain evaluation.

### `is:rainbowfoil` / `is:poster` / `is:boosterfun` / … — Promo types (Scryfall `promo_types`)

| Operator | Semantics |
|---|---|
| `:` | Printing has this value in its `promo_types` array |

All unique `promo_types` values discovered in Scryfall bulk data are queryable as printing-level `is:` keywords. Examples: `is:rainbowfoil`, `is:poster`, `is:boosterfun`, `is:surgefoil`, `is:setpromo`, `is:alchemy`, `is:rebalanced`, `is:stamped`, `is:prerelease`, `is:playtest`, `is:glossy`, etc. (52 total; see Spec 046 for the full list and bit layout).

Implementation: Each keyword maps to `{ column: 0 | 1, bit: number }` in `PROMO_TYPE_FLAGS`. For column 0, test `promo_types_flags_0[i] & (1 << bit)`; for column 1, test `promo_types_flags_1[i] & (1 << bit)`. Keywords not in the mapping return `"unknown"`.

When promoted to face domain (e.g. `t:creature is:poster`), semantics are "card has at least one printing with this promo type." Negation (`-is:poster`) works as expected.

**Dual-domain: `is:universesbeyond` / `is:ub`** — When printings are **loaded**, these evaluate in printing domain via `promo_types_flags_0`/`promo_types_flags_1`. When printings are **not** loaded, they fall back to face-domain evaluation (`CardFlag.UniversesBeyond`). This preserves behavior when printings fail to load (404, network error). The evaluator uses `FACE_FALLBACK_IS_KEYWORDS` to route these keywords to face-domain when `PrintingIndex` is null.

### `frame:` — Frame

| Operator | Semantics |
|---|---|
| `:`, `=` | Printing uses this frame |

Frame values: `1993`, `1997`, `2003`, `2015`, `future`.

Implementation: Bitmask-encoded. `frame[i] & targetBit`.

Examples: `frame:2015`, `frame:future`

### `usd:` / `$` — Price (USD)

| Operator | Semantics |
|---|---|
| `:`, `=` | Exact price match (in dollars, parsed to cents) |
| `>`, `>=`, `<`, `<=` | Price comparison |

The value is parsed as a dollar amount (e.g., `1`, `0.50`, `10.00`) and converted to cents for comparison against `price_usd`. Rows where `price_usd === 0` (no price data) are excluded from all price comparisons — they never match `usd<1` or `usd>=0`.

Examples: `usd<1`, `usd>=10`, `$:0.25` (Scryfall uses `usd`; see Spec 090)

### `cn:` / `number:` — Collector number

| Operator | Semantics |
|---|---|
| `:`, `=` | Exact string match on collector number (case-insensitive) |

Examples: `cn:1`, `cn:★3`, `number:1a`

### `year:` — Release year

| Operator | Semantics |
|---|---|
| `:`, `=` | Printing was released in this year (range-based) |
| `>`, `>=`, `<`, `<=` | Year comparison (range-based) |

The value is a four-digit year or partial-year prefix (e.g. `202`). Uses the same range-based semantics as `date:` — see **Spec 061** for the unified model. **Important:** `year:` accepts only `YYYY` or partial-year; values with month/day (e.g. `year=2025-02`) produce an error.

Examples: `year<=1994`, `year=2026`, `year=202`

### `date:` — Release date

| Operator | Semantics |
|---|---|
| `:`, `=` | Date in range (half-open interval) |
| `>`, `>=`, `<`, `<=` | Date comparison (range-based) |

Uses a **unified range model** — every date value maps to a half-open interval `[lo, hi)`. See **Spec 061** for full semantics. Summary:

- **Year:** `date=2025` → `[2025-01-01, 2026-01-01)` (Scryfall parity)
- **Month:** `date=2025-02` → `[2025-02-01, 2025-03-01)`
- **Day:** `date=2025-02-15` → `[2025-02-15, 2025-02-16)`
- **Partial:** `date=202` → `[2020-01-01, 2030-01-01)` (narrow-as-you-type)

Accepted formats:

- **Full date:** `YYYY-MM-DD` (e.g., `2015-08-18`)
- **Year and month:** `YYYY-MM` (e.g., `2020-08`)
- **Year only:** `YYYY` (e.g., `2020`)
- **Partial prefix:** Any prefix of `YYYY-MM-DD`; missing digits expand to full span (pad down for `lo`, pad up for `hi`).
- **Special values:** `now` or `today` resolves to the current date.
- **Set code:** A bare set code (e.g., `date>ori`) resolves to the set's `released_at` from `set_lookup`.

Rows where `released_at === 0` (unknown) are excluded from all date comparisons.

Examples: `date=2025`, `date>=2015-08-18`, `date>2025`, `date=202`, `date>ori`, `date>now`

## Engine Changes

### Bitmask constants (`shared/src/bits.ts`)

New constants:

```typescript
export const Rarity = {
  Common: 1 << 0,
  Uncommon: 1 << 1,
  Rare: 1 << 2,
  Mythic: 1 << 3,
  Special: 1 << 4,
} as const;

export const RARITY_NAMES: Record<string, number> = {
  common: Rarity.Common, c: Rarity.Common,
  uncommon: Rarity.Uncommon, u: Rarity.Uncommon,
  rare: Rarity.Rare, r: Rarity.Rare,
  mythic: Rarity.Mythic, m: Rarity.Mythic,
  special: Rarity.Special, s: Rarity.Special,
};

export const RARITY_ORDER: Record<number, number> = {
  [Rarity.Common]: 0,
  [Rarity.Uncommon]: 1,
  [Rarity.Rare]: 2,
  [Rarity.Special]: 3,
  [Rarity.Mythic]: 4,
};

export const Finish = {
  Nonfoil: 0,
  Foil: 1,
  Etched: 2,
} as const;

export const PrintingFlag = {
  FullArt: 1 << 0,
  Textless: 1 << 1,
  Reprint: 1 << 2,
  Promo: 1 << 3,
  Digital: 1 << 4,
  HighresImage: 1 << 5,
  Borderless: 1 << 6,
  ExtendedArt: 1 << 7,
} as const;

export const Frame = {
  Y1993: 1 << 0,
  Y1997: 1 << 1,
  Y2003: 1 << 2,
  Y2015: 1 << 3,
  Future: 1 << 4,
} as const;

export const FRAME_NAMES: Record<string, number> = {
  "1993": Frame.Y1993,
  "1997": Frame.Y1997,
  "2003": Frame.Y2003,
  "2015": Frame.Y2015,
  "future": Frame.Future,
};
```

### `PrintingIndex` (`shared/src/search/printing-index.ts`)

Wraps `PrintingColumnarData` with evaluation-ready fields, analogous to `CardIndex`:

```typescript
class PrintingIndex {
  readonly printingCount: number;
  readonly canonicalFaceRef: number[];
  readonly setIndices: number[];
  readonly setCodes: string[];           // expanded from set_lookup for fast comparison
  readonly rarity: number[];
  readonly finish: number[];
  readonly printingFlags: number[];
  readonly frame: number[];
  readonly priceUsd: number[];
  readonly collectorNumbersLower: string[];
  readonly promoTypesFlags0: number[];   // default [] when column missing (legacy)
  readonly promoTypesFlags1: number[];   // default [] when column missing (legacy)

  // Reverse map: canonical face index → printing row indices
  readonly faceToPrintings: Map<number, number[]>;

  constructor(data: PrintingColumnarData) { /* derive */ }
}
```

The `faceToPrintings` reverse map is built at construction time by iterating `canonicalFaceRef`. It enables face→printing promotion in the evaluator.

### Field aliases (`shared/src/search/eval-leaves.ts`)

Extend `FIELD_ALIASES`:

```typescript
const FIELD_ALIASES: Record<string, string> = {
  // ... existing face-level aliases ...
  s: "set", e: "set",
  rarity: "rarity", r: "rarity",
  usd: "usd", $: "usd",
  cn: "collectornumber", number: "collectornumber",
  frame: "frame",
};
```

### Printing-domain field set (`shared/src/search/eval-printing.ts`)

```typescript
const PRINTING_FIELDS = new Set([
  "set", "rarity", "usd", "collectornumber", "frame",
]);
```

`is:` keywords are handled separately (see below) but also evaluate in printing domain.

### Leaf evaluation: `evalPrintingField()` (`shared/src/search/eval-printing.ts`)

New function analogous to `evalLeafField()`, operating on `PrintingIndex` columns and producing a `Uint8Array(printingCount)`.

Dispatch from `evaluator.ts` into `eval-printing.ts`:

```typescript
if (isPrintingField(canonical)) {
  return evalPrintingField(canonical, operator, value, printingIndex, printingBuf, printingCount);
}
```

### `is:` keyword changes (`shared/src/search/eval-is.ts`)

Printing-domain `is:` keywords (`foil`, `nonfoil`, `etched`, `fullart`, `textless`, `reprint`, `promo`, `digital`, `borderless`, `extended`, `oversized`, plus all 52 `promo_types` values including `alchemy`, `rebalanced`, `rainbowfoil`, `poster`, `glossy`, `universesbeyond`, `playtest`, etc., plus `ub` as an alias for `universesbeyond`) are listed in `PRINTING_IS_KEYWORDS` and evaluated by `evalPrintingIsKeyword()`. `evalPrintingIsKeyword()` handles `ub` by looking up the same `PROMO_TYPE_FLAGS` entry as `universesbeyond`. Face-domain keywords (all existing ones) are handled by `evalIsKeyword()`.

`alchemy`, `rebalanced`, and `glossy` are removed from `UNSUPPORTED_IS_KEYWORDS` when they become supported via `promo_types_flags_0`/`promo_types_flags_1`.

**Face-fallback for dual-domain keywords:** Add `FACE_FALLBACK_IS_KEYWORDS = new Set(["universesbeyond", "ub"])`. When `is:universesbeyond` or `is:ub` is evaluated and printing data is not yet loaded, the evaluator falls through to face-domain `evalIsKeyword()` instead of returning `"printing data not loaded"`. Same pattern as `FACE_FALLBACK_PRINTING_FIELDS` for `legal`/`banned`/`restricted` (Spec 056).

### Dual-domain buffer management in `NodeCache` (`shared/src/search/evaluator.ts`)

`NodeCache` manages two buffer pools:

- Face-domain: `Uint8Array(faceCount)` — existing.
- Printing-domain: `Uint8Array(printingCount)` — new.

Each `InternedNode` tracks its domain (`"face" | "printing"`). Leaf nodes set their domain based on the field. Composite nodes determine their domain from their children and insert promotion as needed.

### Promotion implementation (`shared/src/search/eval-printing.ts`)

Two helper functions:

```typescript
function promotePrintingToFace(
  printingBuf: Uint8Array,
  faceBuf: Uint8Array,
  canonicalFaceRef: number[],
  printingCount: number,
): void {
  faceBuf.fill(0);
  for (let p = 0; p < printingCount; p++) {
    if (printingBuf[p]) faceBuf[canonicalFaceRef[p]] = 1;
  }
}

function promoteFaceToPrinting(
  faceBuf: Uint8Array,
  printingBuf: Uint8Array,
  faceToPrintings: Map<number, number[]>,
  faceCount: number,
): void {
  printingBuf.fill(0);
  for (let f = 0; f < faceCount; f++) {
    if (faceBuf[f]) {
      const printings = faceToPrintings.get(f);
      if (printings) for (const p of printings) printingBuf[p] = 1;
    }
  }
}
```

### Promotion strategy at composite nodes

When an AND or OR node has children in mixed domains, the evaluator promotes all children to **face domain** before combining. This ensures the root buffer is always face-domain (card counts for breakdown).

Additionally, when the query contains any printing-domain leaves, the evaluator performs a second pass to compute the **printing-domain intersection** — the set of printing rows that match the full query. This is returned as `printingIndices` for the display layer.

The printing-domain intersection is computed by:
1. Taking the root face-domain result.
2. Promoting it to printing domain (face→printing expansion).
3. AND-ing with any printing-domain leaf buffers that were computed during evaluation.

This avoids maintaining printing-domain buffers at every internal node — only leaf-level printing buffers are retained.

### Unavailability handling

If printing data has not yet loaded when a query containing printing-domain fields is evaluated:

- Printing-domain leaf nodes produce all-zero buffers (match nothing), except for `FACE_FALLBACK_IS_KEYWORDS` (`universesbeyond`, `ub`), which fall through to face-domain evaluation.
- The evaluator flags the result with `printingsUnavailable: true` when any non-fallback printing-domain field was present.
- The UI displays a non-destructive notice (Spec 039 pattern): "Printing data loading — set, rarity, and price filters are not yet available."

## Test Strategy

### Test files

Tests are split across several files in `shared/src/search/`:

| File | Contents |
|---|---|
| `evaluator.test-fixtures.ts` | Shared synthetic card pool (`TEST_DATA`, `TEST_PRINTING_DATA`) and pre-built `index`/`printingIndex` instances |
| `evaluator.test.ts` | Core evaluator tests (node key, caching, basic field evaluation) |
| `evaluator-printing.test.ts` | Printing-domain integration tests (cross-domain queries through `NodeCache.evaluate`) |
| `evaluator-is.test.ts` | `is:` keyword tests |
| `evaluator-errors.test.ts` | Error and edge-case tests |
| `eval-printing.test.ts` | Unit tests for `evalPrintingField()`, `isPrintingField()`, and promotion helpers |

The synthetic card pool in the fixtures is extended with printing data:

| Printing row | Card | Set | Rarity | Finish | Price (cents) | Frame |
|---|---|---|---|---|---|---|
| #0 | Lightning Bolt (row 0) | MH2 | rare | nonfoil | 100 | 2015 |
| #1 | Lightning Bolt (row 0) | MH2 | rare | foil | 300 | 2015 |
| #2 | Lightning Bolt (row 0) | A25 | uncommon | nonfoil | 50 | 2015 |
| #3 | Sol Ring (row 1) | C21 | uncommon | nonfoil | 75 | 2015 |
| #4 | Sol Ring (row 1) | C21 | uncommon | foil | 500 | 2015 |

Test cases:

| Query | Expected | Exercises |
|---|---|---|
| `set:mh2` | Lightning Bolt | Set query, printing→face promotion |
| `set:mh2 r:rare` | Lightning Bolt | Two printing conditions AND |
| `t:instant set:mh2` | Lightning Bolt | Cross-domain AND (face + printing) |
| `is:foil price<2` | Lightning Bolt (MH2 foil at $3.00 excluded, but need test data adjustment) | Finish + price on same row |
| `r>=rare` | Lightning Bolt | Rarity comparison |
| `-set:mh2 lightning` | Lightning Bolt (A25 printing matches) | NOT stays in printing domain, combined with face-level bare word |
| `is:foil` | Lightning Bolt, Sol Ring | Promoted to face: "has any foil printing" |
| `-is:foil is:etched` | Cards with etched printings | NOT stays in printing domain; row-level AND with `is:etched` |
| `is:rainbowfoil` | Cards with rainbowfoil printings | Promo type from promo_types_flags_0/1 |
| `is:poster` | Cards with poster printings | Promo type from promo_types_flags_0/1 |
| `is:alchemy` | Cards with alchemy printings | Previously unsupported; now via promo_types |
| `is:universesbeyond` (printings loaded) | UB printings | Printing-domain evaluation |
| `is:universesbeyond` (printings null) | UB cards via CardFlag | Face-domain fallback |

### Compliance suite (`cli/suites/`)

Add printing-field entries once the full dataset is available.

## Scope of Changes

| File | Change |
|---|---|
| `shared/src/bits.ts` | Add `Rarity`, `RARITY_NAMES`, `RARITY_ORDER`, `Finish`, `PrintingFlag`, `Frame`, `FRAME_NAMES`, `PROMO_TYPE_FLAGS` |
| `shared/src/data.ts` | Add `PrintingColumnarData` interface; add optional `promo_types_flags_0`, `promo_types_flags_1` |
| `shared/src/search/printing-index.ts` | New: `PrintingIndex` class; add `promoTypesFlags0`, `promoTypesFlags1` (default `[]` when missing) |
| `shared/src/search/eval-leaves.ts` | `FIELD_ALIASES` extended with printing field aliases |
| `shared/src/search/eval-printing.ts` | New: `PRINTING_FIELDS`, `isPrintingField()`, `evalPrintingField()`, `promotePrintingToFace()`, `promoteFaceToPrinting()` |
| `shared/src/search/eval-is.ts` | `PRINTING_IS_KEYWORDS`, `evalPrintingIsKeyword()`, `FACE_FALLBACK_IS_KEYWORDS`; add promo_types default branch; remove `alchemy`, `rebalanced`, `glossy` from `UNSUPPORTED_IS_KEYWORDS` |
| `shared/src/search/evaluator.ts` | Dual-domain composite node logic, domain tracking; face-fallback for `is:universesbeyond` when printings null |
| `etl/src/process-printings.ts` | Add `promo_types` to `DefaultCard`; encode `promo_types_flags_0`, `promo_types_flags_1` per row |
| `shared/src/search/evaluator.test-fixtures.ts` | Synthetic card pool and printing data shared across test files |
| `shared/src/search/evaluator-printing.test.ts` | Printing-domain integration tests (cross-domain queries through `NodeCache.evaluate`) |
| `shared/src/search/eval-printing.test.ts` | Unit tests for `evalPrintingField()`, promotion helpers |
| `shared/src/search/evaluator-is.test.ts` | `is:` keyword tests (face-domain and printing-domain) |

## Acceptance Criteria

1. `set:mh2` returns cards that have at least one MH2 printing.
2. `r:mythic` returns cards with at least one mythic printing.
3. `r>=rare` returns cards with at least one rare or mythic printing.
4. `is:foil` returns cards that have been printed in foil.
5. `is:foil price<1` returns cards with a foil printing under $1.00.
6. `t:creature set:mh2` returns creatures that appear in MH2 (cross-domain AND).
7. `-is:foil` matches printing rows that are not foil (NOT stays in printing domain). When promoted to face, returns cards with at least one non-foil printing.
8. `frame:future` returns cards with the futuristic frame.
9. `price<1` excludes rows with no price data (price_usd = 0).
10. `cn:1` returns printings with collector number "1".
11. Queries with no printing-domain fields are unaffected (no performance regression, no behavioral change).
12. When printing data is not yet loaded, printing-domain fields match nothing and the evaluator flags `printingsUnavailable`.
13. `is:rainbowfoil`, `is:poster`, `is:boosterfun`, and all other promo_types values match printings that have that value in their `promo_types` array.
14. `is:universesbeyond` and `is:ub` evaluate in printing domain when printings are loaded; fall back to face domain (CardFlag.UniversesBeyond) when printings are not loaded.
15. `-is:poster` correctly negates (matches printings without poster promo type).

## Implementation Notes

- 2026-03-03: Added printing-domain `is:` keywords for Scryfall `promo_types` (52 values). Added `FACE_FALLBACK_IS_KEYWORDS` for dual-domain `is:universesbeyond`/`is:ub`. Removed `alchemy`, `rebalanced`, `glossy` from `UNSUPPORTED_IS_KEYWORDS`. See issue #72.
