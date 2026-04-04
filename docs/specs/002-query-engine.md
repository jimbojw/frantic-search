# Spec 002: Query Engine

**Status:** Implemented

**References:** ADR-009 (Bitmask-per-node AST), ADR-017 (Dual-domain evaluation), ADR-022 (Categorical field operators: `:` / `=` / empty / `!=`)

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

**Dual-domain evaluation:** When printing data is loaded (Spec 046), the evaluator also supports printing-domain fields (`set:`, `r:`, `is:foil`, `usd:`, etc.). Queries can combine face-level and printing-level conditions. See Spec 047 and ADR-017 for the dual-domain architecture.

## Grammar

```
expr      = or_group
or_group  = and_group ("OR" and_group)*
and_group = term (term)*
term      = "-" atom | "!" atom | atom
atom      = "(" expr ")"
          | field_clause
          | bare_colon_word
          | standalone_operator
          | WORD
          | QUOTED
          | REGEX
operator  = ":" | "=" | "!=" | "<" | ">" | "<=" | ">="
```

Informally:

- **`field_clause`:** A `WORD` (field name) immediately followed by an `operator` token with **no whitespace between** (`word.end === operator.start` in source spans), then an optional value. A value token (`WORD`, `QUOTED`, or `REGEX`) is consumed only if it is **adjacent** to the operator (`operator.end === value.start`). Otherwise the field has an **empty string** value and the next token stays available for following terms.
- **`bare_colon_word`:** A `COLON` token parsed as a standalone term (not part of a `field_clause`) immediately followed by an adjacent `WORD` merges into one `BARE` atom with value `":" + word.value` (Scryfall-style bare text starting with `:`). `QUOTED` or `REGEX` after a standalone `COLON` are **not** merged; they parse as separate terms (`BARE(":")` then the quoted/regex atom).
- **`standalone_operator`:** Any `operator` token at a position where it does not complete a `field_clause` (e.g. leading `:` or `=` at term start, or after a `WORD` that was **not** adjacent to it) is a valid **term** and parses as `BARE` with `value` equal to the operator lexeme (`":"`, `"="`, `"!="`, …).

Precedence, tightest to loosest: parentheses → negation/exact → implicit AND → explicit OR.

Bare words (a `WORD` or `QUOTED` that is not part of a `field_clause` per the rules above) are treated as name substring searches. `!` before a word or quoted string is an exact-name match — but only when the `!` is at **term-start** (preceded by whitespace or start of input). An exclamation point that immediately follows a character from a bare value or field value is treated as part of that value, not as the exact-name prefix. For example, `a!b` lexes as a single bare word `a!b`; `name:a!b` lexes as a field with value `a!b`.

## Whitespace and field clauses

Whitespace is **not** emitted as a token. The lexer still records each token’s **`start` and `end`** offsets in the original string. **Adjacency** means `previousToken.end === nextToken.start` (no whitespace or other characters between them).

Field syntax matches Scryfall-style tightening: whitespace between the field name and the operator, or between the operator and the value, **breaks** the field clause. Remaining pieces are interpreted as separate terms (bare words, standalone operators, or nested field clauses) so **no tail tokens are silently dropped**.

Normative parse examples (conceptual AST shape):

| Input | Intended structure |
|-------|-------------------|
| `kw:f` | `FIELD("kw", ":", "f")` |
| `kw:` | `FIELD("kw", ":", "")` |
| `kw: otag` | `AND(FIELD("kw", ":", ""), BARE("otag"))` |
| `kw: otag:ramp` | `AND(FIELD("kw", ":", ""), FIELD("otag", ":", "ramp"))` |
| `kw : flying` | `AND(BARE("kw"), BARE(":"), BARE("flying"))` |
| `kw :flying` | `AND(BARE("kw"), BARE(":flying"))` |
| `ci> r` | `AND(FIELD("ci", ">", ""), BARE("r"))` |

**Recovery UX (suggestions):** When users type a space between the operator and the value (as in the table above) and the search returns **zero** results, the app may suggest removing that gap so the clause parses as a single `FIELD` with a non-empty value — see **Spec 177** (`field-value-gap`); grammar and parse rules here are unchanged.

## Token Types

The lexer produces a flat array of tokens. Each token has a `type`, a `value` string, and **`start` / `end`** source offsets. Whitespace is not a token; **adjacency** between tokens is determined from those spans (see § Whitespace and field clauses).

| Token     | Matches                                           | Examples                |
|-----------|---------------------------------------------------|-------------------------|
| `WORD`    | Contiguous non-whitespace, non-special characters. `!` is **not** special when it immediately follows a word character — it is consumed as part of the word. | `lightning`, `c`, `wu`, `a!b` |
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
| `BANG`    | `!` when at term-start (preceded by whitespace or start of input) and not followed by `=` (exact-name prefix) | `!fire`                 |
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
| `name`, `n`        | `combined_names` (see Spec 018) | Substring on **normalized** combined name when the value is an unquoted word; **literal** (lowercased) substring when the value is quoted; `!=` inverts contains | Substring (`:`, `=`, `!=`); lexicographic comparison (`>`, `<`, `>=`, `<=`) |
| `oracle`, `o`      | `oracle_texts`              | Case-insensitive substring             | —                                          |
| `color`, `c`       | `colors`                    | Card has at least these colors (⊇)     | `=` exact, `<=` subset, `>=` superset      |
| `identity`, `id`   | `color_identity`            | Same as `color`                        | Same as `color`                            |
| `type`, `t`        | `type_lines`                | Case-insensitive substring             | Regex via `/pattern/`                      |
| `power`, `pow`     | `powers` + `power_lookup`   | Numeric equality                       | Numeric comparison via lookup              |
| `toughness`, `tou` | `toughnesses` + `toughness_lookup` | Numeric equality                | Numeric comparison via lookup              |
| `loyalty`, `loy`   | `loyalties` + `loyalty_lookup`   | Numeric equality                  | Numeric comparison via lookup              |
| `defense`, `def`   | `defenses` + `defense_lookup`    | Numeric equality                  | Numeric comparison via lookup              |
| `mana`, `m`        | `mana_costs`                | Card has at least these mana symbols (component-wise ≥ on parsed symbol map; see Spec 008) | —                |
| `produces`         | `produces` (bitmask)        | Card produces at least these mana symbols (⊇); supports W,U,B,R,G,C,T + named combos, numeric count, multicolor (Spec 147) | `=` exact, `<=` subset, `>=` superset; `:` aliases `>=`; count-based for numeric/`multicolor` |
| `legal`, `f`, `format` | `legalities_legal` | **Prefix union** (Spec 182): **`:`** ORs format bits for every **`FORMAT_NAMES`** key whose normalized form starts with the query; non-empty no match → **`unknown format`**. **`=`** exact normalized key(s); **`!=`** negates exact **`=`** mask only (Frantic extension). Empty **`:`** / **`=`** / **`!=`** neutral. | **`=`** exact; **`!=`** exact-negation; no `<` / `>` |
| `banned` | `legalities_banned` | Same operator semantics as **`legal:`** on the banned column (Spec 182). | **`=`** exact; **`!=`** exact-negation; no `<` / `>` |
| `restricted` | `legalities_restricted` | Same operator semantics as **`legal:`** on the restricted column (Spec 182). | **`=`** exact; **`!=`** exact-negation; no `<` / `>` |
| `kw`, `keyword`    | `keywords_index`            | **`:`** — normalized prefix over index keys, union face matches; **`=`** — normalized exact match, OR keys that normalize identically (Spec 176, aligned with Spec 182); non-empty no match under active operator → `unknown keyword` (passthrough, Spec 039); empty value matches all faces (Spec 105) | `:` and `=` only (Spec 105) |
| `is`, `not`        | Derived (type line, layout, flags, printing columns — Specs 032, 047) | **Prefix union** over the closed `is:` vocabulary (Spec 032); face and/or printing domain with promotion when needed (Spec 047); non-empty value with no matching keyword → `unknown keyword` (passthrough, Spec 039); empty matches all rows in the leaf’s domain (Spec 032). **`not:`** uses the same keywords as **`is:`** (Spec 002 changelog). | `:` and `=` only |
| `flavor`, `ft`     | `flavor-index` (supplemental) | Flavor text substring; regex via `/pattern/` (printing-domain) | `:` and `=` only (Spec 142) |
| `artist`, `a`      | `artist-index` (supplemental) | Artist name substring (printing-domain) | `:` and `=` only (Spec 149) |
| (bare word)        | `combined_names` (Spec 018) | Unquoted: normalized substring on combined name; quoted: literal lowercased substring | — |

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
3. **Letter-sequence fallback.** Each character is looked up in WUBRG: `c:wu` → White + Blue bitmask. The letter `C` is recognized as colorless in this context. If `C` appears alongside any color letter (W, U, B, R, G), the value is contradictory — no card can be both colored and colorless — and the term is treated as an error (Spec 039).

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
- String fields: generally case-insensitive `indexOf` on the column value; **`name` is special** — unquoted vs quoted substring rules per Spec 018 (normalized combined name vs literal).
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

- **Trailing operator:** When the field name is **adjacent** to the operator (`c:` with no space between) and there is no adjacent value token (end of input or the next token is separated by whitespace), parse as a `FieldNode` with an empty value. The evaluator treats empty-value field nodes as matching all cards (neutral filter) unless a field-specific spec says otherwise.
- **Standalone operators:** Leading or isolated operator tokens (`:`, `=`, `!=`, comparators) must parse as `BARE` terms (or `COLON` + adjacent `WORD` per § Grammar), never as silent `NOP` drops.
- **Unclosed parenthesis:** `(c:wu OR` → implicitly close at EOF. The AST is structurally valid; the UI can indicate the unclosed group.
- **Empty operand:** When `parseAndGroup` finds no term-starting tokens, it produces a `NopNode` instead of an empty AND. This arises from trailing `OR` (`a OR`), leading `OR` (`OR a`), double `OR` (`a OR OR b`), empty parentheses (`()`), and empty input.
- **Unknown field:** `x:foo` → parse normally. The evaluator detects the unknown field and marks the node as an error (Spec 039). Error nodes are skipped in AND/OR reduction, preventing a single malformed term from zeroing out sibling results.
- **Empty exact-name:** `!`, `!'`, `!"`, `!''`, `!""` parse as `EXACT(value="")`. The evaluator treats empty EXACT as an error (Spec 039). Error nodes are skipped in AND/OR.

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

### Whitespace-aware field clauses (parser tests)

Parser tests must cover § Whitespace and field clauses: spaced operator/value (`kw: otag`, `kw: otag:ramp`), spaced name/operator (`kw : flying`, `kw :flying`), comparator spacing (`ci> r`), and regressions with quotes (`name: "a"`), regex (`c:r /x/`), parentheses, `-` negation, and explicit `OR`.

## Acceptance Criteria

1. `parse("c:wu t:creature")` returns an AND node with two FIELD children. The parser never throws on any string input.
2. Given a synthetic dataset with single- and multi-face cards, `evaluate(parse("c:wu"), data)` returns a `Uint8Array` where exactly the white-blue face rows are flagged.
3. Internal AST nodes carry correct per-node match counts after evaluation, enabling the query debugger UX.
4. Buffer pool reuse: running `evaluate` twice on different queries allocates no new `Uint8Array` buffers on the second run (assuming equal or fewer AST nodes).
5. All supported fields and operators from the table above are exercised by at least one test case.
6. ~~The lexer + parser together are under 300 lines of code (excluding tests).~~ **Superseded:** the lexer and parser grew with quoted strings, regex, `OR`, `BANG`, etc.; line count is no longer a hard gate. See Implementation Notes (2026-04-01).
7. For a multi-face card, a query matching only the back face produces a deduplicated result containing the card's primary face index.
8. ~~For a multi-face card, a query with conditions that no single face satisfies (but different faces satisfy different conditions) produces no match.~~ Superseded by Spec 033: cross-face conditions now match at card level.
9. No query string loses trailing tokens because of spaced field syntax; behavior matches § Whitespace and field clauses and the normative examples in that section.
10. Parser tests include the whitespace / field-clause matrix and related edge cases (§ Test Strategy).

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
  tables from `bits.ts` as dead code.   Implemented `REGEX_FIELD` evaluation for
  string fields (`name`, `oracle`, `type`) using `RegExp.test()` with case-insensitive
  matching. Invalid regex patterns are flagged as errors (Spec 039).
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
- 2026-03-02: Mid-value exclamation point (issue #54). Spec updated so that
  `!` is only special (BANG token) when at term-start (preceded by whitespace
  or start of input). When `!` immediately follows a word character, it is
  consumed as part of the WORD. Thus `a!b` lexes as one bare word; `name:a!b`
  lexes as a field with value `a!b`. Implemented: removed `!` from `isSpecial`
  for word accumulation; added `isWordBreak` so `!=` still lexes as NEQ.
- 2026-03-02: Scryfall's undocumented `!`-as-operator. Empirical testing shows
  Scryfall treats `!` between field and value (e.g., `ci!ur`, `mana!bb`) as a
  synonym for `=`. This is not in their syntax guide. We do not support it;
  we follow documented behavior only. See `docs/guides/scryfall-comparison.md`
  § "Scryfall's Undocumented Behavior".
- 2026-03-02: Color/identity number queries (issue #43, Spec 055). The
  `color:`/`identity:` fields now accept numeric values (`ci:2`, `c>=3`,
  etc.) to filter by the number of colors (popcount of the color bitmask).
  Numeric detection (`/^\d+$/`) runs before the existing color-name/letter
  pipeline. The `:` operator means equality for numeric values (matching
  Scryfall). See Spec 055 for full design and test strategy.
- 2026-03-21: Scryfall `not:` convenience field. `not:x` is equivalent to
  `-is:x`; `-not:x` is equivalent to `is:x`. Uses the same keywords as `is:`
  (face-domain and printing-domain). Canonicalizes to `not:` for Scryfall
  outlinks (Scryfall supports both).
- 2026-04-01: Whitespace-aware field clauses (GitHub #240, Scryfall parity).
  Parser uses token span adjacency so whitespace between field name and
  operator or between operator and value does not glue into a single `FIELD`.
  Standalone operator tokens parse as `BARE`; standalone `COLON` adjacent to
  `WORD` merges to `BARE(":" + word)`. Acceptance criterion 6 (line count)
  marked superseded. Grammar, Error Recovery, Test Strategy, and new §
  Whitespace and field clauses document the behavior.
- 2026-04-01: Spec 177 (`field-value-gap` suggestion) documents optional empty-state UX when users type a space between operator and value and get zero results; see § Whitespace and field clauses (**Recovery UX**).
- 2026-04-04: Printing-domain **`set:`** / **`set_type:`** — **`:`** is normalized prefix union, **`=`** is normalized exact match; empty **`=`** is neutral (Specs 047 / 179 / 178). Dual-domain overview unchanged (Spec 047).
