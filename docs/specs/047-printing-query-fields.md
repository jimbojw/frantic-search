# Spec 047: Printing Query Fields

**Status:** In Progress 

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

Rarity values: `common`, `uncommon`, `rare`, `mythic` (plus abbreviations `c`, `u`, `r`, `m`).

Ordinal ordering for comparison operators: common(0) < uncommon(1) < rare(2) < mythic(3).

Implementation: Rarity is bitmask-encoded (`common=1, uncommon=2, rare=4, mythic=8`). For `:` and `=`, test `rarity[i] & targetBit`. For comparisons like `r>=rare`, build a mask of all qualifying rarities (`rare | mythic = 0b1100`) and test `rarity[i] & mask`.

Examples: `r:mythic`, `rarity>=rare`, `r:c`

### `is:foil` / `is:nonfoil` / `is:etched` — Finish

| Operator | Semantics |
|---|---|
| `:` | Printing's finish matches the keyword |

These `is:` keywords evaluate in the printing domain against the `finish` enum column. `is:foil` matches rows where `finish === Finish.Foil`.

When promoted to face domain via AND/OR/NOT, the semantics are "card has at least one printing with this finish" — e.g., `t:creature is:foil` returns creatures that have been printed in foil.

### `is:fullart` / `is:textless` / `is:reprint` / `is:promo` / `is:digital` / `is:borderless` / `is:extended` — Printing flags

| Operator | Semantics |
|---|---|
| `:` | Printing has this flag set in `printing_flags` |

Each keyword maps to a bit in the `printing_flags` bitmask column. Evaluation: `printing_flags[i] & flagBit`.

These move from `UNSUPPORTED_IS_KEYWORDS` in the evaluator to active printing-domain evaluation.

### `frame:` — Frame

| Operator | Semantics |
|---|---|
| `:`, `=` | Printing uses this frame |

Frame values: `1993`, `1997`, `2003`, `2015`, `future`.

Implementation: Bitmask-encoded. `frame[i] & targetBit`.

Examples: `frame:2015`, `frame:future`

### `price:` / `usd:` — Price (USD)

| Operator | Semantics |
|---|---|
| `:`, `=` | Exact price match (in dollars, parsed to cents) |
| `>`, `>=`, `<`, `<=` | Price comparison |

The value is parsed as a dollar amount (e.g., `1`, `0.50`, `10.00`) and converted to cents for comparison against `price_usd`. Rows where `price_usd === 0` (no price data) are excluded from all price comparisons — they never match `price<1` or `price>=0`.

Examples: `price<1`, `usd>=10`, `price:0.25`

### `cn:` / `number:` — Collector number

| Operator | Semantics |
|---|---|
| `:`, `=` | Exact string match on collector number (case-insensitive) |

Examples: `cn:1`, `cn:★3`, `number:1a`

### `year:` — Release year

| Operator | Semantics |
|---|---|
| `:`, `=` | Printing was released in this year |
| `>`, `>=`, `<`, `<=` | Year comparison |

The value is a four-digit year. Compared against `Math.floor(released_at / 10000)`.

Examples: `year<=1994`, `year=2026`

### `date:` — Release date

| Operator | Semantics |
|---|---|
| `:`, `=` | Exact date match |
| `>`, `>=`, `<`, `<=` | Date comparison |

The value is a `YYYY-MM-DD` date string, parsed to YYYYMMDD uint32 for comparison against `released_at`. The special value `now` or `today` resolves to the current date. A bare set code (e.g., `date>ori`) resolves to the set's `released_at` from `set_lookup`.

Rows where `released_at === 0` (unknown) are excluded from all date comparisons.

Examples: `date>=2015-08-18`, `date>ori`, `date>now`

## Engine Changes

### Bitmask constants (`shared/src/bits.ts`)

New constants:

```typescript
export const Rarity = {
  Common: 1 << 0,
  Uncommon: 1 << 1,
  Rare: 1 << 2,
  Mythic: 1 << 3,
} as const;

export const RARITY_NAMES: Record<string, number> = {
  common: Rarity.Common, c: Rarity.Common,
  uncommon: Rarity.Uncommon, u: Rarity.Uncommon,
  rare: Rarity.Rare, r: Rarity.Rare,
  mythic: Rarity.Mythic, m: Rarity.Mythic,
};

export const RARITY_ORDER: Record<number, number> = {
  [Rarity.Common]: 0,
  [Rarity.Uncommon]: 1,
  [Rarity.Rare]: 2,
  [Rarity.Mythic]: 3,
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
  price: "price", usd: "price",
  cn: "collectornumber", number: "collectornumber",
  frame: "frame",
};
```

### Printing-domain field set (`shared/src/search/eval-printing.ts`)

```typescript
const PRINTING_FIELDS = new Set([
  "set", "rarity", "price", "collectornumber", "frame",
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

Printing-domain `is:` keywords (`foil`, `nonfoil`, `etched`, `fullart`, `textless`, `reprint`, `promo`, `digital`, `borderless`, `extended`) are listed in `PRINTING_IS_KEYWORDS` and evaluated by `evalPrintingIsKeyword()`, which operates on the printing buffer and returns `"printing"` domain. Face-domain keywords (all existing ones) are handled by `evalIsKeyword()`, which returns `"ok"` as today. Both functions live in `eval-is.ts`.

These keywords are removed from `UNSUPPORTED_IS_KEYWORDS`.

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

- Printing-domain leaf nodes produce all-zero buffers (match nothing).
- The evaluator flags the result with `printingsUnavailable: true`.
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
| `-set:mh2 lightning` | Lightning Bolt (A25 printing matches) | NOT + printing promotion |
| `is:foil` | Lightning Bolt, Sol Ring | Promoted to face: "has any foil printing" |

### Compliance suite (`cli/suites/`)

Add printing-field entries once the full dataset is available.

## Scope of Changes

| File | Change |
|---|---|
| `shared/src/bits.ts` | Add `Rarity`, `RARITY_NAMES`, `RARITY_ORDER`, `Finish`, `PrintingFlag`, `Frame`, `FRAME_NAMES` |
| `shared/src/data.ts` | Add `PrintingColumnarData` interface |
| `shared/src/search/printing-index.ts` | New: `PrintingIndex` class |
| `shared/src/search/eval-leaves.ts` | `FIELD_ALIASES` extended with printing field aliases |
| `shared/src/search/eval-printing.ts` | New: `PRINTING_FIELDS`, `isPrintingField()`, `evalPrintingField()`, `promotePrintingToFace()`, `promoteFaceToPrinting()` |
| `shared/src/search/eval-is.ts` | `PRINTING_IS_KEYWORDS`, `evalPrintingIsKeyword()` for printing-domain `is:` keywords; remove printing keywords from `UNSUPPORTED_IS_KEYWORDS` |
| `shared/src/search/evaluator.ts` | Dual-domain composite node logic, domain tracking in `NodeCache`/`InternedNode` |
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
7. `-is:foil` returns cards that have *no* foil printing (NOT promotion works correctly).
8. `frame:future` returns cards with the futuristic frame.
9. `price<1` excludes rows with no price data (price_usd = 0).
10. `cn:1` returns printings with collector number "1".
11. Queries with no printing-domain fields are unaffected (no performance regression, no behavioral change).
12. When printing data is not yet loaded, printing-domain fields match nothing and the evaluator flags `printingsUnavailable`.
