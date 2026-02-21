# Spec 002: Query Engine

**Status:** Draft

## Goal

Implement the lexer, parser, and evaluator described in ADR-009 inside the `shared` workspace, with comprehensive tests, so that both the frontend WebWorker and a future CLI can parse and execute Scryfall-style queries against the columnar card dataset.

## Background

The ETL pipeline (Spec 001) produces a columnar JSON file with the following per-card columns:

| Column           | Type       | Encoding                                   |
|------------------|------------|---------------------------------------------|
| `names`          | `string[]` | Raw card name                               |
| `mana_costs`     | `string[]` | Raw mana cost string (e.g. `{2}{W}{U}`)    |
| `oracle_texts`   | `string[]` | Raw Oracle text                             |
| `colors`         | `number[]` | Bitmask (ADR-007): W=1, U=2, B=4, R=8, G=16 |
| `color_identity` | `number[]` | Bitmask, same encoding as colors            |
| `type_lines`     | `string[]` | Raw Scryfall type line (e.g. `Legendary Creature — Elf Druid`) |
| `powers`         | `number[]` | Dict-encoded index into `power_lookup`      |
| `toughnesses`    | `number[]` | Dict-encoded index into `toughness_lookup`  |
| `loyalties`      | `number[]` | Dict-encoded index into `loyalty_lookup`    |
| `defenses`       | `number[]` | Dict-encoded index into `defense_lookup`    |
| `legalities_legal` | `number[]` | Bitmask: one bit per format where status is `"legal"` |
| `legalities_banned` | `number[]` | Bitmask: one bit per format where status is `"banned"` |
| `legalities_restricted` | `number[]` | Bitmask: one bit per format where status is `"restricted"` |

The bitmask constants are defined in `shared/src/bits.ts` and shared between ETL (encoding) and the query engine (filtering). Format legality uses 21 bits (one per format: standard, commander, modern, legacy, etc.).

## Architecture Overview

```
raw input → lexer → tokens → parser → AST → evaluator (single-pass scan) → bitwise tree reduction
```

The evaluator takes an AST and a `CardIndex` (evaluation-ready card data) and produces an `EvalResult` tree. Internally, each node is backed by a `Uint8Array` (one byte per card) from a reusable pool. Leaf nodes are populated during a single linear scan. Internal nodes are resolved bottom-up via byte-wise AND, OR, and NOT. The `EvalResult` tree exposes `matchCount` (popcount) per node but does not expose the raw bitmasks.

## Grammar

```
expr      = or_group
or_group  = and_group ("OR" and_group)*
and_group = term (term)*
term      = "-" atom | "!" atom | atom
atom      = "(" expr ")"
          | WORD operator (WORD | QUOTED | REGEX)
          | WORD
          | QUOTED
operator  = ":" | "=" | "!=" | "<" | ">" | "<=" | ">="
```

Precedence, tightest to loosest: parentheses → negation/exact → implicit AND → explicit OR.

Bare words (a `WORD` or `QUOTED` not preceded by a field and operator) are treated as name substring searches. `!` before a word or quoted string is an exact-name match.

## Token Types

The lexer produces a flat array of tokens. Each token has a `type` and a `value` string.

| Token     | Matches                                           | Examples                |
|-----------|---------------------------------------------------|-------------------------|
| `WORD`    | Contiguous non-whitespace, non-special characters  | `lightning`, `c`, `wu`  |
| `QUOTED`  | Content between matching `"` or `'` (stripped)     | `"enters the"`, `'can"t'` |
| `REGEX`   | Content between `/` delimiters (`\/` escapes `/`)  | `/^{T}:/`               |
| `COLON`   | `:`                                                |                         |
| `EQ`      | `=`                                                |                         |
| `NEQ`     | `!=`                                               |                         |
| `LT`      | `<`                                                |                         |
| `GT`      | `>`                                                |                         |
| `LTE`     | `<=`                                               |                         |
| `GTE`     | `>=`                                               |                         |
| `LPAREN`  | `(`                                                |                         |
| `RPAREN`  | `)`                                                |                         |
| `DASH`    | `-` when preceding an atom (not inside a word)     |                         |
| `BANG`    | `!` when not followed by `=` (exact-name prefix)   | `!fire`                 |
| `OR`      | The literal keyword `OR` (case-insensitive)        | `OR`, `or`, `Or`        |
| `EOF`     | End of input                                       |                         |

Multi-character operators (`!=`, `<=`, `>=`) are matched greedily before single-character ones.

Single quotes behave identically to double quotes for `QUOTED` tokens. An apostrophe mid-word (e.g. `can't`) is consumed as part of the word, not as a quote delimiter. Unclosed quotes of either kind consume to end of input (error recovery).

## AST Node Types

```typescript
type ASTNode =
  | AndNode | OrNode | NotNode
  | FieldNode | BareWordNode | ExactNameNode | RegexFieldNode;

interface AndNode {
  type: "AND";
  children: ASTNode[];
}

interface OrNode {
  type: "OR";
  children: ASTNode[];
}

interface NotNode {
  type: "NOT";
  child: ASTNode;
}

interface FieldNode {
  type: "FIELD";
  field: string;
  operator: string;
  value: string;
}

interface BareWordNode {
  type: "BARE";
  value: string;
}

interface ExactNameNode {
  type: "EXACT";
  value: string;
}

interface RegexFieldNode {
  type: "REGEX_FIELD";
  field: string;
  operator: string;
  pattern: string;
}
```

AST types are pure parser output. They carry no runtime or evaluation data.

### Evaluation Result Type

The evaluator produces a separate `EvalResult` tree that mirrors the AST structure:

```typescript
interface EvalResult {
  node: ASTNode;
  matchCount: number;
  children?: EvalResult[];
}
```

`matchCount` is the popcount of the node's internal bitmask. `Uint8Array` bitmasks are pooled internally by the evaluator and not exposed on the result type.

### CardIndex

`ColumnarData` is the wire/storage format (what the ETL writes, what the app fetches). `CardIndex` wraps it with pre-computed evaluation-ready fields:

```typescript
class CardIndex {
  readonly cardCount: number;
  readonly namesLower: string[];       // pre-lowercased for case-insensitive search
  readonly oracleTextsLower: string[];
  readonly subtypesLower: string[];
  // bitmask and dict-encoded columns pass through unchanged
  readonly colors: number[];
  readonly types: number[];
  // ...
  constructor(data: ColumnarData) { /* derive */ }
}
```

## Supported Fields (v1)

These fields map to columns available in the current ETL output.

| Field aliases      | Column(s)                   | `:` semantics                          | Comparison semantics (`=`, `<`, `>`, etc.) |
|--------------------|-----------------------------|----------------------------------------|--------------------------------------------|
| `name`, `n`        | `names`                     | Case-insensitive substring             | Exact match (case-insensitive)             |
| `oracle`, `o`      | `oracle_texts`              | Case-insensitive substring             | —                                          |
| `color`, `c`       | `colors`                    | Card has at least these colors (⊇)     | `=` exact, `<=` subset, `>=` superset      |
| `identity`, `id`   | `color_identity`            | Same as `color`                        | Same as `color`                            |
| `type`, `t`        | `type_lines`                | Case-insensitive substring             | Regex via `/pattern/`                      |
| `power`, `pow`     | `powers` + `power_lookup`   | Numeric equality                       | Numeric comparison via lookup              |
| `toughness`, `tou` | `toughnesses` + `toughness_lookup` | Numeric equality                | Numeric comparison via lookup              |
| `loyalty`, `loy`   | `loyalties` + `loyalty_lookup`   | Numeric equality                  | Numeric comparison via lookup              |
| `defense`, `def`   | `defenses` + `defense_lookup`    | Numeric equality                  | Numeric comparison via lookup              |
| `mana`, `m`        | `mana_costs`                | Substring on raw mana cost string      | —                                          |
| `legal`, `f`, `format` | `legalities_legal`      | Card is legal in the given format      | —                                          |
| `banned`           | `legalities_banned`         | Card is banned in the given format     | —                                          |
| `restricted`       | `legalities_restricted`     | Card is restricted in the given format | —                                          |
| (bare word)        | `names`                     | Case-insensitive substring             | —                                          |

### Color value parsing

Color values are parsed as a sequence of WUBRG letters: `c:wu` → White + Blue bitmask. The `:` operator means "at least these colors" (bitwise: `(card & query) === query`). The `=` operator means "exactly these colors" (bitwise: `card === query`).

### Numeric field matching

Power, toughness, loyalty, and defense are dict-encoded. To evaluate a comparison, resolve the dict index back to its string via the lookup table, attempt numeric parse, and compare. Non-numeric values (`*`, `X`, `1+*`) fail numeric comparisons gracefully (no match).

## Evaluation Pipeline

### 1. Parse

Lex and parse the input string into an AST. This is pure and fast — no card data is touched.

### 2. Allocate

Walk the AST and assign a `Uint8Array` from the buffer pool to each node.

### 3. Scan (single pass)

Iterate over all cards by index (`0..N-1`). For each card, evaluate every leaf node and write `1` or `0` into `leaf.matches[i]`. This is a single linear pass over the columnar arrays.

Within the loop, leaf evaluation uses the field type to select the right column and comparison:
- Bitmask fields: bitwise operations on the column value.
- String fields: case-insensitive `indexOf` on the column value.
- Dict-encoded numeric fields: lookup + numeric comparison.

### 4. Reduce (bottom-up)

Walk the AST bottom-up. For each internal node, combine children byte-by-byte:
- `AND`: `out[i] = a[i] & b[i]` (for each child).
- `OR`: `out[i] = a[i] | b[i]`.
- `NOT`: `out[i] = child[i] ^ 1`.

Process in chunks aligned to 4 or 8 bytes where possible, using `Uint32Array` or `DataView` for throughput. The exact chunking strategy can be tuned during implementation.

### 5. Read results

The root node's `matches` array is the final result. Popcount (sum of all bytes) gives the total match count. Iterating the array yields matching card indices.

Each non-root node's `matches` array and popcount are available for the query debugger UX (ADR-009).

## Buffer Pool

```typescript
class BufferPool {
  private free: Uint8Array[] = [];
  private cardCount: number;

  constructor(cardCount: number) { this.cardCount = cardCount; }
  acquire(): Uint8Array { return this.free.pop() ?? new Uint8Array(this.cardCount); }
  release(buf: Uint8Array): void { buf.fill(0); this.free.push(buf); }
}
```

After evaluation, when the AST is discarded (e.g. user types a new query), all node buffers are released back to the pool. This avoids allocation churn during rapid re-evaluation.

## Error Recovery

The parser must handle incomplete input gracefully, since it runs on every keystroke. Principles:

- **Trailing operator:** `c:` (no value yet) → parse as a `FieldNode` with an empty value. The evaluator treats empty-value field nodes as matching all cards (neutral filter).
- **Unclosed parenthesis:** `(c:wu OR` → implicitly close at EOF. The AST is structurally valid; the UI can indicate the unclosed group.
- **Empty input:** → empty AND node (matches everything).
- **Unknown field:** `x:foo` → parse normally. The evaluator treats unrecognized fields as matching zero cards.

The parser should never throw on user input. Malformed input produces a best-effort AST.

## File Organization

All query engine code lives in `shared/src/`:

```
shared/src/
├── index.ts              (public API re-exports)
├── bits.ts               (existing bitmask constants)
├── data.ts               (ColumnarData interface — wire/storage format)
├── search/
│   ├── ast.ts            (token + AST node + EvalResult type definitions)
│   ├── lexer.ts          (tokenizer)
│   ├── parser.ts         (recursive descent → AST)
│   ├── card-index.ts     (CardIndex — evaluation-ready wrapper)
│   ├── evaluator.ts      (single-pass scan + tree reduction → EvalResult)
│   └── pool.ts           (Uint8Array buffer pool)
```

Tests live alongside in a `__tests__` directory or as `.test.ts` siblings — follow whichever convention the Vitest setup establishes.

## Test Strategy

Tests are written in TypeScript using Vitest (ADR-010). Three layers:

### Lexer tests

Assert that input strings produce expected token arrays.

```typescript
expect(lex("c:wu")).toEqual([
  { type: "WORD", value: "c" },
  { type: "COLON", value: ":" },
  { type: "WORD", value: "wu" },
  { type: "EOF", value: "" },
]);
```

### Parser tests

Assert that token streams produce expected ASTs. Use builder helpers for readability:

```typescript
const cases: [string, ASTNode][] = [
  ["c:wu",             field("c", ":", "wu")],
  ["-c:r",             not(field("c", ":", "r"))],
  ["c:wu OR c:bg",     or(field("c", ":", "wu"), field("c", ":", "bg"))],
  ["c:wu t:creature",  and(field("c", ":", "wu"), field("t", ":", "creature"))],
  ["(c:wu OR c:bg) t:creature",
    and(or(field("c", ":", "wu"), field("c", ":", "bg")), field("t", ":", "creature"))],
];

for (const [input, expected] of cases) {
  test(`parse: ${input}`, () => {
    expect(parse(input)).toEqual(expected);
  });
}
```

### Evaluator tests

Define a synthetic 5–10 card pool as a TypeScript `ColumnarData` constant in the test file. Wrap it in a `CardIndex`. Assert that `evaluate(parse(query), index).matchCount` equals the expected value for each query. Each card in the pool exists to exercise a specific condition (color, type, power, oracle text, etc.).

### Error recovery tests

Assert that partial/malformed inputs produce reasonable ASTs without throwing:

```typescript
test("trailing operator", () => {
  expect(() => parse("c:")).not.toThrow();
});
```

## Acceptance Criteria

1. `parse("c:wu t:creature")` returns an AND node with two FIELD children. The parser never throws on any string input.
2. Given a synthetic 10-card dataset, `evaluate(parse("c:wu"), data)` returns a `Uint8Array` where exactly the white-blue cards are flagged.
3. Internal AST nodes carry correct per-node match counts after evaluation, enabling the query debugger UX.
4. Buffer pool reuse: running `evaluate` twice on different queries allocates no new `Uint8Array` buffers on the second run (assuming equal or fewer AST nodes).
5. All supported fields and operators from the table above are exercised by at least one test case.
6. The lexer + parser together are under 300 lines of code (excluding tests).

## Implementation Notes

- 2026-02-19: Lexer extended beyond original spec during implementation:
  single-quoted strings (matching Scryfall behavior for embedding quotes),
  `BANG` token for `!`-prefixed exact-name search, `REGEX` token for
  `/`-delimited regex patterns, and case-insensitive `OR` keyword matching.
  Grammar and AST types updated above to reflect these additions.
- 2026-02-19: Separated AST types (pure parser output) from evaluation
  results (`EvalResult` tree with `matchCount`). Added `CardIndex` wrapper
  for pre-computed evaluation-ready data, distinct from `ColumnarData`
  wire format. `Uint8Array` bitmasks are internal to the evaluator.
  `ColumnarData` moved to `shared/src/data.ts`.
- 2026-02-19: Added format legality support. Three new bitmask columns
  (`legalities_legal`, `legalities_banned`, `legalities_restricted`) with
  21 bits for Scryfall's supported formats. Evaluator handles `legal:`/`f:`,
  `banned:`, and `restricted:` fields.
- 2026-02-19: Replaced `types`/`supertypes`/`subtypes` bitmask+string columns
  with a single `type_lines` string column storing the raw Scryfall type line.
  Type matching is now pure substring search (case-insensitive), which correctly
  handles partial words (`t:legend`), multi-word matches (`t:"legendary creature"`),
  and cross-category queries. Removed `CardType`, `Supertype`, and their lookup
  tables from `bits.ts` as dead code. Implemented `REGEX_FIELD` evaluation for
  string fields (`name`, `oracle`, `type`) using `RegExp.test()` with case-insensitive
  matching. Invalid regex patterns gracefully match zero cards.
