# Spec 011: Deterministic Random Ordering

**Status:** Draft

## Goal

Shuffle search results into a pseudorandom order that is stable for a given query. The same query always produces the same card ordering, but different queries produce visually distinct orderings. This gives the app its "frantic" character while remaining predictable enough that pressing backspace restores the previous result order.

## Background

Without explicit sorting, results appear in their natural column order (the order faces were emitted by the ETL pipeline). This order is arbitrary — typically alphabetical by Scryfall's bulk export — and gives the app no personality.

A truly random shuffle (`Math.random()`) would re-randomize on every keystroke, making it impossible to visually track cards as the user types. A **seeded** pseudorandom shuffle solves this: the seed is derived from the query's AST, so the same filter expression always produces the same permutation.

### Relationship to Spec 010 (Sort Directives)

This spec implements the default ordering behavior independent of Spec 010. When Spec 010 lands, explicit `order:` directives will replace the default random shuffle. `order:random` can be added as an explicit token that re-applies this behavior, giving users a way to opt back in after overriding.

## Design

### Seed derivation

The evaluator's `nodeKey()` function (in `shared/src/search/evaluator.ts`) already produces a unique string encoding of any AST node, including all its children. The root node's key is a stable, deterministic fingerprint of the entire filter expression.

This key is hashed to a 32-bit integer using FNV-1a, producing the PRNG seed.

### PRNG

Mulberry32 — a 32-bit seeded PRNG with good statistical properties and minimal code (~4 lines). It produces a `() => number` function that returns values in `[0, 1)`, suitable as a drop-in replacement for `Math.random()`.

### Shuffle algorithm

Fisher-Yates (Knuth) shuffle using the seeded PRNG. Operates in-place on the deduplicated index array in the worker. O(n) time, O(1) extra space.

### Integration point

The shuffle is applied in the worker between `deduplicateMatches()` and building `CardResult[]`:

```
AST → evaluate → matchingIndices → deduplicate → shuffle(deduped, seed) → map to CardResult[]
```

No parser changes, no protocol changes, no type changes. The shuffle is invisible to the main thread — it just sees `CardResult[]` in a different order.

## File layout

```
shared/src/search/
└── shuffle.ts          # fnv1a, mulberry32, seededShuffle
└── shuffle.test.ts     # tests
```

The `seededShuffle` function is exported from `shared/src/index.ts` and `nodeKey` is also re-exported so the worker can derive the seed.

## API

```typescript
/**
 * In-place Fisher-Yates shuffle seeded by the given string.
 * Same seed always produces the same permutation.
 */
function seededShuffle<T>(array: T[], seed: string): T[];
```

The function accepts the seed as a string (the node key) rather than a pre-hashed number, keeping the API simple for callers. Hashing is internal.

## Stability properties

| User action | Behavior |
|---|---|
| Same query typed twice | Identical result order |
| Backspace (restoring previous query) | Previous result order restored |
| Different query | Different result order |
| Same filters, different whitespace | Same order (AST is whitespace-invariant) |
| Same filters, different parenthesization that simplifies to same AST | Same order |

## Test strategy

### Unit tests (`shuffle.test.ts`)

1. **Determinism**: `seededShuffle([...arr], seed)` called twice with the same seed produces the same output.
2. **Seed sensitivity**: Different seeds produce different permutations (for non-trivial arrays).
3. **Completeness**: Output contains exactly the same elements as input (no duplicates, no losses).
4. **Single element / empty**: Edge cases return input unchanged.
5. **Distribution**: For a moderately sized array, verify that the first element isn't always the same across many different seeds (basic uniformity check).

### No integration tests needed

The worker change is a single function call. Correctness of the shuffle is verified by unit tests; correctness of the integration is verified by the existing worker message flow.

## Acceptance criteria

1. Given the same query string, results arrive in the same order across evaluations.
2. Different query strings produce visibly different orderings.
3. The shuffle adds negligible overhead (< 1ms for 30k elements).
4. No changes to the parser, evaluator, AST types, or worker protocol.
5. All existing tests continue to pass.
