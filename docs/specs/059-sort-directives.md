# Spec 059: Sort Directives

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 019 (Relevance-Boosted Default Ordering), Spec 039 (Non-Destructive Error Handling), Spec 044 (Terms Drawer Redesign), Spec 048 (Printing-Aware Display), Spec 052 (Scryfall Outlink Canonicalization), Spec 054 (Pinned Search Criteria), Spec 058 (View Mode as Query Term), ADR-009 (Bitmask-per-Node AST), ADR-019 (Scryfall Parity by Default)

**Supersedes:** Spec 010 (Sort Directives)

## Goal

Allow users to control result ordering through `sort:field` query terms and sort chips in the Terms Drawer. Sort directives follow the established query-modifier pattern (like `unique:prints`, `include:extras`, `view:mode`): they live in the AST, produce match-all buffers so they don't affect filtering, and surface as flags on `EvalOutput` for the worker to apply after evaluation.

Sort direction is controlled by the NOT operator: `sort:name` sorts ascending (the default for name), `-sort:name` sorts descending. This reuses the existing NOT/negation infrastructure throughout the parser, evaluator, breakdown UI, chip cycling, and pin/unpin system.

Unknown sort values (e.g. `sort:foo`, `-sort:foo`) are visible errors in breakdown views and have no effect on filtering or ordering.

## Background

Frantic Search currently orders results using `seededSort` (Spec 019): a bare-word prefix boost for relevance, followed by a keyed hash for deterministic pseudorandom order within each tier. There is no way for the user to sort results by name, mana value, price, release date, or any other field.

Scryfall separates sort from query via URL parameters (`order=`, `dir=`). Since Frantic Search uses a single search box as its primary input and supports pinned query criteria (Spec 054), embedding sort directives in the query string keeps the search box and pinned layer as the single source of truth. Sort preferences can be pinned just like format filters.

Spec 010 proposed a similar feature but pre-dated printing-level data, `unique:prints`, pinned queries, and the Terms Drawer. It also proposed a `ParseResult { ast, sort }` return type that diverges from the established modifier pattern. This spec replaces it.

## Syntax

```
sort:name           # alphabetical A–Z (ascending is name's default)
-sort:name          # alphabetical Z–A (NOT reverses direction)
sort:mv             # mana value low-to-high
-sort:mv            # mana value high-to-low
sort:usd            # price low-to-high (Scryfall field name)
-sort:usd           # price high-to-low
sort:date           # newest-first (descending is date's default)
-sort:date          # oldest-first
sort:power          # highest-first (descending is power's default)
-sort:power         # lowest-first
```

### Grammar

Sort directives reuse the existing `FIELD` parse rule (`WORD COLON WORD`). The evaluator identifies a field node as a sort directive when the field name is `sort` (case-insensitive).

```
sort_value = sort_field
sort_field = "name" | "mv" | "cmc" | "manavalue"
           | "usd" | "$"
           | "date" | "released" | "year"
           | "rarity"
           | "color" | "c"
           | "power" | "pow"
           | "toughness" | "tou"
           | "edhrec" | "edhrecrank"
           | "salt" | "edhrecsalt" | "saltiness"
```

Direction is controlled entirely by the NOT operator:

- `sort:field` → default direction for that field (see § "Sortable Fields")
- `-sort:field` → reversed direction

No `-asc` or `-desc` suffixes. The value is always a bare field name.

`sort:frantic` is not introduced by this spec. "Frantic" refers to the existing default ordering path when no valid `sort:` directive is active.

### Position independence

Sort directives may appear anywhere in the query. Position relative to filter terms does not affect semantics.

```
t:creature sort:mv c:green      # equivalent to:
c:green t:creature sort:mv      # same filter, same sort
```

### Multiple sort keys (future)

This spec defines single-sort-key behavior. If multiple `sort:` tokens are present, **last valid one wins** (consistent with `view:` in Spec 058). Unknown sort fields remain visible as errors but are ignored for effective sort selection. Compound sort (left-to-right tie-breaking) may be added in a future spec.

## Sortable Fields

### Face-domain fields

These fields sort over deduplicated cards (face indices). They work with or without `unique:prints`.

| Sort field | Aliases | Column | Default dir | Behavior |
|---|---|---|---|---|
| `name` | — | `combinedNamesNormalized` | asc | Alphabetical (locale-insensitive, case-insensitive) |
| `mv` | `cmc`, `manavalue` | `manaValue` | asc | Numeric (low-to-high). MV 0 sorts first. |
| `color` | `c` | `colors` bitmask | asc | By popcount (number of colors), then WUBRG bitmask value for stability. Colorless (0) sorts first. |
| `power` | `pow` | `numericPowerLookup` | desc | Numeric (highest first). Non-numeric values (`*`, `1+*`) sort last. |
| `toughness` | `tou` | `numericToughnessLookup` | desc | Same as power. |
| `edhrec` | `edhrecrank` | `edhrecRank` | asc | EDHREC Commander popularity rank. Lower rank = more popular; rank 1 sorts first. Null/missing sorts last (Spec 099). |
| `salt` | `edhrecsalt`, `saltiness` | `edhrecSalt` | desc | EDHREC saltiness. Higher value = saltier; saltiest first by default. Null/missing sorts last (Spec 101). |

### Printing-domain fields

These fields sort over individual printings, then project that ordering onto card results when deduplicated display is active (`unique:cards`).

| Sort field | Aliases | Column | Default dir | Behavior |
|---|---|---|---|---|
| `usd` | `$` | `priceUsd` | asc | Numeric (cheapest first). Zero-price printings (no price data) sort last. |
| `date` | `released`, `year` | `releasedAt` | desc | Newest-first. Stored as YYYYMMDD integers. Zero (unknown date) sorts last. |
| `rarity` | — | `rarity` | desc | Mythic-first. Uses the Rarity bitmask's numeric values (Mythic > Special > Rare > Uncommon > Common). |

### Null/missing value handling

Across all fields, null or missing values sort **last** regardless of sort direction:

- Non-creature with `sort:power` → sorts after all creatures
- Printing with `priceUsd === 0` (no price data) → sorts after all priced printings
- Printing with `releasedAt === 0` (unknown date) → sorts after all dated printings
- Non-numeric stat values (`*`, `1+*`, `X`) in power/toughness → sort after all numeric values
- Card with no EDHREC rank (`edhrecRank === null`) → sorts after all ranked cards

## Architecture

### Modifier pattern

Sort directives follow the established modifier pattern used by `unique:prints` (Spec 048), `include:extras` (Spec 057), and `view:` (Spec 058):

1. **Parser:** No changes. `sort:name` is parsed as a normal `FIELD` node with `field: "sort"`, `operator: ":"`, `value: "name"`. `-sort:name` is parsed as `NOT(FIELD("sort", ":", "name"))`.

2. **Evaluator:** In `computeTree()`, before the `FIELD_ALIASES` lookup, recognize `field === "sort"`. Produce a match-all buffer (same as `unique:prints`). Validate the value against `SORT_FIELDS`; unknown fields produce a visible error (`unknown sort field "foo"`) while preserving match-all semantics (no filtering effect). For the NOT case: when the child is a `sort:` FIELD, produce match-all instead of inverting (the direction is extracted separately by the walk function).

3. **EvalOutput:** Add `sortBy: SortDirective | null` to `EvalOutput`. The evaluator extracts this from the AST via a `_findSortDirective(ast)` walk (analogous to `_hasUniquePrints`).

```typescript
interface SortDirective {
  field: string;       // canonical field name: "name", "mv", "usd", etc.
  direction: 'asc' | 'desc';
  isPrintingDomain: boolean;
}
```

The walk function tracks NOT depth to determine direction:

```typescript
private _findSortDirective(ast: ASTNode, negated = false): SortDirective | null {
  switch (ast.type) {
    case "FIELD": {
      if (ast.field.toLowerCase() !== "sort") return null;
      const entry = SORT_FIELDS[ast.value.toLowerCase()];
      if (!entry) return null;
      const direction = negated
        ? (entry.defaultDir === 'asc' ? 'desc' : 'asc')
        : entry.defaultDir;
      return { field: entry.canonical, direction, isPrintingDomain: entry.isPrintingDomain };
    }
    case "NOT": return this._findSortDirective(ast.child, !negated);
    case "AND": case "OR": {
      // last-wins: right-to-left
      for (let i = ast.children.length - 1; i >= 0; i--) {
        const found = this._findSortDirective(ast.children[i], negated);
        if (found) return found;
      }
      return null;
    }
    default: return null;
  }
}
```

When multiple `sort:` nodes exist, last-valid-one-wins (rightmost valid directive in the AST). When none exist, `sortBy` is `null`.

4. **Scryfall outlinks:** `canonicalize.ts` strips `sort:` terms from Scryfall outlinks (same as `view:`), since Scryfall uses `order=` / `dir=` URL parameters instead.

### Why NOT for direction?

Using the NOT operator (`-sort:name`) to reverse sort direction, rather than a value suffix (`sort:name-desc`), has significant advantages:

1. **`cycleChip` works as-is.** The existing tri-state cycle (neutral → positive → negative → neutral) maps directly to (no sort → default direction → reversed direction → remove). No new `cycleSortChip` function needed.
2. **`getChipState` works as-is.** `findFieldNode` with `negated: false` detects `sort:name` (positive = default direction), `negated: true` detects `-sort:name` (negative = reversed).
3. **Pin/unpin, `removeNode`, `appendTerm`** — all operate on AST nodes and handle NOT-wrapped nodes already.
4. **Breakdown rendering** — NOT-leaf chips are already rendered with `-` prefix and the negative visual state.
5. **No value parsing ambiguity.** The value is always a bare field name. No need to split on `-` and decide whether the suffix is a direction or part of the field name.

The only new code is a guard in `computeTree`'s NOT case to preserve the match-all buffer when the child is a `sort:` modifier.

### Why not a separate `ParseResult`?

Spec 010 proposed extracting sort directives during parsing into a `ParseResult { ast, sort }`. This is rejected because:

1. **Modifier precedent.** `unique:prints`, `include:extras`, and `view:` all stay in the AST. Sort should follow the same pattern.
2. **Breakdown UI.** Sort terms appear in the query breakdown as chips. They are pinnable, unpinnable, and removable via ×. This requires them to be AST nodes with spans.
3. **Query editing.** `removeNode`, `appendTerm`, `cycleChip`, and the entire `query-edit.ts` infrastructure operates on AST nodes. Extracting sort during parsing would bypass all of this.

### Printing-domain sort and unique mode

Printing-domain sort does **not** change `uniqueMode`. The query's effective unique mode is still resolved by `unique:` terms (last legal term wins, default `cards`).

Behavior by unique mode:

- `unique:cards` (default): use printing-domain comparator to order printings, then project to card order by first-seen canonical face in that sorted printing list. The chosen representative printing for each card is therefore the best-ranked printing under the active sort.
- `unique:prints`: render all printings in printing-comparator order (subject to existing view-mode rules in Spec 048).
- `unique:art`: deduplicate rendering by art per Spec 048; ordering source remains the sorted printing stream.

### Evaluation pipeline (updated)

```
input → lexer → tokens → parser → ASTNode
                                     │
                                     ▼
                            evaluator (modifier detection)
                                     │
                                     ▼
                            EvalOutput { indices, printingIndices?, sortBy, uniqueMode, ... }
                                     │
                                     ▼
                            worker: combine pinned + live
                                     │
                                     ▼
                            playable filter (Spec 057)
                                     │
                                     ▼
                            sort in printing domain + regroup by card
                                     │
                                     ▼
                            histograms → result
```

### Sort implementation

Sorting is defined as a printings-first pipeline followed by card regrouping:

1. Build/derive the filtered printing stream for the effective query.
2. Apply sort semantics.
3. Regroup to card order by first-seen canonical face in the sorted stream.
4. Emit:
   - card results (`indices`) from regrouped face order,
   - printing results (`printingIndices`) as grouped runs per card in that same card order.

#### Allocation discipline (performance)

Sorting and regrouping run on every keystroke and must avoid GC-heavy allocation patterns in the hot path.

- Prefer pre-allocated typed-array workflows (`Uint8Array`, `Uint32Array`) with count-then-fill passes.
- Avoid dynamic growth APIs (`array.push`) and hash containers (`Set`, `Map`) in core result processing paths when a typed-array/indexed approach is practical.
- "Lists" and "emit" in this spec are conceptual terms; implementation should materialize final outputs as fixed-size typed arrays.
- Keep compatibility with existing worker transfer behavior (`postMessage` + transferable `ArrayBuffer`) so large result buffers are moved, not cloned.

When no `sort:` directive is present, default ordering remains Frantic Search's relevance-boosted seeded order (Spec 019). This is an intentional divergence from Scryfall and is documented per ADR-019.

#### Face-domain sort

When `sortBy` specifies a face-domain field, sort at card level. If printing results are present (`unique:prints`/`unique:art` display paths), printings of each card remain in their existing relative order (stable pass-through), and cards are not interleaved by printing rows.

Card comparator:

```typescript
function sortByField(
  indices: number[],
  directive: SortDirective,
  index: CardIndex,
  seedHash: number,
): void {
  const { field, direction } = directive;
  const dir = direction === 'desc' ? -1 : 1;

  indices.sort((a, b) => {
    const cmp = compareField(a, b, field, index);
    if (cmp !== 0) return dir * cmp;
    // Tiebreaker: alphabetical by name (unless already sorting by name)
    if (field !== 'name') {
      const nameCmp = compareName(a, b, index);
      if (nameCmp !== 0) return nameCmp;
    }
    // Ultimate fallback: seeded hash for deterministic card order
    return seededRank(seedHash, a) - seededRank(seedHash, b);
  });
}
```

When the active mode renders printings, emit printings as grouped runs in sorted card order. For face-domain sorts (including default frantic mode), intra-card printing order is stable from input order (no per-card reshuffle).

#### Printing-domain sort

When `sortBy` specifies a printing-domain field, sort **within each card first**, then sort cards by each card's top-ranked printing (the first printing in that card's sorted run). This guarantees:

- cards are ordered by printing-level criterion,
- printings of different cards are never interleaved,
- printings within a card appear in the requested direction.

Per-card printing comparator:

```typescript
function sortPrintingsByField(
  printingsOfCard: number[],
  directive: SortDirective,
  printingIndex: PrintingIndex,
  seedHash: number,
): number[] {
  const { field, direction } = directive;
  const dir = direction === 'desc' ? -1 : 1;

  const arr = [...printingsOfCard];
  arr.sort((a, b) => {
    const cmp = comparePrintingField(a, b, field, printingIndex);
    if (cmp !== 0) return dir * cmp;
    // Deterministic printing-level tie-breakers
    const dateCmp = printingIndex.releasedAt[b] - printingIndex.releasedAt[a];
    if (dateCmp !== 0) return dateCmp;
    const cnCmp = printingIndex.collectorNumbersLower[a]
      .localeCompare(printingIndex.collectorNumbersLower[b]);
    if (cnCmp !== 0) return cnCmp;
    return seededRank(seedHash, a) - seededRank(seedHash, b); // printing-row fallback
  });
  return arr;
}
```

Card regroup step for printing-domain sorts:

1. Partition filtered printings by canonical face.
2. Sort each card's printing list with `sortPrintingsByField(...)`.
3. Let each card's representative printing be that list's first element.
4. Sort cards by representative-printing comparator (same field+direction, same tie-breakers, then card-level seeded fallback).
5. Emit grouped `printingIndices` by concatenating each card's sorted run in sorted card order.
6. Derive `indices` by taking first-seen canonical face from that grouped stream.

#### Intra-card printing order

When multiple printings of the same card appear in result output:

- Face-domain sorts (and default frantic mode): preserve existing printing order within card (stable input order).
- Printing-domain sorts: order printings within card by the active printing comparator and direction; use deterministic tie-breakers (release date, collector number, seeded row fallback).

In both cases, printings for a given card remain contiguous.

A future spec may formalize intra-card printing order as a standalone feature (independent of user-specified sort).

### Interaction with pinned queries

Sort directives compose across pinned and live queries. The effective sort is determined by a simple priority:

1. If the **live** query has a **valid** `sort:` term, use it.
2. Else if the **pinned** query has a **valid** `sort:` term, use it.
3. Else fall back to `seededSort`.

Live takes priority because it represents the user's current intent. A pinned `sort:name` provides a stable default that the user can temporarily override by typing `sort:usd` in the live query.

This means a pinned `sort:name` acts as "my default sort preference" — always applied unless the live query says otherwise.

### Interaction with the breakdown UI

Sort directives appear in the query breakdown as regular chips. They show match counts (which equal total card count, since they are match-all). They are pinnable, unpinnable, and removable via ×.

The match count on a `sort:` chip is not semantically meaningful (it is always match-all). Future enhancement: the breakdown could display sort direction instead of a count. This spec does not prescribe breakdown changes beyond ensuring `sort:` nodes are visible and interactive.

### Interaction with the evaluation cache

Sort directives do not affect caching. The `NodeCache` operates on the filter AST. A `sort:name` node always produces the same match-all buffer. Two queries with the same filters but different sorts share cached evaluation results for all non-`sort:` nodes.

## NOT handling in `computeTree`

The NOT case in `computeTree` normally inverts the child buffer. For sort modifiers, this would turn match-all into match-none, incorrectly filtering out all cards. The fix is a targeted guard:

```typescript
case "NOT": {
  const childAst = ast.child;
  // ...compute child...

  // Sort modifiers under NOT: preserve match-all (direction extracted separately)
  if (childAst.type === "FIELD" && childAst.field.toLowerCase() === "sort") {
    interned.computed = { ...childInterned.computed! };
    break;
  }

  // Normal NOT: invert the child buffer
  // ...existing inversion logic...
}
```

This mirrors the existing behavior where `_hasUniquePrints` walks through NOT nodes — the modifier is detected regardless of negation. The difference is that `-sort:name` is an intentional, common input path (unlike `-unique:prints`), so the evaluator must handle the buffer correctly.

For invalid values (`sort:foo`, `-sort:foo`), evaluator behavior is:

- preserve match-all buffer (never destructive),
- annotate the node with `error: unknown sort field "foo"`,
- do not emit a `sortBy` directive from `_findSortDirective`.

## Terms Drawer: Sort Tab

### New tab

Add a **SORT** tab to the Terms Drawer. It appears after PRICES in the tab list.

### Sort chips

Sort chips use the existing `cycleChip` infrastructure with the standard tri-state cycle:

| State | Visual | Query effect | Next state on tap |
|---|---|---|---|
| neutral | Gray chip | No `sort:` term for this field | → positive |
| positive | Blue chip with `↑` or `↓` (default dir) | `sort:field` in query | → negative |
| negative | Red chip with `↓` or `↑` (reversed dir) | `-sort:field` in query | → neutral |

The arrow indicator always reflects the actual sort direction:

- For default-asc fields (name, mv, color): positive = `↑`, negative = `↓`
- For default-desc fields (power, toughness, price, date, rarity): positive = `↓`, negative = `↑`

The red/strikethrough negative state reads as "sort by this field, but reversed." The arrow removes any ambiguity about which direction is active.

### Chip definitions

```typescript
const SORT_FIELDS = ['sort']

const SORT_CHIPS: ChipDef[] = [
  // Face-domain
  { label: 'sort:name', field: SORT_FIELDS, operator: ':', value: 'name', term: 'sort:name' },
  { label: 'sort:mv', field: SORT_FIELDS, operator: ':', value: 'mv', term: 'sort:mv' },
  { label: 'sort:color', field: SORT_FIELDS, operator: ':', value: 'color', term: 'sort:color' },
  { label: 'sort:power', field: SORT_FIELDS, operator: ':', value: 'power', term: 'sort:power' },
  { label: 'sort:toughness', field: SORT_FIELDS, operator: ':', value: 'toughness', term: 'sort:toughness' },
  { label: 'sort:edhrec', field: SORT_FIELDS, operator: ':', value: 'edhrec', term: 'sort:edhrec' },
  // Printing-domain
  { label: 'sort:$', field: SORT_FIELDS, operator: ':', value: '$', term: 'sort:$' },
  { label: 'sort:date', field: SORT_FIELDS, operator: ':', value: 'date', term: 'sort:date' },
  { label: 'sort:rarity', field: SORT_FIELDS, operator: ':', value: 'rarity', term: 'sort:rarity' },
]
```

### Exclusive selection

Only one sort chip can be active at a time. The chip handler must remove any existing `sort:` (or `-sort:`) term before cycling the tapped field. This is a wrapper around `cycleChip`:

1. Find any existing `sort:` FIELD node in the breakdown (positive or negative).
2. If found and it's for a **different** field, remove it first.
3. Then call `cycleChip` for the tapped field.

### Interaction with `unique:prints`

Sort chips do not auto-add or auto-remove `unique:prints`. Sort selection and unique-mode selection are independent controls.

## Scryfall Outlink

`canonicalize.ts` strips `sort:` terms from Scryfall outlinks (Scryfall uses URL parameters for sort, not query terms). The app constructs outlinks from the **effective query** (`pinned AND live`) and adds `&order={field}&dir={direction}` parameters when an active valid `sort:` directive is present (see issue [#82](https://github.com/jimbojw/frantic-search/issues/82)).

The field name mapping from Frantic Search to Scryfall:

| Frantic Search | Scryfall `order=` | Scryfall `dir=` |
|---|---|---|
| `name` | `name` | `asc` / `desc` |
| `mv` | `cmc` | `asc` / `desc` |
| `color` | `color` | `asc` / `desc` |
| `power` | `power` | `asc` / `desc` |
| `toughness` | `toughness` | `asc` / `desc` |
| `usd` | `$` | `asc` / `desc` |
| `date` | `released` | `asc` / `desc` |
| `rarity` | `rarity` | `asc` / `desc` |
| `edhrec` | `edhrec` | `asc` / `desc` |

## Error Handling

- **Unknown sort field** (`sort:foo`, `-sort:foo`): Error on the breakdown node: `unknown sort field "foo"`. The match-all buffer is still produced (the node does not reduce results), but the error is visible in the breakdown. No sort is applied.
- **Trailing `sort:`** (no value): Parsed as `FIELD` with empty value. Evaluator produces a NOP-like match-all with no sort effect, consistent with other trailing-field error recovery.

## Changes by Layer

### `shared/src/search/ast.ts`

Add `sortBy: SortDirective | null` to `EvalOutput`. Add `SortDirective` interface.

### `shared/src/search/evaluator.ts`

- In `computeTree()` FIELD case: recognize `field === "sort"` before `FIELD_ALIASES` lookup. Validate the value against `SORT_FIELDS` map. Produce match-all buffer. Store error for unknown fields without using destructive error semantics.
- In `computeTree()` NOT case: when the child is a `sort:` FIELD, produce match-all instead of inverting.
- Add `_findSortDirective(ast, negated?): SortDirective | null` private method. Walks the AST right-to-left (last-valid-wins), tracks NOT depth to determine direction.
- Return `sortBy` from `evaluate()`.

### `shared/src/search/ordering.ts`

Add `sortByField()` and printing-group helpers (including per-card `sortPrintingsByField()`) alongside existing `seededSort` / `seededSortPrintings`. Add field comparators:
- `compareName(a, b, index)` — string comparison on `combinedNamesNormalized`.
- `compareMv(a, b, index)` — numeric comparison on `manaValue`.
- `compareColor(a, b, index)` — popcount then bitmask.
- `compareStat(a, b, lookup)` — numeric comparison with NaN-sorts-last.
- `comparePrintingPrice(a, b, pIdx)` — numeric with zero-sorts-last.
- `comparePrintingDate(a, b, pIdx)` — numeric with zero-sorts-last.
- `comparePrintingRarity(a, b, pIdx)` — numeric on rarity value.

### `shared/src/search/canonicalize.ts`

Strip `sort:` FIELD nodes in `serializeNode` (same as `view:`). When a sort directive is active, add `&order=` and `&dir=` parameters to the Scryfall outlink URL.

### `app/src/worker-search.ts`

- Import `SortDirective`, `sortByField`, `sortPrintingsByField` from `@frantic-search/shared`.
- After combining pinned + live `EvalOutput`, resolve the effective `sortBy` (live valid sort wins over pinned valid sort).
- For printing-domain sort, ensure a printing stream is available as the ordering source, partition/sort by card group, then emit grouped runs in card order; do not force `uniqueMode = 'prints'`.
- Replace `seededSort` / `seededSortPrintings` calls with `sortByField` / `sortPrintingsByField` when `sortBy` is present. Fall back to Spec 019 ordering when absent.

### `app/src/TermsDrawer.tsx`

- Add `'sort'` to the `TABS` array.
- Define `SORT_CHIPS` with face-domain and printing-domain sort chip definitions.
- Render sort chips with arrow indicators (`↑` / `↓`) based on `ChipState` and field default direction.
- Add exclusive-selection logic: tapping a sort chip removes any existing sort for a different field before cycling.

### `app/src/query-edit.ts`

Add helper to find and remove any active `sort:` term (positive or negative) for exclusive selection. The core cycling uses the existing `cycleChip`.

### `shared/src/worker-protocol.ts`

No changes. The worker already sends sorted `indices` and `printingIndices`. The sort field/direction is encoded in the query string itself (visible in the breakdown), so no additional protocol fields are needed.

## Test Strategy

### Evaluator tests

```typescript
test("sort:name produces match-all buffer", () => {
  const { result } = evaluate("sort:name");
  expect(result.matchCount).toBe(TOTAL_CANONICAL_FACES);
  expect(result.error).toBeUndefined();
});

test("-sort:name produces match-all buffer (NOT does not invert)", () => {
  const { result } = evaluate("-sort:name");
  expect(result.matchCount).toBe(TOTAL_CANONICAL_FACES);
});

test("sort:foo produces error", () => {
  const { result } = evaluate("sort:foo");
  expect(result.error).toBe('unknown sort field "foo"');
  expect(result.matchCount).toBe(TOTAL_CANONICAL_FACES);
});

test("sort:name does not affect filter", () => {
  const { indices } = evaluate("t:creature sort:name");
  const { indices: noSort } = evaluate("t:creature");
  expect(indices.length).toBe(noSort.length);
});

test("-sort:name does not affect filter", () => {
  const { indices } = evaluate("t:creature -sort:name");
  const { indices: noSort } = evaluate("t:creature");
  expect(indices.length).toBe(noSort.length);
});

test("sortBy extracted: sort:mv", () => {
  const { sortBy } = evaluate("t:creature sort:mv");
  expect(sortBy).toEqual({ field: "mv", direction: "asc", isPrintingDomain: false });
});

test("sortBy extracted: -sort:mv (reversed)", () => {
  const { sortBy } = evaluate("t:creature -sort:mv");
  expect(sortBy).toEqual({ field: "mv", direction: "desc", isPrintingDomain: false });
});

test("sortBy extracted: sort:date (default desc)", () => {
  const { sortBy } = evaluate("sort:date");
  expect(sortBy).toEqual({ field: "date", direction: "desc", isPrintingDomain: true });
});

test("sortBy extracted: -sort:date (reversed to asc)", () => {
  const { sortBy } = evaluate("-sort:date");
  expect(sortBy).toEqual({ field: "date", direction: "asc", isPrintingDomain: true });
});

test("last valid sort: wins", () => {
  const { sortBy } = evaluate("sort:name sort:usd");
  expect(sortBy).toEqual({ field: "usd", direction: "asc", isPrintingDomain: true });
});

test("invalid trailing sort: does not override earlier valid sort:", () => {
  const { sortBy } = evaluate("sort:name sort:bogus");
  expect(sortBy).toEqual({ field: "name", direction: "asc", isPrintingDomain: false });
});
```

### Sort tests

Using a synthetic card pool, assert sort correctness:

```typescript
test("sort:name sorts alphabetically ascending", ...);
test("-sort:name sorts alphabetically descending", ...);
test("sort:mv sorts by mana value ascending", ...);
test("sort:power sorts by power descending (default)", ...);
test("-sort:power sorts by power ascending (reversed)", ...);
test("non-numeric power sorts last regardless of direction", ...);
test("sort:usd sorts printings by price ascending", ...);
test("zero-price printings sort last", ...);
test("sort:date sorts printings by release date descending (default)", ...);
test("printing-domain sort keeps card printings contiguous (no interleaving)", ...);
test("sort:usd asc groups cards by cheapest printing, then printings asc within card", ...);
test("sort:usd desc groups cards by priciest printing, then printings desc within card", ...);
test("ties broken by name for face-domain sorts", ...);
test("ties broken by release date + collector number for printing-domain sorts", ...);
test("no sort directive preserves Spec 019 ordering", ...);
test("face-domain sort with printing output preserves intra-card printing input order", ...);
```

### Worker integration tests

```typescript
test("sort:name applied after playable filter", ...);
test("printing-domain sort does not force unique mode", ...);
test("printing-domain sort projects card order from sorted printings under unique:cards", ...);
test("printing-domain sort emits grouped printing runs in card order", ...);
test("default frantic mode keeps printings stable within each card", ...);
test("pinned sort: is overridden by live sort:", ...);
test("pinned sort: applies when live has no sort:", ...);
```

### `query-edit` tests

```typescript
test("cycleChip: neutral → adds sort:name", ...);
test("cycleChip: sort:name (positive) → replaces with -sort:name (negative)", ...);
test("cycleChip: -sort:name (negative) → removes (neutral)", ...);
test("exclusive selection: activating sort:$ removes existing sort:name", ...);
```

## Acceptance Criteria

1. `sort:name` in the query sorts results alphabetically A–Z. `-sort:name` sorts Z–A.
2. `sort:mv` sorts by mana value ascending. `-sort:mv` sorts descending. `sort:cmc` and `sort:manavalue` are accepted aliases.
3. `sort:usd` sorts by printing price low-to-high. With default `unique:cards`, card order is projected from grouped sorted printings (first-seen printing per card). With `unique:prints`, printings are shown as grouped card runs ordered by price semantics (per Spec 048 view rules).
4. `sort:date` sorts printings by release date newest-first (default desc). `-sort:date` sorts oldest-first.
5. `sort:rarity` sorts printings by rarity mythic-first (default desc).
6. `sort:power` sorts by power highest-first (default desc). Non-numeric power sorts last.
7. `sort:` and `-sort:` terms appear in the query breakdown and are pinnable/unpinnable.
8. `sort:` and `-sort:` terms do not affect which cards match (match-all buffer preserved through NOT).
9. `sort:foo` produces an error in the breakdown: `unknown sort field "foo"`.
10. `sort:foo` and `-sort:foo` have no filtering or ordering effect (including when they are the only query term).
11. When no `sort:` term is present, Spec 019 ordering is preserved (no regression).
12. The evaluation cache is unaffected by sort directives.
13. The SORT tab in the Terms Drawer shows sort chips with the standard tri-state cycle.
14. Sort chips display directional arrows (`↑` / `↓`) reflecting the actual sort direction.
15. Only one sort chip can be active at a time (exclusive selection).
16. Sort chip interactions do not auto-add or auto-remove `unique:prints`.
17. Scryfall outlinks are built from the effective query (`pinned AND live`), strip `sort:` from `q=`, and add `&order=` / `&dir=` URL parameters for active valid sort.
18. Live valid `sort:` takes priority over pinned valid `sort:`.
19. Pinned valid `sort:` applies as default sort when the live query has no valid `sort:` term.
20. Ties in the primary sort field are broken by meaningful secondary comparisons (name for face-domain, release date + collector number for printing-domain), then by seeded hash.
21. For printing-domain sorts, printings are grouped by card in output order; printings from different cards are not interleaved.
22. For face-domain sorts (including default frantic mode), intra-card printing order is stable from input order when printing results are rendered.
23. For printing-domain sorts, intra-card printing order follows the requested direction with deterministic tie-breakers.

## ADR-019 Alignment

This spec follows ADR-019 (Scryfall parity by default) with one explicit, principled divergence:

- Frantic Search keeps Spec 019's seeded/frantic ordering as the default when no explicit sort directive is present.
- When a user specifies `sort:`, that explicit ordering is respected.
- This avoids introducing a hidden always-on deterministic ranking (such as alphabetic default) that can bias discovery behavior.
