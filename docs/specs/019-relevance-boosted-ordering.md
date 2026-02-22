# Spec 019: Relevance-Boosted Default Ordering

**Status:** Implemented

## Goal

Boost name-prefix matches to the top of search results while preserving the seeded-random "frantic" ordering as a tiebreaker. When a user types `light`, cards whose names start with "light" (like Lightning Bolt) should appear before cards that merely contain it (like Twilight Shepherd), without sacrificing the discovery-oriented personality of the app.

## Background

Spec 011 introduced deterministic random ordering via a seeded Fisher-Yates shuffle. The seed is derived from the literal query string (including whitespace), so the same query always produces the same card order, but the order is unpredictable — giving the app its "frantic" character. Using the raw query (rather than a normalized AST key) allows users to tap space at the end to shuffle results without changing the filter.

This works well for filter-oriented queries (`t:creature c:red`) where no single result is more "expected" than another. But for the common use case of finding a card by name — the user types `light` and expects Lightning Bolt near the top — pure random ordering buries prefix matches among the ~323 cards containing "light" anywhere in their name.

### The tension

Stronger relevance ranking (prefix match, then match position, then string length) improves findability but reduces discovery. The design in this spec intentionally stops at one relevance signal — prefix match — to keep the secondary ordering random. Future signals can be layered in if the UX warrants it.

### Relationship to other specs

- **Spec 011 (Deterministic Random Ordering):** Superseded by this spec. The seeded-random concept survives as the secondary sort criterion.
- **Spec 010 (Sort Directives):** Explicit `order:` directives override the default ordering entirely. When `order:` is present, neither the prefix boost nor the seeded random apply.
- **Spec 018 (Combined Name Search):** The prefix check should use the same name column that bare-word evaluation uses. Today that is `namesLower`; after Spec 018, unquoted bare words match against `combinedNamesNormalized`. The prefix check must follow suit (see § Name column selection).

## Design

### Replacing Fisher-Yates with a keyed hash sort

Fisher-Yates produces a permutation but assigns no per-element sort key, making it impossible to compose with other ranking criteria. This spec replaces it with a comparison sort whose secondary criterion is a keyed integer hash — a deterministic function `f(seed, cardIndex) → uint32` that produces a pseudorandom number for each card.

The keyed hash preserves all stability properties of the Fisher-Yates shuffle (same seed → same order) while enabling a primary sort tier for relevance.

### Keyed hash function

The hash mixes the query seed (a 32-bit FNV-1a hash of the literal query string) with the card's face index using an integer finalizer:

```typescript
function seededRank(seedHash: number, index: number): number {
  let h = seedHash ^ index;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
```

This is a standard multiply-shift integer mixer (same family as splitmix and murmurhash finalizers). It produces 32-bit unsigned integers with good avalanche properties — flipping any input bit affects roughly half the output bits.

The existing `fnv1a` function is reused for seed derivation. `mulberry32` is no longer needed.

### Bare-word extraction from the AST

To determine which cards get a prefix boost, the sort needs to know what name-related terms the user typed. A walk of the AST collects all `BARE` node values that are not under a `NOT`:

```typescript
function collectBareWords(ast: ASTNode): string[] {
  switch (ast.type) {
    case "BARE": return [ast.value];
    case "AND":
    case "OR":   return ast.children.flatMap(collectBareWords);
    case "NOT":  return [];   // negated terms are exclusions, not search intent
    default:     return [];   // FIELD, EXACT, REGEX_FIELD don't signal name search
  }
}
```

| Query | AST structure | Extracted terms | Boost behavior |
|---|---|---|---|
| `light` | `BARE("light")` | `["light"]` | startsWith "light" |
| `light t:creature` | `AND(BARE, FIELD)` | `["light"]` | startsWith "light" |
| `light bolt` | `AND(BARE, BARE)` | `["light", "bolt"]` | startsWith either |
| `light OR bolt` | `OR(BARE, BARE)` | `["light", "bolt"]` | startsWith either |
| `-light t:creature` | `AND(NOT(BARE), FIELD)` | `[]` | pure seeded random |
| `t:creature c:red` | `AND(FIELD, FIELD)` | `[]` | pure seeded random |

When the extracted list is empty (no bare words, or only negated ones), the sort degrades gracefully to pure seeded random — identical to Spec 011 behavior.

### Quoted bare words

After Spec 018, `BareWordNode` gains a `quoted` boolean. Both quoted and unquoted bare words participate in the prefix boost. A user typing `"lightning bolt"` as a quoted bare word is still signaling name-finding intent. The only difference is which name column the evaluator checks for *matching* (Spec 018 § Evaluator changes); the prefix *boost* applies equally.

### Name column selection

The starts-with check must use the same representation that the evaluator uses for bare-word matching:

| State | Unquoted bare word | Quoted bare word |
|---|---|---|
| Pre-Spec 018 | `namesLower[i].startsWith(valLower)` | Same |
| Post-Spec 018 | `combinedNamesNormalized[i].startsWith(normalizedVal)` | `combinedNamesLower[i].startsWith(valLower)` |

This ensures consistency: a card boosted by the prefix check is always one that *also* matches the evaluator's filter.

### Ranking tiers

Each matching card is assigned to a tier based on its name:

| Tier | Criterion | Meaning |
|---|---|---|
| 0 | Name starts with any extracted bare word | Prefix match — user likely looking for this card |
| 1 | Name contains the bare word but doesn't start with it | Substring match — still relevant, but less expected |

Within each tier, cards are ordered by their keyed hash value (`seededRank`). Since the hash is deterministic for a given (seed, card) pair, this produces a stable pseudorandom ordering within each tier.

### Sort implementation

```typescript
function seededSort(
  indices: number[],
  seed: string,
  nameColumn: string[],
  bareWords: string[],
): void {
  const seedHash = fnv1a(seed);

  // Pre-compute tiers and ranks to avoid redundant work in comparator
  const tier = new Uint8Array(indices.length);
  const rank = new Uint32Array(indices.length);

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const name = nameColumn[idx];
    tier[i] = bareWords.length > 0 &&
      bareWords.some(w => name.startsWith(w)) ? 0 : 1;
    rank[i] = seededRank(seedHash, idx);
  }

  // Sort using pre-computed parallel arrays (index into `indices`)
  const order = Array.from({ length: indices.length }, (_, i) => i);
  order.sort((a, b) => {
    if (tier[a] !== tier[b]) return tier[a] - tier[b];
    return rank[a] - rank[b];
  });

  // Apply permutation in-place
  const sorted = order.map(i => indices[i]);
  for (let i = 0; i < indices.length; i++) indices[i] = sorted[i];
}
```

Pre-computing `tier` and `rank` into parallel arrays avoids re-hashing and re-checking startsWith on every comparison. The sort's comparator becomes two integer subtractions.

### Integration point

The sort replaces `seededShuffle` in the worker pipeline:

```
AST → evaluate → matchingIndices → deduplicate → seededSort(deduped, seed, names, bareWords) → map to CardResult[]
```

The worker extracts bare words from the AST before sorting and passes the literal query string as the seed (so trailing whitespace changes the order — enabling tap-to-shuffle):

```typescript
const bareWords = collectBareWords(ast).map(w => w.toLowerCase());
seededSort(deduped, msg.query, index.namesLower, bareWords);
```

### Interaction with Spec 010 (Sort Directives)

When `ParseResult.sort` contains one or more directives, the worker applies `sortResults()` (Spec 010) instead of `seededSort()`. Explicit sort always wins. `order:random` can be added as a Spec 010 extension to re-apply pure seeded-random ordering without the prefix boost.

## File layout

```
shared/src/search/
├── shuffle.ts          → renamed to ordering.ts
├── shuffle.test.ts     → renamed to ordering.test.ts
```

`ordering.ts` exports:
- `fnv1a(str)` — unchanged, now also used directly by callers for seed derivation
- `seededRank(seedHash, index)` — new keyed hash function
- `collectBareWords(ast)` — new AST walk
- `seededSort(indices, seed, nameColumn, bareWords)` — new sort function

`seededShuffle` and `mulberry32` are removed.

## Performance

For n = 30,000 cards (typical result set for broad queries):

| Step | Cost |
|---|---|
| Hash pre-computation | O(n) — ~30K integer ops |
| Tier pre-computation | O(n × k) — k = number of bare words (typically 1–2) |
| Comparison sort | O(n log n) — ~450K comparisons, each is two integer subtractions |
| Total | < 5ms on modern hardware |

The previous Fisher-Yates shuffle was O(n) ≈ 30K ops. The new sort is O(n log n) but with small constants. For n = 30K, the practical difference is a few milliseconds — well within the per-keystroke budget.

## Stability properties

| User action | Behavior |
|---|---|
| Same query typed twice | Identical result order |
| Backspace (restoring previous query) | Previous result order restored |
| Different query | Different result order |
| Same filters, different whitespace | Different order (seed is literal query; tap space to shuffle) |
| Same filters, different parenthesization that simplifies to same AST | Same order |
| Query with bare word vs. same query without | Prefix matches cluster at top; within-tier order differs (different seed) |

## Future extensions

These signals could be added as additional sort tiers between the prefix tier and the seeded-random tiebreaker. Each one improves findability at the cost of reducing discovery. They are explicitly out of scope for this spec.

- **Match position:** `name.indexOf(query)` — earlier matches rank higher.
- **String length:** Shorter names rank higher (more specific match).
- **Popularity:** Commonly played/searched cards first (requires external data not currently in `ColumnarData`).

## Test strategy

### Unit tests (`ordering.test.ts`)

**`seededRank`:**
1. **Determinism**: Same `(seedHash, index)` always produces the same value.
2. **Seed sensitivity**: Different seeds produce different values for the same index.
3. **Index sensitivity**: Same seed produces different values for different indices.
4. **Distribution**: For 1000 indices with a fixed seed, values span a wide range (basic uniformity).

**`collectBareWords`:**
1. Single bare word: `BARE("bolt")` → `["bolt"]`.
2. Bare word + field: `AND(BARE("bolt"), FIELD("t","creature"))` → `["bolt"]`.
3. Multiple bare words: `AND(BARE("light"), BARE("bolt"))` → `["light", "bolt"]`.
4. Negated bare word: `NOT(BARE("bolt"))` → `[]`.
5. Mixed: `AND(NOT(BARE("fire")), BARE("bolt"))` → `["bolt"]`.
6. No bare words: `AND(FIELD("t","creature"), FIELD("c","red"))` → `[]`.
7. OR of bare words: `OR(BARE("light"), BARE("bolt"))` → `["light", "bolt"]`.

**`seededSort`:**
1. **Prefix boost**: Given names `["Lightning Bolt", "Twilight Shepherd", "Lightmine Field"]` and bare word `"light"`, the two names starting with "light" appear before "Twilight Shepherd".
2. **Within-tier determinism**: Same seed produces same ordering within each tier.
3. **Seed sensitivity**: Different seeds produce different within-tier orderings.
4. **No bare words**: Behaves identically to a pure seeded-random sort (no tier 0 cards).
5. **All prefix matches**: When every card starts with the bare word, order is pure seeded random.
6. **Empty input**: Empty array returns empty.
7. **Completeness**: Output contains exactly the same elements as input.

### Migration test

Verify that `seededShuffle` is no longer called anywhere in the codebase (grep for removed export).

## Acceptance criteria

1. For the query `light` against a dataset containing "Lightning Bolt" and "Twilight Shepherd", "Lightning Bolt" appears before "Twilight Shepherd" in the result order.
2. For the query `t:creature c:red` (no bare words), results are in deterministic seeded-random order — same behavior as Spec 011.
3. Same query typed twice produces identical result order.
4. Different queries produce visibly different orderings.
5. The sort adds negligible overhead (< 10ms for 30K elements).
6. `seededShuffle` and `mulberry32` are removed. `fnv1a` is retained.
7. No changes to the parser, evaluator, AST types, or worker protocol.
8. All existing tests continue to pass (with `seededShuffle` references updated).
9. When Spec 010 sort directives are present, they override the default ordering entirely.
