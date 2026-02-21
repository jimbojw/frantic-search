# Spec 010: Sort Directives

**Status:** Draft

## Goal

Allow users to control result ordering by writing `order:field` tokens directly in the query string. Sort directives are extracted during parsing and applied after evaluation — they do not participate in the filter AST or affect which cards match.

## Background

Frantic Search currently returns results in their natural column order (the order faces appear in the ETL output). There is no way to sort results by name, mana value, power, or any other field.

Scryfall separates sort from query via URL parameters (`order=`, `dir=`). Since Frantic Search uses a single search box as its only input (no URL parameters, no separate UI controls), embedding sort directives in the query string makes the search box the single source of truth for the entire result set.

### Precedents

| System | Syntax | Sort placement |
|---|---|---|
| SQL | `ORDER BY field ASC` | Separate clause after `WHERE` |
| GitHub search | `sort:stars-desc` | Inline token in query |
| Jira JQL | `ORDER BY created DESC` | Suffix after filter expression |
| Elasticsearch | `"sort": [...]` | Separate top-level key |
| Scryfall | `order=name&dir=asc` | URL parameters |

This spec follows the **GitHub search** model: `order:field` and `order:field-desc` tokens appear inline with filter terms and are syntactically indistinguishable from field filters at the lexer level, but the parser recognizes and extracts them.

## Syntax

```
order:name
order:color
order:cmc-desc
order:power-asc
```

### Grammar

Sort directives reuse the existing `FIELD` parse rule (`WORD COLON WORD`). The parser identifies a field node as a sort directive when the field name is `order` (case-insensitive).

The value has the form `field` or `field-asc` or `field-desc`:

```
sort_value = sort_field ("-" direction)?
sort_field = "name" | "color" | "type" | "cmc" | "power" | "toughness"
           | "loyalty" | "defense"
direction  = "asc" | "desc"
```

When no direction suffix is given, the default is **ascending** (matching SQL convention and user expectation for alphabetical sorts).

### Multiple sort keys

Multiple `order:` tokens establish a compound sort. Keys are applied left-to-right: the first `order:` token is the primary sort, the second breaks ties, etc.

```
order:color order:cmc-desc t:creature
```

This sorts matching creatures by color ascending, then by mana value descending within each color group.

### Position independence

Sort directives may appear anywhere in the query — beginning, end, or interspersed with filters. Position relative to filter terms does not affect semantics. Only the relative order among `order:` tokens matters.

```
t:creature order:power-desc c:green    # equivalent to:
c:green t:creature order:power-desc    # same filter, same sort
```

## Sortable Fields

| Field name | Aliases | Data source | Sort behavior |
|---|---|---|---|
| `name` | — | `names` | Alphabetical (locale-insensitive, case-insensitive) |
| `color` | `c` | `colors` bitmask | By popcount (number of colors), then bitmask value for stability |
| `type` | `t` | `type_lines` | Alphabetical |
| `cmc` | `mv`, `manavalue` | Derived from `mana_costs` | Numeric (parsed total mana value) |
| `power` | `pow` | `powers` + `power_lookup` | Numeric (non-numeric values like `*` sort last) |
| `toughness` | `tou` | `toughnesses` + `toughness_lookup` | Numeric (non-numeric values sort last) |
| `loyalty` | `loy` | `loyalties` + `loyalty_lookup` | Numeric (non-numeric values sort last) |
| `defense` | `def` | `defenses` + `defense_lookup` | Numeric (non-numeric values sort last) |

### Fields not yet sortable

- `oracle` — Text length or alphabetical sort on oracle text has limited utility.
- `identity` — Could be added (same approach as `color`).
- `legal`/`banned`/`restricted` — Legality is per-format; unclear what "sort by legality" means across formats.
- `rarity`, `set`, `price`, `date` — Not yet present in `ColumnarData`. Can be added in future ETL/spec work.

### CMC / Mana Value

The `cmc` field requires deriving a numeric mana value from the `mana_costs` string. This is a new derived field — it does not currently exist in `ColumnarData` or `CardIndex`. `CardIndex` should pre-compute a `cmc: number[]` array at construction time by summing the parsed mana symbols for each face.

For sorting purposes, faces with empty mana costs (e.g., back faces of transform cards, lands) have CMC 0.

## Architecture

### Parse output

The `parse()` function's return type changes from `ASTNode` to a `ParseResult` that separates filter AST from sort directives:

```typescript
interface SortDirective {
  field: string;       // canonical field name (e.g., "name", "cmc")
  direction: 'asc' | 'desc';
}

interface ParseResult {
  ast: ASTNode;
  sort: SortDirective[];
}
```

The parser recognizes `order:value` field nodes, parses the value into a `SortDirective`, and excludes them from the AST. Unrecognized sort fields (e.g., `order:foo`) are silently ignored (empty sort — no error).

### Why not in the AST?

Sort directives are fundamentally different from filter predicates:

1. **No bitmask.** They don't reduce the result set. A sort node would have no `Uint8Array`.
2. **No match count.** The query breakdown UX ("each term shows how many cards it matches") doesn't apply.
3. **No boolean composition.** `order:name OR order:cmc` is meaningless. Sort directives don't participate in AND/OR/NOT.
4. **Post-filter operation.** Sorting is applied to `matchingIndices` after evaluation, not during the bitmask scan.

Keeping them out of the AST avoids polluting the evaluator, cache, breakdown UI, and every other AST consumer with a node type that violates their assumptions.

### Evaluation pipeline (updated)

```
input → lexer → tokens → parser → ParseResult { ast, sort }
                                       │           │
                                       ▼           │
                              evaluator (unchanged) │
                                       │           │
                                       ▼           │
                              matchingIndices       │
                                       │           │
                                       ▼           ▼
                              deduplicateMatches + sort
                                       │
                                       ▼
                              sorted CardResult[]
```

Sorting happens in the worker after deduplication, before building `CardResult[]` objects. The worker receives `ParseResult` from the parser, evaluates the `ast` as before, then applies `sort` to the deduplicated indices.

### Sort implementation

Sorting operates on deduplicated face indices (primary face per card). For each `SortDirective`, a comparator reads the appropriate column value for each index and compares:

```typescript
function sortResults(
  indices: number[],
  sort: SortDirective[],
  index: CardIndex,
): number[] {
  if (sort.length === 0) return indices;

  const sorted = indices.slice();
  sorted.sort((a, b) => {
    for (const { field, direction } of sort) {
      const cmp = compareField(a, b, field, index);
      if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}
```

### Interaction with the breakdown UI

Sort directives should not appear in the query breakdown tree (they have no match count). However, the UI may optionally display them separately — e.g., "Sorted by: name, cmc descending" — in a future enhancement. This spec does not prescribe breakdown UI changes.

### Interaction with the evaluation cache

Sort directives do not affect caching. The `NodeCache` operates on the filter AST, which is unaffected by sort. Two queries with the same filters but different sort orders will share cached evaluation results.

## Error Handling

- **Unknown sort field** (`order:foo`): Silently ignored. No error, no effect on sort order.
- **Trailing `order:`** (no value): Ignored, consistent with existing trailing-operator error recovery (empty value field nodes match all cards; empty sort directives are no-ops).
- **Duplicate fields** (`order:name order:name-desc`): Both are kept. The second is redundant but harmless — the first comparison always resolves ties before the second is consulted. (Alternatively, last-wins could be implemented, but keeping all is simpler and matches left-to-right semantics.)

## Test Strategy

### Parser tests

Assert that `order:` tokens are extracted into `sort` and excluded from the AST:

```typescript
test("order:name is extracted as sort directive", () => {
  const result = parse("t:creature order:name");
  expect(result.ast).toEqual(field("t", ":", "creature"));
  expect(result.sort).toEqual([{ field: "name", direction: "asc" }]);
});

test("order:cmc-desc parses direction", () => {
  const result = parse("order:cmc-desc t:creature");
  expect(result.sort).toEqual([{ field: "cmc", direction: "desc" }]);
});

test("multiple order tokens preserve left-to-right order", () => {
  const result = parse("order:color order:cmc-desc");
  expect(result.sort).toEqual([
    { field: "color", direction: "asc" },
    { field: "cmc", direction: "desc" },
  ]);
});

test("unknown sort field is ignored", () => {
  const result = parse("order:foo t:creature");
  expect(result.sort).toEqual([]);
});
```

### Sort tests

Using a synthetic card pool, assert sort correctness:

```typescript
test("order:name sorts alphabetically", ...);
test("order:power-desc puts highest power first", ...);
test("non-numeric power sorts last", ...);
test("compound sort: order:color order:cmc-desc", ...);
test("no order directive preserves original order", ...);
```

### Integration tests

End-to-end through the worker message flow, asserting that `CardResult[]` arrives in sorted order.

## Acceptance Criteria

1. `parse("t:creature order:name")` returns a `ParseResult` with a single-node filter AST and `sort: [{ field: "name", direction: "asc" }]`.
2. `order:` tokens do not appear in the filter AST or the query breakdown.
3. Multiple `order:` tokens are applied left-to-right as compound sort keys.
4. Default direction is ascending. `-desc` and `-asc` suffixes are recognized.
5. Unknown sort fields are silently ignored.
6. The evaluation cache is unaffected by sort directives — identical filters with different sorts share cached bitmasks.
7. Non-numeric values in numeric sort fields (e.g., `*` power) sort after all numeric values.
8. Results with no `order:` directive maintain current behavior (natural column order).
9. `cmc` sort field correctly derives mana value from `mana_costs`.
