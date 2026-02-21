# Spec 004: Evaluation Cache

**Status:** Draft

## Goal

Replace the ephemeral `BufferPool` allocation strategy with a persistent evaluation cache that maps AST nodes to their computed results. Each unique node is evaluated at most once per `CardIndex` lifetime. Add optional per-node timing so callers can observe where evaluation time is spent and whether a result was served from cache.

## Background

The current evaluator (Spec 002) allocates a `Uint8Array` per AST node from a `BufferPool`, evaluates leaf nodes via linear scan, combines internal nodes bottom-up, and releases all buffers after evaluation. Every keystroke re-evaluates from scratch — even if the user only appended one character and most of the query is unchanged.

As the app layer approaches (ADR-003), two needs emerge:

1. **Performance monitoring.** Understanding where time is spent per node — especially for expensive operations like regex scans — requires instrumented timing. This is a prerequisite for informed optimization.
2. **Cross-query result reuse.** When a user edits `c:wu t:creature` to `c:wu t:elf`, the `c:wu` subtree has already been evaluated. Caching its result avoids redundant work on every keystroke.

Both needs point toward a model where evaluation results are **durable artifacts** associated with AST node identity, not ephemeral buffers discarded after each pass.

## Design

### Node identity (interning)

Two AST nodes are considered identical when they have the same structural content. Leaf identity is determined by the node's type and its fields. Internal node identity is determined by the node's type and the identities of its children.

A `NodeCache` maintains a `Map<string, InternedNode>` keyed by a canonical string derived from the node's structure. Fields within the key are separated by ASCII Record Separator (`\x1E`, U+001E) — a control character that cannot appear in user input, card data, or operator strings, eliminating the need for escaping logic.

```typescript
const SEP = "\x1E"; // ASCII Record Separator
```

| Node type     | Key format                                                    |
|---------------|---------------------------------------------------------------|
| `FIELD`       | `FIELD␞${field}␞${operator}␞${value}`                        |
| `BARE`        | `BARE␞${value}`                                               |
| `EXACT`       | `EXACT␞${value}`                                              |
| `REGEX_FIELD` | `REGEX_FIELD␞${field}␞${operator}␞${pattern}`                |
| `NOT`         | `NOT␞${childKey}`                                             |
| `AND`         | `AND␞${childKey1}␞${childKey2}␞...`                          |
| `OR`          | `OR␞${childKey1}␞${childKey2}␞...`                           |

(The `␞` glyph represents `\x1E` for readability in this document.)

Internal node keys are composed from their children's keys, so structural equality is transitive — an AND node with identical children always resolves to the same interned node, regardless of which parse pass produced it. Children are keyed in parse order, not sorted — `c:wu t:creature` and `t:creature c:wu` produce different AND keys. This is intentional: the parser deterministically orders children, so the same query text always produces the same key, and commutative normalization would add complexity for negligible cache-hit gain.

### Interned node and computed result

```typescript
interface InternedNode {
  key: string;
  ast: ASTNode;
  computed?: ComputedResult;
}

interface ComputedResult {
  buf: Uint8Array;
  matchCount: number;
  productionMs: number;
}
```

`ComputedResult` is attached to an `InternedNode` after its first evaluation. The `buf` is owned by the cache and must never be mutated after creation. `productionMs` is the exclusive wall-clock time for this node's own work — the linear scan for leaf nodes, the byte-wise combination for internal nodes — not including time spent producing children.

### Evaluation with cache

When `evaluate()` is called:

1. **Intern.** Walk the AST bottom-up. For each node, compute its structural key and look up (or create) the `InternedNode` in the cache.
2. **Evaluate.** For each interned node without an attached `ComputedResult`, compute it:
   - **Leaf nodes:** Allocate a new `Uint8Array`, run the linear scan, record `productionMs`.
   - **Internal nodes:** Allocate a new `Uint8Array`, combine children's cached `buf` arrays via byte-wise AND/OR/NOT, record `productionMs`.
   - Attach the `ComputedResult` to the `InternedNode`.
3. **Build query trace.** Walk the interned tree and build a `QueryNodeResult` for each node, recording whether the result was a cache hit and the wall-clock time for this specific evaluation pass (near-zero for cache hits).
4. **Extract matching indices.** Read the root node's cached `buf` to produce the face-level `matchingIndices` array. Deduplication to card-level results via `CardIndex.deduplicateMatches()` remains the caller's responsibility, unchanged from the current `evaluate()` contract.

Because cached buffers are never mutated, internal node combination always reads from stable inputs. There is no acquire/release lifecycle.

### Query-level result types

The evaluation produces two tiers of result:

```typescript
interface QueryNodeResult {
  node: ASTNode;
  matchCount: number;
  cached: boolean;
  productionMs: number;
  evalMs: number;
  children?: QueryNodeResult[];
}

interface EvalOutput {
  result: QueryNodeResult;
  matchingIndices: number[];
}
```

| Field          | Meaning                                                         |
|----------------|-----------------------------------------------------------------|
| `matchCount`   | Popcount of this node's bitmask (same as current `EvalResult`)  |
| `cached`       | `true` if the result was already present before this evaluation |
| `productionMs` | Exclusive wall-clock time for this node's own work when it was first computed (not including children) |
| `evalMs`       | Exclusive wall-clock time for this node's own work in the current evaluation pass (not including children) |

All timings are exclusive: they measure only the node's own work (linear scan for leaves, byte-wise combination for internal nodes), not time spent producing children. For cached nodes, `evalMs` reflects only the cache lookup cost (near-zero). For freshly computed nodes, `evalMs` ≈ `productionMs`. `productionMs` is always the original computation cost, regardless of whether the current pass was a cache hit.

### Timing control

Timing instrumentation uses `performance.now()`. Since timing is integral to the cache design (every `ComputedResult` records `productionMs`), it is always collected — there is no opt-out flag. The overhead of `performance.now()` calls is negligible relative to the evaluation work.

### NodeCache lifetime and scoping

`NodeCache` is scoped to a `CardIndex`. When the card data changes (e.g., data reload), a new `CardIndex` and `NodeCache` are created together. No partial invalidation is needed.

```typescript
class NodeCache {
  private nodes: Map<string, InternedNode> = new Map();

  constructor(readonly index: CardIndex) {}

  intern(ast: ASTNode): InternedNode { /* ... */ }
  evaluate(ast: ASTNode): { result: QueryNodeResult; matchingIndices: number[] } { /* ... */ }
}
```

The `NodeCache` replaces both `BufferPool` and the current standalone `evaluate()` function as the primary evaluation entry point.

### Memory budget

Each cached node holds one `Uint8Array` of `faceCount` bytes (~30KB with the current dataset). Realistic query sessions produce at most a few hundred unique subtrees — well under 10MB. No eviction is needed for the foreseeable future.

If memory pressure becomes a concern later, an LRU eviction strategy can prune cold nodes when a configurable high-water mark is reached. This is deferred — the spec notes the escape hatch but does not implement it.

## Changes to Existing Code

### Removed: `BufferPool` (`shared/src/search/pool.ts`)

The buffer pool is deleted. Its purpose — avoiding allocation churn during rapid re-evaluation — is superseded by the cache, which avoids *re-evaluation entirely* for unchanged subtrees. Buffers are now allocated once per unique node and retained for the cache's lifetime.

### Replaced: `EvalResult` → `QueryNodeResult`

The `EvalResult` interface in `ast.ts` is replaced by `QueryNodeResult`, which adds `cached`, `productionMs`, and `evalMs`. The `node` and `matchCount` fields are preserved. Callers consuming the tree output (CLI `--output tree`) get richer data with no breaking changes to the shape they depend on (`node`, `matchCount`, `children`).

### Changed: `evaluate()` signature

The standalone `evaluate(ast, index)` function is replaced by `NodeCache.evaluate(ast)`. The `CardIndex` is bound at cache construction, not passed per call. Callers (CLI, future WebWorker) construct a `NodeCache` once from a `CardIndex` and call `evaluate()` for each query.

### Updated: `shared/src/search/evaluator.ts`

The `NodeCache` class, `InternedNode`, and `ComputedResult` are added to `evaluator.ts` alongside the existing leaf evaluation functions. The `BufferPool` import, `evalNode`, and the standalone `evaluate()` function are removed. The leaf helpers (`evalLeafField`, `evalLeafRegex`, etc.) remain as private functions — they are now called by `NodeCache` instead of `evalNode`.

### Updated: `shared/src/search/ast.ts`

`EvalResult` and `EvalOutput` are replaced with `QueryNodeResult` and the updated `EvalOutput`. The file remains the home for type definitions used across the query engine.

## File Organization

```
shared/src/search/
├── ast.ts            Token + AST node + QueryNodeResult type definitions
├── lexer.ts          (unchanged)
├── parser.ts         (unchanged)
├── card-index.ts     (unchanged)
├── evaluator.ts      NodeCache + leaf/internal evaluation logic
└── pool.ts           (deleted)
```

Caching is a feature of the evaluator, not a separate module. `NodeCache`, `InternedNode`, and `ComputedResult` live in `evaluator.ts` alongside the leaf evaluation functions (`evalLeafField`, `evalLeafRegex`, etc.), which remain private helpers. The scan logic doesn't change — only its lifecycle management.

## Test Strategy

### Cache hit/miss tests

Evaluate a query, then evaluate a query sharing a subtree. Assert the shared subtree's `QueryNodeResult` has `cached: true` on the second evaluation.

```typescript
test("shared subtree is cached", () => {
  const cache = new NodeCache(index);
  cache.evaluate(parse("c:wu t:creature"));
  const { result } = cache.evaluate(parse("c:wu t:elf"));
  // The c:wu child of the AND should be cached
  const cwu = result.children!.find(
    c => c.node.type === "FIELD" && c.node.field === "c"
  );
  expect(cwu!.cached).toBe(true);
});
```

### Timing tests

Assert that `productionMs` and `evalMs` are non-negative numbers. Assert that `evalMs` for a cached node is less than `productionMs` for that node (since cache lookup is cheaper than computation).

### Match count equivalence

Assert that `NodeCache.evaluate()` produces identical `matchCount` and `matchingIndices` to the current `evaluate()` for a suite of queries. This ensures the cache doesn't alter correctness.

### Interning identity tests

Assert that two separately parsed ASTs with the same structure resolve to the same `InternedNode` (same `key`, same object reference from the cache).

### Node key uniqueness tests

Assert that structurally different nodes produce different keys. Cover edge cases like empty values, identical prefixes across different node types, and nodes whose fields form ambiguous concatenations (e.g., field `"ab"` + value `"cd"` vs. field `"a"` + value `"bcd"` must produce different keys).

## Acceptance Criteria

1. `NodeCache.evaluate(parse("c:wu"))` returns a `QueryNodeResult` with correct `matchCount`, `cached: false`, and positive `productionMs` on first call.
2. A second call to `NodeCache.evaluate()` with a query sharing a subtree returns `cached: true` and near-zero `evalMs` for the shared node.
3. Match counts and matching indices are identical to the current `evaluate()` implementation for all existing evaluator tests.
4. `BufferPool` and `pool.ts` are removed. No buffer acquire/release lifecycle exists.
5. The CLI `search --output tree` command produces output that includes `cached`, `productionMs`, and `evalMs` per node.
6. Node keys use ASCII Record Separator (`\x1E`) as the delimiter. Keys are unique for structurally different nodes and stable for structurally identical nodes, including edge cases like empty values and deeply nested trees.
7. Constructing a new `NodeCache` with a new `CardIndex` does not share any state with a previous cache instance.
8. An integration test calls `NodeCache.evaluate()` twice with overlapping queries (e.g., `c:r t:creature` then `c:r t:elf`). The shared leaf (`c:r`) has `cached: true` on the second call; the new leaf (`t:elf`) has `cached: false`.
