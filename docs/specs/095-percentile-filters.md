# Spec 095: Percentile Filters for Sortable Columns

**Status:** Implemented

**GitHub Issue:** [#104](https://github.com/jimbojw/frantic-search/issues/104)

**Depends on:** Spec 002 (Query Engine), Spec 059 (Sort Directives), Spec 080 (USD Null and Negated Price Semantics), Spec 096 (Name Comparison Operators — for `name` percentile support), ADR-009 (Bitmask-per-Node AST)

## Goal

Allow users to filter by percentile of a sortable field instead of absolute thresholds. For example, `usd>99%` returns the top 1% most expensive cards, and `date>90%` finds the newest 10%. This is especially useful for continuous or heavily fluctuating metrics where absolute thresholds are unintuitive or constantly shifting.

## Motivation

Filtering by continuous metrics (e.g., price, release date) forces users to guess arbitrary thresholds (`usd>50`, `date>2020`). As the dataset grows and shifts, these absolute thresholds become frustrating. Percentile-based filtering lets users query by relative distribution: "top 10% most expensive" or "newest 5%" without knowing the underlying values.

Future community metrics (EDHREC rank, salt scores) will have bounds that are either unintuitive or constantly expanding; percentile queries will be critical there.

## Grammar

The parser recognizes `<field><operator><number>%` where:

- `field` is a percentile-capable field (see § "Percentile-Capable Fields")
- `operator` is one of `>`, `<`, `>=`, `<=`, `=`, `:`, `!=`
- `number` is 0–100, optionally with a decimal component (e.g. `90`, `99.5`, `0.1`)

**Lexer / Parser:** No changes required. The lexer does not treat `%` as a word break, so `usd>90%` is tokenized as `usd`, `>`, `90%` (WORD). The parser already produces `FIELD` nodes with `value: "90%"`.

## Percentile-Capable Fields

A field receives percentile treatment if it satisfies:

1. **Has a useful total ordering** — the field is sortable, and the ordering is one users would meaningfully query by percentiles (e.g., price, date, name). Oracle text, while orderable (alphabetically, by length), does not have a useful ordering for percentile queries.
2. **Has meaningful diversity of values** — "meaningful" here means meaningful to a user for their journey, not a specific statistical measure. Low-diversity fields (e.g., mana value, power, toughness) are excluded because percentile cutoffs would be coarse and of limited utility.

### Initial field set

| Field | Domain | Rationale |
|-------|--------|-----------|
| `usd` | Printing | Continuous price distribution; high diversity. |
| `date` | Printing | Continuous release-date distribution; high diversity. |
| `name` | Face | Alphabetical ordering; high diversity (30k+ distinct names). Requires Spec 096 (name comparison operators). |
| `edhrec` | Face | EDHREC Commander popularity rank; lower numeric value = more popular. Requires rank inversion (see § "Rank Inversion"). Spec 099. |
| `salt` | Face | EDHREC saltiness; higher numeric value = saltier. No inversion. Spec 101. |

### Excluded (low diversity)

- `mv`, `power`, `toughness`, `color`, `rarity` — few tens of distinct values at most; percentile queries like `mv<50%` are not meaningfully useful.

## Semantics

### Range operators (`>`, `<`, `>=`, `<=`)

Percentile is interpreted as position in the sorted distribution of non-null values. Higher percentile = "further along" in the sort direction.

| Query | Meaning |
|-------|---------|
| `usd>90%` | Top 10% most expensive (printings in the 90th–100th percentile by price) |
| `usd<10%` | Bottom 10% cheapest |
| `date>90%` | Newest 10% (top 10% by release date, desc) |
| `date<10%` | Oldest 10% |
| `name>50%` | Latter half of the alphabet (names from 50th percentile onward) |
| `edhrec>90%` | Top 10% most popular (lowest 10% of rank values; rank inversion) |
| `edhrec<10%` | Bottom 10% least popular |

**Implementation:** For `field>p%` and `field>=p%`, the result set is indices from `floor(n * p/100)` to `n-1` in the pre-sorted array. For `field<p%`, indices from `0` to `floor(n * p/100) - 1`. For `field<=p%`, indices from `0` to `floor(n * p/100)` (inclusive of boundary).

### Equality (`=`, `:`)

All percentile queries are range queries (cf. Spec 061's unified range model for date). Equality means "rounds to this value": a band of ±0.5 around the stated percentile.

| Query | Equivalent range | Band |
|-------|------------------|------|
| `usd=90%` | `usd>=89.5% usd<90.5%` | 89.5–90.5 percentile |
| `usd=99.9%` | `usd>=99.85% usd<99.95%` | 99.85–99.95 percentile |
| `usd=0%` | `usd>=-0.5% usd<0.5%` | 0–0.5 percentile (lo clamps to 0) |
| `usd=100%` | `usd>=99.5% usd<100.5%` | 99.5–100 percentile (hi clamps to 100) |

**Formula:** For `field=p%`, the band is `[max(0, p-0.5), min(100, p+0.5))`. Convert to indices via the pre-sorted array.

### Inequality (`!=`)

`field!=p%` yields the complement of `field=p%`: all rows except those in the ±0.5 band.

### Null handling

Cards (or printings) with `null` or missing values for the field are:

1. **Excluded from the percentile distribution** — the sorted array contains only non-null indices.
2. **Excluded from the result set** — percentile queries never return null-valued rows.

If a user wants nulls explicitly, they use `field=null` (where supported, e.g. `usd=null` per Spec 080).

### Negation

Applying the NOT operator (`-`) inverts the comparison operator but strictly maintains the null-omission rule (Three-Valued Logic).

| Original | Negated |
|----------|---------|
| `field>90%` | `field<=90%` |
| `field>=90%` | `field<90%` |
| `field<10%` | `field>=10%` |
| `field<=10%` | `field>10%` |
| `field=90%` | `field!=90%` |
| `field!=90%` | `field=90%` |

So `-usd>90%` yields the exact same result as `usd<=90%`. It must **not** include cards with a null `usd` field.

**Implementation:** Extend the existing Spec 080 negation path in the evaluator. Currently it checks for `usd` and `value !== "null"`. Generalize to all percentile-capable fields: when the child FIELD has a percentile value (e.g. `/^\d+(\.\d+)?%$/`) and the field is percentile-capable, apply operator inversion instead of buffer inversion. This covers `-usd>90%`, `-date<10%`, and future fields.

### Rank inversion

For rank-based metrics (e.g. EDHREC rank), a **lower** numeric value means "better" (more popular). Therefore `edhrec>90%` yields the 10% *most popular* cards — the lowest 10% of numeric rank values.

**Mechanism:** The `invertPercentile?: boolean` flag on the sort-field definition. When true, the pre-sorted array is built in **descending** order by rank (highest rank first, lowest rank last), so the "best" values are at the high-index end. The slice logic remains universal; `edhrec>90%` takes indices from `floor(n * 0.9)` to `n-1`, which are the top 10% most popular.

## Technical Approach

### Pre-computation

At index construction (when `PrintingIndex` or `CardIndex` is built), for each percentile-capable field:

1. Count non-null values.
2. Allocate `Uint32Array(nonNullCount)`.
3. Fill with indices of non-null rows.
4. Sort by the field value (ascending for standard fields; descending for rank-inverted fields).
5. Store in `PrintingIndex` or `CardIndex` (or a dedicated percentile-index structure).

Per `shared/AGENTS.md`: use count-then-fill, pre-allocated buffers. Avoid `Set` and `push()`.

### Execution

A percentile query defines bounds on the sorted array:

- `field>p%` → `startIndex = floor(n * p/100)`, result = indices from `startIndex` to `n-1`
- `field>=p%` → `startIndex = floor(n * p/100)` (same for continuous; for discrete, `>=` includes the boundary)
- `field<p%` → `endIndex = floor(n * p/100)`, result = indices from `0` to `endIndex - 1`
- `field<=p%` → `endIndex = floor(n * p/100) + 1`, result = indices from `0` to `endIndex - 1`
- `field=p%` → band `[lo, hi)` where `lo = max(0, p-0.5)`, `hi = min(100, p+0.5)`; convert to indices
- `field!=p%` → complement of `field=p%`

The result set is the set of indices in the slice. Mark those positions in the output buffer.

### Performance

O(1) bounds calculation on the pre-sorted array. No per-row comparison loop. Instant "as-you-type" performance on the main UI thread.

## Card detail — equality percentile chip labels (Spec 183)

Card detail shows **raw** chips (`edhrec=<n>`, `salt=…`, `$=…`) plus **percentile** chips (`edhrec=<p>%`, `salt=<p>%`, `$=<p>%`) that must use the **same equality band** as § Equality (`=`, `:`) above when the user runs that query.

**Inputs (worker or shared helper):**

- A **pre-sorted index array** of row indices (face indices for `edhrec` / `salt`; printing indices for `usd`) containing only **non-null** distribution members, in the **same order** as `CardIndex` / `PrintingIndex` use for evaluation (`sortedEdhrecIndices`, `sortedSaltIndices`, `sortedUsdIndices`, etc.).
- `n` = length of that sorted array.
- The **target row index** (`faceIndex` or `printingIndex`) whose label is being rendered.
- **Null-valued** rows (no rank, no salt, no price) → **no percentile chip** (same as percentile queries excluding nulls).

**Algorithm:** Find `pos` such that `sorted[pos] === target` (if duplicates exist, any matching position in the contiguous equal-value run may be used as long as the chosen `p` still places the target inside the equality band — see tests). Compute an **integer** display `p` in `0…100` such that the index band for `field=p%` per § Equality **includes** `pos`. The helper `displayEqualityPercentileLabel` in `shared/src/percentile-chip-display.ts` implements this (rounds to a stable integer; searches adjacent `p` if needed so the band contains the row).

**Where it runs:** Only the worker holds `CardIndex` / `PrintingIndex`; the main thread holds raw column values but not the sorted percentile arrays. Implementations may (1) call the helper inside the worker and return labels in a card-detail supplement message, or (2) post compact distribution summaries on `ready` — **Spec 024** does not require shipping full sorted arrays to the main thread. Until card-detail UI lands, exporting the shared helper satisfies the contract for unit tests and future wiring.

**Cross-reference:** [Spec 080](080-usd-null-and-negated-price-semantics.md) (`$` nulls), [Spec 024](024-index-based-result-protocol.md) (display payload).

## File Organization

| File | Changes |
|------|---------|
| `shared/src/search/sort-fields.ts` | Add `percentileCapable?: boolean` and `invertPercentile?: boolean` to `SortFieldEntry` |
| `shared/src/search/printing-index.ts` | Add `sortedUsdIndices`, `sortedDateIndices` (or generic percentile arrays), built at construction |
| `shared/src/search/card-index.ts` | Add `sortedNameIndices`, `sortedEdhrecIndices` for face-domain, built at construction |
| `shared/src/search/eval-printing.ts` | Add percentile branch in `usd` and `date` cases; detect value via `/^\d+(\.\d+)?%$/` |
| `shared/src/search/eval-leaves.ts` | Add percentile branch in `name` and `edhrec` cases (Spec 096, Spec 099) |
| `shared/src/search/evaluator.ts` | Extend negation path: when child is percentile-capable field with percentile value, use operator inversion (same as Spec 080 for usd) |
| `shared/src/percentile-chip-display.ts` | Card-detail equality percentile labels (Spec 183); see § Card detail |

## Error Handling

- **Invalid percentile value:** `usd>150%`, `usd>abc%` → error: `invalid percentile "150"` (must be 0–100)
- **Percentile on non-capable field:** `mv>50%` → error: `field "mv" does not support percentile queries` (or treat as literal string `"50%"` and let existing logic produce 0 matches / error as appropriate)
- **Null with percentile:** `usd=null` remains Spec 080 behavior; `usd>null` remains error

## Canonicalization

Percentile queries have no Scryfall equivalent. Strip them from Scryfall outlinks (same as `usd=null`).

## Testing (TDD)

1. `usd>90%` returns top 10% of priced printings; nulls excluded.
2. `usd<10%` returns bottom 10%.
3. `usd=90%` returns band 89.5–90.5%; equivalent to `usd>=89.5% usd<90.5%`.
4. `usd=0%` returns bottom 0.5% (edge clamp).
5. `usd=100%` returns top 0.5% (edge clamp).
6. `-usd>90%` equals `usd<=90%`; nulls excluded.
7. `date>90%` returns newest 10%; null dates excluded.
8. `date<10%` returns oldest 10%.
9. Invalid percentile (`usd>150%`) returns error.
10. Decimal percentiles (`usd>99.5%`) work correctly.
11. `name>50%` returns latter half alphabetically (requires Spec 096).
12. `edhrec>90%` returns top 10% most popular; nulls excluded (Spec 099).
13. `edhrec<10%` returns bottom 10% least popular (Spec 099).

## Acceptance Criteria

1. Parser recognizes `<field><operator><number>%` syntax (number may have decimal).
2. Percentile queries successfully evaluate for `usd` and `date` (printing-domain).
3. `usd=90%` yields same results as `usd>=89.5% usd<90.5%`.
4. Edge percentiles `usd=0%` and `usd=100%` clamp correctly.
5. Negated percentile queries (`-usd>90%`) evaluate as opposite operator (`usd<=90%`).
6. Null values are excluded from both the percentile distribution and the result set.
7. Performance remains instant (O(1) bounds on pre-sorted array).
8. The `invertPercentile` flag supports rank-based columns (`edhrec` per Spec 099).
9. `name` percentile support enabled by Spec 096.
10. `edhrec` percentile support enabled by Spec 099.

## Implementation Notes

- 2026-04-06: Added § Card detail — equality percentile chip labels for Spec 183; `shared/src/percentile-chip-display.ts`.
