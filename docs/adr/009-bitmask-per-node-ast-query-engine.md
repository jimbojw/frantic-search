# ADR-009: Bitmask-Per-Node AST Query Engine

**Status:** Accepted

## Context

Frantic Search needs to evaluate Scryfall-style queries against the full card pool (~30,000 cards) at typing speed on mobile devices. The query language supports field-qualified filters (`legal:commander`, `m:rr`), boolean combinators (implicit AND, explicit OR, negation with `-`), parenthesized grouping, and various comparison operators.

Beyond returning matching cards, we want a **query debugger UX**: each term in the query independently reports how many cards it matches, so users can immediately see which filter is responsible when a complex query returns zero results. Users should also be able to tap any node in the query breakdown to see aggregate statistics (mana value histograms, color pie charts, type distributions) for that subset.

Card data is already encoded with bitfields for color, type, supertype, and similar categorical attributes (see ADR-007).

## Decision

Implement a **bitmask-per-node AST architecture**: a hand-rolled recursive descent parser produces an AST where each node owns a `Uint8Array` (one byte per card). Evaluation is a single linear pass over the card pool, followed by bottom-up bitwise reduction (AND, OR, NOT) through the tree.

The AST serves simultaneously as:

- **Execution plan.** The tree structure defines evaluation order. No separate query planner exists.
- **Query debugger.** Each node carries a match count (popcount of its array), displayed to the user as a filter decomposition.
- **Interactive data explorer.** Any node's bitmask is a complete, ready-to-iterate materialized view of a card subset, making on-demand aggregation trivial.

## Alternatives Considered

### SQLite compiled to WASM

Translate the AST into SQL, let SQLite handle indexing and query planning.

Rejected because the dataset is small enough that linear scan is fast, and SQLite cannot natively provide per-term match counts without issuing separate queries for each filter. The bitmask approach gives us the query debugger UX as a natural byproduct of execution. SQLite/WASM also adds ~800KB+ to the bundle for a problem that doesn't require it.

### Client-side search libraries (Lunr.js, MiniSearch, Orama)

Use an existing in-browser search engine with inverted indices and faceted filtering.

Rejected because these libraries are optimized for full-text search, not structured field queries with boolean combinators. Adapting them to support Scryfall's query syntax would require as much glue code as building the evaluator directly. They also don't expose per-filter-node match counts.

### Parser generator (Peggy, Chevrotain, Nearley)

Generate the parser from a grammar definition rather than hand-rolling.

Rejected because the grammar is small (five production rules). A hand-rolled recursive descent parser gives full control over error recovery for partial input during live typing, without adding a build step or runtime dependency.

### Inverted indices with set intersection

Precompute indices mapping field values to card sets, resolve queries via set intersection/union.

Rejected because the overhead of maintaining indices is not justified when a single linear pass over 30k cards with bitfield comparisons completes well within the 16ms frame budget. Inverted indices would help at significantly larger scale, but at this size they add complexity without meaningful performance gain.

## Consequences

- **Positive:** Single-pass evaluation produces all per-node match counts simultaneously, enabling the query debugger UX with zero additional cost.
- **Positive:** The AST is the only data structure — parser, executor, UI, and explorer all operate on the same tree.
- **Positive:** Pooled `Uint8Array` allocation avoids GC pressure during rapid re-evaluation as the user types.
- **Positive:** No external dependencies for parsing, indexing, or query execution.
- **Negative:** Every evaluation is a full linear scan. Acceptable at 30k cards but would not scale to significantly larger datasets without adding indices.
- **Negative:** Hand-rolled parser requires manual maintenance as the query language evolves. Grammar changes are code changes, not config changes. Error recovery for partial input is also our responsibility.
- **Negative:** Per-node `Uint8Array` allocation means memory usage scales with AST depth × card count. For realistic queries (under ~20 nodes) this is well under 1MB.
