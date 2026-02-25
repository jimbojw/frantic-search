# Spec 036: Source Spans

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 021 (Inline Query Breakdown), Spec 023 (Breakdown Remove Node)

## Goal

Add byte-offset source spans to tokens and AST nodes so that UI controls can perform precise, in-place modifications to a query string — replacing a term's value, removing a term, or inserting a term — without disturbing the surrounding text.

## Background

### The problem

Today, the UI has two ways to manipulate query strings:

1. **Append** — `appendQuery(term)` concatenates a new term to the end of the query string. Used by the TERMS drawer chips and the RESULTS histogram bars.
2. **Reconstruct** — `reconstructQuery(node)` and `reconstructWithout(root, exclude)` in `InlineBreakdown.tsx` rebuild a query string from the `BreakdownNode` tree. Used by drill-down (click a node to isolate it) and remove (click × to exclude a node).

Neither approach supports **in-place editing** of a specific term. Reconstruction collapses whitespace (extra spaces between terms become single spaces), and append always pushes to the end, changing the visual order of terms. Casing and field aliases are preserved through reconstruction, but the whitespace changes are enough to be disorienting.

### Motivating use case

Interactive controls that are **two-way bound** to a specific AST node need to modify that node's value in place. For example, a color identity checkbox row (proposed for the TERMS drawer) would:

- **Read** the first `ci:` / `identity:` FIELD node's value from the breakdown to derive checkbox state.
- **Write** an updated value back into the query string at the exact position of that node's value token — without moving or reformatting any other part of the query.

Consider the query `f:commander (ci:w OR ci:c) t:creature`. The first `ci:` node (DFS) is `ci:w`. If the user toggles Red on, the query should become `f:commander (ci:wr OR ci:c) t:creature` — only the `w` is replaced with `wr`, everything else is byte-for-byte identical.

This requires knowing that the value `w` occupies bytes 17–18 in the input string.

### Why reconstruction is insufficient

Reconstruction (`reconstructQuery`) normalizes whitespace — multiple spaces collapse to one, and the structure is serialized with uniform single-space joins:

| Original query | Reconstructed |
|---|---|
| `f:commander  (ci:w OR ci:c)  t:creature` | `f:commander (ci:w OR ci:c) t:creature` |
| `CI:WU  t:creature` | `CI:WU t:creature` |

The semantic result is identical, but the visual shift is disorienting — the cursor position in the text input moves unpredictably, and the user loses their sense of "where things are" in the query. In-place editing avoids this entirely.

### Industry precedent

Source spans (also called source locations or source ranges) are a standard feature of production parsers. TypeScript, Babel, Rust's `syn`, tree-sitter, and ESLint's Espree all track byte offsets or line:column positions on every token and AST node. This enables precise code transformations (refactoring, auto-fix, codemods) that modify specific ranges without disturbing surrounding text.

## Design

### 1. Token spans

Add `start` and `end` fields to the `Token` interface. These are byte offsets into the original input string, forming a half-open interval `[start, end)`.

```typescript
export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}
```

The lexer already tracks a `pos` variable and computes `start` locally for word and quoted tokens. The change is to persist these values on every emitted token.

**Invariant:** For every token, `input.slice(token.start, token.end)` equals the original source text that produced the token (including delimiters like quotes and regex slashes for QUOTED and REGEX tokens, respectively).

The `value` field continues to hold the _content_ (e.g., without surrounding quotes for QUOTED tokens), while `start`/`end` span the full source text including delimiters. This distinction matters for replacement: splicing at `[start, end)` replaces the entire syntactic unit.

Examples for `"hello world"` (a quoted token starting at byte 5):
- `start: 5`, `end: 18` (covers `"hello world"` including both quotes)
- `value: "hello world"` (content without quotes)

Examples for `ci` (a word token starting at byte 0):
- `start: 0`, `end: 2`
- `value: "ci"`

### 2. AST node spans

Add an optional `span` field to each AST node interface. The span covers the full source range of the syntactic construct the node represents.

```typescript
export interface Span {
  start: number;
  end: number;
}
```

Each AST node type gains an optional `span?: Span` field:

```typescript
export interface FieldNode {
  type: "FIELD";
  field: string;
  operator: string;
  value: string;
  span?: Span;
}
```

The span is optional because **synthetic nodes have no source position**. The parser desugars a bare regex `/giant/` into `OR(name:/giant/, type:/giant/, oracle:/giant/)` — three `REGEX_FIELD` nodes and an `OR` node that never existed in the input string. These nodes carry no span because there is no byte range to point to.

A future refactor could move regex expansion from the parser to the evaluator, making every parser node correspond to source text and allowing spans to be required. That refactor is out of scope here (see § Out of Scope).

#### What each node's span covers

| Node type | Span covers | Example input | Span text |
|---|---|---|---|
| `FIELD` | field token through value token | `ci:wub` | `ci:wub` |
| `BARE` (unquoted) | the word token | `goblin` | `goblin` |
| `BARE` (quoted) | opening quote through closing quote | `"goblin"` | `"goblin"` |
| `EXACT` | `!` through value token | `!"Lightning Bolt"` | `!"Lightning Bolt"` |
| `REGEX_FIELD` | field token through closing `/` | `name:/giant/` | `name:/giant/` |
| `NOT` | `-` token through child's span end | `-ci:r` | `-ci:r` |
| `AND` | first child's span start through last child's span end | `a b c` | `a b c` |
| `OR` | first child's span start through last child's span end | `a OR b` | `a OR b` |

**Compound node spans include interior whitespace and `OR` keywords** but exclude surrounding parentheses when the parens are used for grouping. The parenthesized expression `(a OR b)` has the same OR node span as `a OR b` — the parser discards the parens as grouping syntax. This matches how other parsers handle parenthesized expressions (the parens are not part of the AST).

#### FieldNode value span

For the motivating use case (modifying a field's value in place), the FieldNode needs access to the value token's span specifically — not just the overall node span. Add a `valueSpan` field:

```typescript
export interface FieldNode {
  type: "FIELD";
  field: string;
  operator: string;
  value: string;
  span?: Span;
  valueSpan?: Span;
}
```

This enables precise value-only replacement. For `ci:wub` where the node span is `[0, 6)`:
- `span` = `{ start: 0, end: 6 }` — covers `ci:wub`
- `valueSpan` = `{ start: 3, end: 6 }` — covers just `wub`

When the UI toggles Red on, it splices at `valueSpan`: `query.slice(0, 3) + "wubr" + query.slice(6)` → `ci:wubr`.

### 3. BreakdownNode spans

Extend `BreakdownNode` in the worker protocol to carry spans through to the main thread:

```typescript
export type BreakdownNode = {
  type: 'AND' | 'OR' | 'NOT' | 'FIELD' | 'BARE' | 'EXACT' | 'REGEX_FIELD'
  label: string
  matchCount: number
  children?: BreakdownNode[]
  span?: { start: number; end: number }
  valueSpan?: { start: number; end: number }
}
```

The `toBreakdown` function in `worker.ts` copies spans from the `QueryNodeResult`'s underlying AST nodes. Synthetic nodes (bare regex expansion) have no span and the fields remain undefined.

### 4. Query splice utility

A utility function for performing span-based edits on a query string:

```typescript
function spliceQuery(
  query: string,
  span: { start: number; end: number },
  replacement: string,
): string {
  return query.slice(0, span.start) + replacement + query.slice(span.end);
}
```

This lives in the app (not shared) since it is a UI concern. It is intentionally simple — a single splice. The caller is responsible for computing the correct `replacement` string.

### 5. Node removal with spans

Spec 023's `reconstructWithout` currently rebuilds the entire query from the breakdown tree. With spans, removal can be more precise:

1. **Target node has a span** — splice it out. But this leaves behind dangling `OR` keywords and excess whitespace.
2. **Parent node has a span** — reconstruct only the parent subtree (using the existing `reconstructQuery` on the modified children), then splice the reconstruction into the original query at the parent's span.

Approach 2 is the practical choice. It preserves everything outside the affected subtree verbatim, and only the immediately affected parent is reconstructed. For example:

- Query: `f:commander (ci:w OR ci:c) t:creature`
- Remove `ci:w` from the OR node.
- The OR node's span covers `ci:w OR ci:c` (the content inside the parens).
- Reconstruct the OR with one child removed → `ci:c`.
- Splice at the OR's span → `f:commander (ci:c) t:creature`.

Everything outside the OR subtree — `f:commander (`, `) t:creature` — is preserved byte-for-byte.

**When the parent has no span** (synthetic nodes), fall back to the current `reconstructWithout` behavior. This is the same as today and only affects edge cases like bare regex expansion.

### 6. What does NOT change

- **Evaluator.** The evaluator reads AST node fields (`field`, `operator`, `value`) and never inspects spans. No changes.
- **Node cache / interning.** `nodeKey()` does not include spans (two structurally identical nodes at different positions should share a cache entry). No changes.
- **Existing tests.** All existing lexer and parser tests use `toEqual`, which fails when the actual object has properties absent from the expected object. Adding `start`/`end` to tokens and `span`/`valueSpan` to AST nodes would break these assertions. To preserve them without rewriting every expected value, switch existing assertions from `toEqual` to `toMatchObject` (which allows extra properties on the actual value). New span-specific tests are added separately and use `toEqual` to assert exact span values.

## Scope of Changes

| File | Change |
|---|---|
| `shared/src/search/ast.ts` | Add `start`/`end` to `Token`; add `Span` type; add optional `span` to all AST node interfaces; add optional `valueSpan` to `FieldNode` |
| `shared/src/search/lexer.ts` | Track and emit `start`/`end` on every token |
| `shared/src/search/lexer.test.ts` | Switch existing assertions from `toEqual` to `toMatchObject`; add tests verifying token spans |
| `shared/src/search/parser.ts` | Compute and set `span` (and `valueSpan` for FIELD nodes) on AST nodes using consumed token positions |
| `shared/src/search/parser.test.ts` | Switch existing assertions from `toEqual` to `toMatchObject`; add tests verifying AST node spans |
| `shared/src/worker-protocol.ts` | Add optional `span` and `valueSpan` to `BreakdownNode` |
| `shared/src/index.ts` | Re-export `Span` type |
| `app/src/worker.ts` | Copy spans from AST nodes through `toBreakdown` |

## Test Strategy

### Lexer span tests

Verify token spans for a representative set of inputs:

| Input | Token | Expected `start` | Expected `end` |
|---|---|---|---|
| `ci:wub` | `WORD("ci")` | 0 | 2 |
| `ci:wub` | `COLON` | 2 | 3 |
| `ci:wub` | `WORD("wub")` | 3 | 6 |
| `"hello world"` | `QUOTED("hello world")` | 0 | 13 |
| `a  b` | `WORD("a")` | 0 | 1 |
| `a  b` | `WORD("b")` | 3 | 4 |
| `/giant/` | `REGEX("giant")` | 0 | 7 |
| `pow>=3` | `WORD("pow")` | 0 | 3 |
| `pow>=3` | `GTE(">=")` | 3 | 5 |
| `pow>=3` | `WORD("3")` | 5 | 6 |
| `ci:wub` | `EOF` | 6 | 6 |
| (empty) | `EOF` | 0 | 0 |

### Parser span tests

Verify AST node spans:

| Input | Node | Expected span |
|---|---|---|
| `ci:wub` | `FIELD(ci, :, wub)` | `{ start: 0, end: 6 }` |
| `ci:wub` | valueSpan | `{ start: 3, end: 6 }` |
| `-ci:r` | `NOT` | `{ start: 0, end: 5 }` |
| `a b c` | `AND` | `{ start: 0, end: 5 }` |
| `a OR b` | `OR` | `{ start: 0, end: 6 }` |
| `goblin` | `BARE("goblin")` | `{ start: 0, end: 6 }` |
| `!"Lightning Bolt"` | `EXACT` | `{ start: 0, end: 18 }` |
| `(a OR b) c` | `AND` | `{ start: 1, end: 10 }` |
| `(a OR b) c` | inner `OR` | `{ start: 1, end: 7 }` |

### Round-trip splice tests

Verify that splicing at a node's span produces correct output:

| Original | Target node | Replacement | Expected result |
|---|---|---|---|
| `ci:w t:creature` | `ci:w` valueSpan | `wr` | `ci:wr t:creature` |
| `f:edh ci:wub` | `ci:wub` valueSpan | `c` | `f:edh ci:c` |
| `f:edh ci:w` | `ci:w` full span | `` (empty) | `f:edh ` (trailing space is acceptable) |

### Backward compatibility

Vitest's `toEqual` fails when the actual object has properties not present in the expected object. Since tokens now carry `start`/`end` and AST nodes carry `span`/`valueSpan`, existing assertions would break. To preserve existing tests without rewriting every expected value, switch their assertions from `toEqual` to `toMatchObject` (which allows extra properties on the actual value). This is a mechanical find-and-replace. After the switch, all existing tests continue to verify the same structural properties they always did.

## Edge Cases

### Empty value (dangling operator)

`ci:` (field with no value) — the parser consumes the `ci` WORD token and the `:` COLON token, then finds no WORD/QUOTED/REGEX token to consume as a value. It falls through and produces `{ type: "FIELD", field: "ci", operator: ":", value: "" }`.

The canonical approach in production parsers for a "missing token" is a **zero-width span at the insertion point**. TypeScript's parser does exactly this — when an expected token is absent, it gets a zero-width position at the byte where it would have appeared. The zero-width span makes splice operations work uniformly: `spliceQuery(query, { start: 3, end: 3 }, "wub")` is an insertion at byte 3, producing `ci:wub`. No special-case branching in the caller.

The position is the byte immediately after the operator token's end (`op.end`): `valueSpan = { start: op.end, end: op.end }`. This is correct whether the dangling operator is at the end of input (`ci:`) or followed by whitespace and more terms (`ci: t:creature`) — in both cases, inserting at `op.end` produces `ci:wub` or `ci:wub t:creature` respectively.

### EOF token

The EOF token carries a zero-width span at the end of input: `{ start: input.length, end: input.length }`. The invariant holds because `input.slice(n, n) === ""` matches the EOF token's empty `value`.

### Unclosed delimiters

For unclosed quotes (`"hello`) and unclosed regex (`/partial`), the lexer consumes to the end of input without finding a closing delimiter. The token's span starts at the opening delimiter and ends at `input.length`. The invariant still holds — `input.slice(token.start, token.end)` reproduces the source text as written (opening delimiter, content, no closing delimiter). For example, `"hello` (6 characters) produces a QUOTED token with `start: 0, end: 6`, and `input.slice(0, 6) === '"hello'`.

### Bare regex expansion

`/giant/` is desugared by the parser into `OR(name:/giant/, type:/giant/, oracle:/giant/)`. The outer OR and inner REGEX_FIELD children are synthetic — they have no source positions. These nodes carry no span. UI code must handle `span === undefined` gracefully (fall back to reconstruction).

### Trailing whitespace after removal

Removing a node by splicing its span may leave double spaces or leading/trailing whitespace. The splice utility does not normalize whitespace — callers can `.trim()` the result or apply minimal cleanup (e.g., collapse runs of spaces). This is acceptable because the parser and evaluator are whitespace-insensitive, and the user can see the raw query string.

### Parenthesized expressions

The parser discards parentheses during parsing — they are grouping syntax, not AST nodes. An inner expression's span starts after the `(` and ends before the `)`. This means splicing at an OR node's span inside `(a OR b)` replaces only `a OR b`, leaving the parens intact: `(replacement)`.

When removal collapses a two-child OR to a single child, the result is `(surviving_child)` — the parens remain. This is semantically correct (redundant parens are harmless) and avoids the complexity of tracking paren positions.

## Out of Scope

- **Cursor position management.** After a splice, the text input's cursor may need repositioning. This is a UI concern for the consuming feature (e.g., the color identity checkboxes) and is not part of this spec.
- **Multi-edit transactions.** This spec covers single-splice edits. If a future feature needs to apply multiple splices atomically, spans from the first splice would invalidate subsequent spans (offsets shift). That would require an offset-adjustment pass or a different API. Not needed for the motivating use case.
- **The color identity checkbox UI itself.** That is a separate spec. This spec provides the foundation it depends on.
- **Moving bare regex expansion to the evaluator.** Currently the parser desugars `/giant/` into `OR(name:/giant/, type:/giant/, oracle:/giant/)`, producing synthetic AST nodes with no source position. Moving this expansion to the evaluator would make every parser node correspond to source text, allowing spans to be required rather than optional. This is a worthwhile cleanup but a separate change that touches the AST types, evaluator, node cache keying, and breakdown display.

## Acceptance Criteria

1. Every token emitted by `lex()` carries `start` and `end` fields such that `input.slice(token.start, token.end)` reproduces the original source text of that token (including delimiters for QUOTED and REGEX tokens).
2. Every non-synthetic AST node carries a `span` with `start` and `end` byte offsets.
3. `FieldNode` carries a `valueSpan` covering just the value token.
4. `BreakdownNode` carries optional `span` and `valueSpan` fields, populated from the AST.
5. Splicing at a `FieldNode`'s `valueSpan` produces a query string where only the value is replaced and all surrounding text is byte-for-byte identical.
6. Splicing at a node's `span` removes the node's text from the query string.
7. Existing lexer and parser tests pass after switching from `toEqual` to `toMatchObject` (no changes to expected values).
8. `nodeKey()` does not include span information — structurally identical nodes at different positions share a cache key.
