# Spec 002: Query Engine

**Status:** Implemented

## Goal

Implement the lexer, parser, and evaluator described in ADR-009 inside the `shared` workspace, with comprehensive tests, so that both the frontend WebWorker and a future CLI can parse and execute Scryfall-style queries against the columnar card dataset.

## Background

The ETL pipeline (Spec 001) produces a columnar JSON file. Each row represents a **card face**, not a card. Single-face cards (layout `normal`, `saga`, `class`, etc.) have one row. Multi-face cards (layouts `transform`, `modal_dfc`, `adventure`, `split`, `flip`) have one row per face. Non-searchable layouts (`art_series`, `token`, `double_faced_token`, `emblem`, `planar`, `scheme`, `vanguard`, `augment`, `host`) are filtered out during ETL processing.

### Per-face columns

| Column           | Type       | Encoding                                   |
|------------------|------------|---------------------------------------------|
| `names`          | `string[]` | Face name (e.g. `"Ayara, Widow of the Realm"`, not the joined `"Front // Back"`) |
| `mana_costs`     | `string[]` | Face mana cost string (e.g. `{2}{W}{U}`)   |
| `oracle_texts`   | `string[]` | Face Oracle text                            |
| `colors`         | `number[]` | Face colors bitmask (ADR-007): W=1, U=2, B=4, R=8, G=16 |
| `color_identity` | `number[]` | Card-level color identity bitmask, duplicated across all faces of the same card |
| `type_lines`     | `string[]` | Face type line (e.g. `Legendary Creature — Elf Noble`) |
| `powers`         | `number[]` | Dict-encoded index into `power_lookup`      |
| `toughnesses`    | `number[]` | Dict-encoded index into `toughness_lookup`  |
| `loyalties`      | `number[]` | Dict-encoded index into `loyalty_lookup`    |
| `defenses`       | `number[]` | Dict-encoded index into `defense_lookup`    |
| `legalities_legal` | `number[]` | Bitmask: one bit per format where status is `"legal"` (card-level, duplicated) |
| `legalities_banned` | `number[]` | Bitmask: one bit per format where status is `"banned"` (card-level, duplicated) |
| `legalities_restricted` | `number[]` | Bitmask: one bit per format where status is `"restricted"` (card-level, duplicated) |

### Metadata columns

| Column           | Type       | Purpose                                    |
|------------------|------------|--------------------------------------------|
| `card_index`     | `number[]` | Position of this face's card in the original `oracle-cards.json` array. Enables mapping back to the full Scryfall card object. |
| `canonical_face` | `number[]` | Face-row index of this card's primary (front) face. For single-face cards and front faces, equals the row's own index. For back/secondary faces, points to the front face's row. Used for deduplication. |

The bitmask constants are defined in `shared/src/bits.ts` and shared between ETL (encoding) and the query engine (filtering). Format legality uses 21 bits (one per format: standard, commander, modern, legacy, etc.).

### Face-per-row rationale

Scryfall evaluates all query conditions against each face independently. A card matches when at least one face satisfies the entire query expression. For example, given a transform DFC with front face 3/3 and back face 4/4, the query `power>=4 toughness<=2` matches neither face (no single face satisfies both conditions), so the card does not match. This per-face semantics requires the data model to store face-level values for searchable fields. Card-level properties (legalities, color identity) are duplicated across faces since they apply uniformly. See ADR-012 for the full decision record.

## Architecture Overview

```
raw input → lexer → tokens → parser → AST → evaluator (single-pass scan) → bitwise tree reduction
```

The evaluator takes an AST and a `CardIndex` (evaluation-ready card data) and produces an `EvalResult` tree. Internally, each node is backed by a `Uint8Array` (one byte per face row) from a reusable pool. Leaf nodes are populated during a single linear scan over face rows. Internal nodes are resolved bottom-up via byte-wise AND, OR, and NOT. The `EvalResult` tree exposes `matchCount` (popcount) per node but does not expose the raw bitmasks.

After evaluation, a deduplication step collapses face-level matching indices into card-level results using the `canonical_face` column: if any face of a card matches, the card's primary face index is included in the result set exactly once.

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
  | AndNode | OrNode | NotNode | NopNode
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

interface NopNode {
  type: "NOP";
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

`NopNode` is the identity element for its parent operation. It is produced by the parser when an operand position is empty (e.g., trailing `OR`, leading `OR`, empty parentheses). See § Error Recovery for details.

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
  readonly faceCount: number;
  readonly namesLower: string[];       // pre-lowercased for case-insensitive search
  readonly oracleTextsLower: string[];
  readonly typeLinesLower: string[];
  // bitmask and dict-encoded columns pass through unchanged
  readonly colors: number[];
  readonly colorIdentity: number[];
  // ... other columns ...
  // metadata for deduplication
  readonly cardIndex: number[];
  readonly canonicalFace: number[];

  constructor(data: ColumnarData) { /* derive */ }

  /** Collapse face-level match indices to one per card (primary face index). */
  deduplicateMatches(faceIndices: number[]): number[] { /* ... */ }
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
| `mana`, `m`        | `mana_costs`                | Card has at least these mana symbols (component-wise ≥ on parsed symbol map; see Spec 008) | —                |
| `legal`, `f`, `format` | `legalities_legal`      | Card is legal in the given format      | —                                          |
| `banned`           | `legalities_banned`         | Card is banned in the given format     | —                                          |
| `restricted`       | `legalities_restricted`     | Card is restricted in the given format | —                                          |
| (bare word)        | `names`                     | Case-insensitive substring             | —                                          |

### Color value parsing

Color values are resolved in order:

1. **Named lookup.** If the entire value matches a named color entry (case-insensitive), use its bitmask. Named entries include:
   - Full color names: `white` (W), `blue` (U), `black` (B), `red` (R), `green` (G).
   - Guild names (2-color): `azorius` (WU), `dimir` (UB), `rakdos` (BR), `gruul` (RG), `selesnya` (GW), `orzhov` (WB), `izzet` (UR), `golgari` (BG), `boros` (RW), `simic` (GU).
   - Shard names (3-color): `bant` (GWU), `esper` (WUB), `grixis` (UBR), `jund` (BRG), `naya` (RGW).
   - Wedge names (3-color): `abzan` (WBG), `jeskai` (URW), `sultai` (BGU), `mardu` (RWB), `temur` (GUR).
   - Strixhaven college names (2-color, aliases for guilds): `silverquill` (WB), `prismari` (UR), `witherbloom` (BG), `lorehold` (RW), `quandrix` (GU).
   - Four-color nicknames: `chaos` (UBRG), `aggression` (WBRG), `altruism` (WURG), `growth` (WUBG), `artifice` (WUBR).
2. **Special predicates.** Two values change _how_ the comparison works rather than supplying a bitmask:
   - `colorless` (alias `c`): matches cards with exactly zero color bits. When used with `:`, `=`, `<=`, it means "has no colors" (`mask === 0`). With `>`, `>=`, `!=` it inverts accordingly.
   - `multicolor` (alias `m`): matches cards with two or more color bits (`popcount(mask) >= 2`). Comparison operators are not meaningful; only `:` is supported (other operators match nothing).
3. **Letter-sequence fallback.** Each character is looked up in WUBRG: `c:wu` → White + Blue bitmask.

The `:` operator means "at least these colors" for `color:` (bitwise superset: `(card & query) === query`) and "fits in a deck of these colors" for `identity:` (bitwise subset: `(card & ~query) === 0`). The `=` operator means "exactly these colors" (`card === query`).

### Numeric field matching

Power, toughness, loyalty, and defense are dict-encoded. To evaluate a comparison, resolve the dict index to a numeric value via a pre-computed numeric lookup array on `CardIndex`. Variable and special stat strings (`*`, `1+*`, `X`, `?`, `∞`) are converted to numbers at index construction time — see Spec 034 for the full conversion rules. Faces with no stat (empty string in the dictionary) map to `NaN` and are excluded from all comparisons.

## Evaluation Pipeline

### 1. Parse

Lex and parse the input string into an AST. This is pure and fast — no card data is touched.

### 2. Allocate

Walk the AST and assign a `Uint8Array` from the buffer pool to each node.

### 3. Scan (single pass)

Iterate over all face rows by index (`0..N-1`). For each face, evaluate every leaf node and write `1` or `0` into `leaf.matches[i]`. This is a single linear pass over the columnar arrays.

Within the loop, leaf evaluation uses the field type to select the right column and comparison:
- Bitmask fields: bitwise operations on the column value.
- String fields: case-insensitive `indexOf` on the column value.
- Dict-encoded numeric fields: lookup + numeric comparison.

### 4. Reduce (bottom-up)

Walk the AST bottom-up. For each internal node, combine children byte-by-byte:
- `AND`: `out[i] = a[i] & b[i]` (for each child). NOP children are skipped.
- `OR`: `out[i] = a[i] | b[i]`. NOP children are skipped.
- `NOT`: `out[i] = child[i] ^ 1`.
- `NOP`: No buffer allocated. See § Error Recovery for full semantics.

Process in chunks aligned to 4 or 8 bytes where possible, using `Uint32Array` or `DataView` for throughput. The exact chunking strategy can be tuned during implementation.

### 5. Read results

The root node's `matches` array is the final result. Popcount (sum of all bytes) gives the total face-level match count. Iterating the array yields matching face-row indices.

### 6. Deduplicate

Collapse the face-level matching indices into card-level results using `CardIndex.deduplicateMatches()`. For each matching face index, look up `canonical_face[i]` and collect unique values. The result is a list of primary face indices, one per matching card. Callers use these indices to look up card names (`names[i]`), or map through `card_index[i]` to retrieve full card objects from the raw Scryfall data.

Each non-root node's `matches` array and popcount are available for the query debugger UX (ADR-009). Note that `matchCount` at each node reflects face-level matches, not deduplicated card counts.

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
- **Empty operand:** When `parseAndGroup` finds no term-starting tokens, it produces a `NopNode` instead of an empty AND. This arises from trailing `OR` (`a OR`), leading `OR` (`OR a`), double `OR` (`a OR OR b`), empty parentheses (`()`), and empty input.
- **Unknown field:** `x:foo` → parse normally. The evaluator treats unrecognized fields as matching zero cards.

The parser should never throw on user input. Malformed input produces a best-effort AST.

### NOP node semantics

`NOP` is the identity element for its parent operation. During the evaluator's combining step (§ Reduce), NOP children are skipped:

- **Child of AND:** Skipped. `a AND NOP` evaluates to `a`. (AND identity = true.)
- **Child of OR:** Skipped. `a OR NOP` evaluates to `a`. (OR identity = false.)
- **Root-level NOP:** Matches nothing (0 results). This only occurs for truly empty input, which the app short-circuits before reaching the evaluator.

After skipping NOP children, if an AND or OR node has only one remaining child, it collapses to that child's result. If all children are NOP, AND matches everything (vacuous conjunction) and OR matches nothing (vacuous disjunction).

This fixes the bug where `a OR` previously produced an empty AND as the right operand. The empty AND matched all cards, causing `a OR <everything>` to return the entire card pool. With NOP, `a OR NOP` correctly evaluates to just `a`.

### NOP in the query breakdown

The breakdown tree includes NOP nodes so the user can see that their query has an unfinished operand. NOP nodes are displayed with the label `(no-op)` and a match count of `--` (not a number) to signal that the node contributes nothing to the result. This gives the user a visible indication that their query is incomplete without silently altering the query structure.

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

Define a synthetic card pool as a TypeScript `ColumnarData` constant in the test file. Wrap it in a `CardIndex`. Assert that `evaluate(parse(query), index).matchCount` equals the expected value for each query. Each card in the pool exists to exercise a specific condition (color, type, power, oracle text, etc.).

The synthetic pool must include at least one multi-face card (two face rows sharing a `canonical_face`) to verify:
- A query matching only the back face still produces a card-level match after deduplication.
- A query whose conditions span faces (e.g. front face power and back face toughness, where no single face satisfies both) produces no match.
- When both faces match, deduplication produces exactly one result.

### Error recovery tests

Assert that partial/malformed inputs produce reasonable ASTs without throwing:

```typescript
test("trailing operator", () => {
  expect(() => parse("c:")).not.toThrow();
});
```

## Acceptance Criteria

1. `parse("c:wu t:creature")` returns an AND node with two FIELD children. The parser never throws on any string input.
2. Given a synthetic dataset with single- and multi-face cards, `evaluate(parse("c:wu"), data)` returns a `Uint8Array` where exactly the white-blue face rows are flagged.
3. Internal AST nodes carry correct per-node match counts after evaluation, enabling the query debugger UX.
4. Buffer pool reuse: running `evaluate` twice on different queries allocates no new `Uint8Array` buffers on the second run (assuming equal or fewer AST nodes).
5. All supported fields and operators from the table above are exercised by at least one test case.
6. The lexer + parser together are under 300 lines of code (excluding tests).
7. For a multi-face card, a query matching only the back face produces a deduplicated result containing the card's primary face index.
8. ~~For a multi-face card, a query with conditions that no single face satisfies (but different faces satisfy different conditions) produces no match.~~ Superseded by Spec 033: cross-face conditions now match at card level.

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
- 2026-02-20: Switched from card-per-row to face-per-row data model (ADR-012).
  Multi-face cards (transform, modal_dfc, adventure, split, flip) now emit one
  row per face. This fixes missing data for ~500 DFCs whose `oracle_text`,
  `mana_cost`, `power`, `colors`, etc. only existed on `card_faces` in the
  Scryfall bulk data. Non-searchable layouts (art_series, tokens, emblems, etc.)
  are now filtered out during ETL processing. Added `card_index` and
  `canonical_face` metadata columns for mapping back to raw card objects and
  deduplicating face-level results to card-level results. The evaluator core
  is unchanged — it operates on face rows identically to how it previously
  operated on card rows. Deduplication is a post-evaluation step on `CardIndex`.
  Background, column table, CardIndex, evaluation pipeline, test strategy, and
  acceptance criteria sections updated above to reflect the new model.
- 2026-02-20: Replaced substring-based mana cost matching with structured
  symbol-map comparison (Spec 008). Mana costs are parsed into
  `Record<string, number>` symbol maps; the `:` operator performs a
  component-wise ≥ check. Bare shorthand (`m:rr`, `m:2rr`) and mixed forms
  (`m:r{r}`, `m:{r}r`) now work correctly, matching Scryfall's behavior.
  `CardIndex` pre-computes mana symbol maps at construction time.
- 2026-02-23: Card-level evaluation semantics (Spec 033). The original
  description of Scryfall's per-face evaluation was incorrect — empirically,
  Scryfall promotes each leaf condition to card level (any face matches →
  card matches) then combines with AND/OR/NOT. Leaf evaluators now write to
  `buf[canonicalFace[i]]` instead of `buf[i]`, ensuring only canonical face
  slots carry data. `matchCount` reflects card count, not face count.
  `deduplicateMatches` removed. `evaluate()` returns a pre-allocated
  `Uint32Array` of canonical face indices. Acceptance criterion 8 struck.
- 2026-02-25: NOP node implementation. Parser now emits `NopNode` instead
  of empty AND (`{ type: "AND", children: [] }`) when an operand position
  is empty (trailing OR, leading OR, double OR, empty parentheses, empty
  input, dangling dash). In the evaluator, NOP children are skipped during
  AND/OR reduction. After skipping: single remaining child collapses; all-NOP
  AND matches everything (vacuous conjunction); all-NOP OR matches nothing.
  Root-level NOP produces zero indices. NOP uses `matchCount: -1` as a
  sentinel; the UI displays `--`. This fixes the bug where `a OR` returned
  the entire card pool because the empty AND right operand matched all cards.
