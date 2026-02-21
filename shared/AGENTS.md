# shared/ — Agent Instructions

This workspace contains the query engine, bitmask constants, and shared types used by all other workspaces. It is the most algorithmically dense part of the codebase.

## TDD Is Mandatory Here

All parsers, evaluators, and data transformations must be developed test-first. Write a failing test, then write the implementation. See the root `AGENTS.md` for test commands.

```
npm test -w shared                              # run all tests
npm test -w shared -- -t "some pattern"         # run matching tests
npm test -w shared -- src/search/lexer.test.ts  # run single file
npx vitest --watch --dir shared                 # watch mode
```

## Architecture

The query engine uses a **bitmask-per-node AST** (ADR-009). Key properties:

- A hand-rolled recursive descent parser produces an AST from Scryfall-style query strings.
- The evaluator performs a single linear scan over all cards, populating a `Uint8Array` (one byte per card) at each leaf node.
- Internal nodes are resolved bottom-up via byte-wise AND, OR, and NOT.
- Each node carries a `matchCount` (popcount), enabling a query debugger UX where every term shows how many cards it matches.
- `Uint8Array` buffers are pooled to avoid GC pressure during rapid re-evaluation.

Read **ADR-009** for the full rationale and alternatives considered. Read **Spec 002** (`docs/specs/002-query-engine.md`) for the grammar, supported fields, evaluation pipeline, and acceptance criteria.

## File Layout

```
shared/src/
├── index.ts              Public API re-exports
├── bits.ts               Bitmask constants (colors, legalities, etc.)
├── data.ts               ColumnarData interface (wire/storage format)
└── search/
    ├── ast.ts            Token + AST node + EvalResult type definitions
    ├── lexer.ts          Tokenizer
    ├── parser.ts         Recursive descent parser → AST
    ├── card-index.ts     CardIndex — evaluation-ready wrapper around ColumnarData
    ├── evaluator.ts      Single-pass scan + tree reduction → EvalResult
    └── pool.ts           Uint8Array buffer pool
```

Tests are `.test.ts` siblings of their source files (e.g., `lexer.test.ts`).

## Key Design Constraints

- **AST types are pure parser output.** They carry no runtime or evaluation data. The evaluator produces a separate `EvalResult` tree.
- **`ColumnarData` is the wire format.** `CardIndex` wraps it with pre-computed fields (lowercased strings, etc.) for evaluation. Don't conflate the two.
- **`bits.ts` is the single source of truth** for bitmask definitions. Both ETL (encoding) and the query engine (filtering) depend on it. Changing a bit position is a breaking change.
- **The parser never throws.** Malformed input produces a best-effort AST. See Spec 002 § "Error Recovery" for the rules.
