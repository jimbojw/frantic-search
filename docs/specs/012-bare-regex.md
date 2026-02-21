# Spec 012: Bare Regex (Top-Level `/pattern`)

**Status:** Draft

## Goal

Allow users to type a bare regex — `/pattern/` or just `/pattern` (unclosed) — without a field prefix, and have it search across all string fields simultaneously. This is syntactic sugar that the parser desugars into an OR across `name`, `oracle`, and `type`.

## Background

The lexer already tokenizes `/pattern/` (and unclosed `/pattern`) as a `REGEX` token. The parser currently only accepts `REGEX` tokens after a field+operator (e.g., `o:/damage/`), producing a `REGEX_FIELD` AST node. A bare `REGEX` token with no preceding field falls through to the parser's catch-all, producing an empty AND node — effectively ignored.

Scryfall itself ignores bare `/` input ("All of your terms were ignored"). We can do better: a bare regex is a natural shorthand for "search everything textual," and on mobile it saves significant typing.

### Motivation

| Input | Characters | Equivalent |
|---|---|---|
| `/lhur` | 5 | `name:/lhur/ OR oracle:/lhur/ OR type:/lhur/` (45 chars) |
| `/^birds/` | 9 | `name:/^birds/ OR oracle:/^birds/ OR type:/^birds/` (51 chars) |

## Design

### Parser desugaring

When `parseAtom()` encounters a `REGEX` token in a position where no field+operator precedes it, it expands the token into:

```
OR(
  REGEX_FIELD(name, :, pattern),
  REGEX_FIELD(oracle, :, pattern),
  REGEX_FIELD(type, :, pattern),
)
```

This uses the canonical field names (`name`, `oracle`, `type`) — not aliases — and the `:` operator (substring semantics, consistent with how bare words implicitly search `name:`).

### No new AST node types

The desugared tree uses existing `OrNode` and `RegexFieldNode` types. This means:

- The evaluator requires **zero changes**. It already handles `REGEX_FIELD` nodes for all three string fields.
- The query breakdown UI (Spec 009) shows the expanded form, so users see which fields matched.
- Negation (`-/pattern/`) works for free: the parser wraps the desugared OR in a `NOT` node.
- Grouping (`(/pattern/) c:r`) composes naturally.
- Caching (Spec 004) works because the node keys are standard `REGEX_FIELD` keys.

### Target fields

Only the three string-column fields: `name`, `oracle`, `type`. These are the fields that `evalLeafRegex()` already supports.

Mana cost is excluded: it uses a structured symbol-map representation (Spec 008), not a string column. Supporting regex against mana would require synthesizing a string at query time for every card — a different cost model and a separate feature.

### Edge cases

| Input | Behavior |
|---|---|
| `/` | Empty pattern. `RegExp("", "i")` matches every string → matches all cards. Equivalent to no filter. |
| `/lhur` | Unclosed regex. Lexer already consumes to EOF → pattern is `lhur`. Desugars normally. |
| `/[invalid/` | Invalid regex. `evalLeafRegex()` catches the `RegExp` constructor error and matches zero cards. Each OR child independently matches zero → whole OR matches zero. |
| `-/bolt/` | Negation. Parser wraps the desugared OR in a NOT node → cards whose name, oracle, AND type all fail to match the pattern. |
| `/bolt/ c:r` | AND composition. The desugared OR becomes one child of an implicit AND with `c:r`. |
| `c:r OR /bolt/` | OR composition. The desugared OR nests as one child of the explicit outer OR. |

### Grammar change

The `atom` production gains one new alternative:

```
atom = "(" expr ")"
     | WORD operator (WORD | QUOTED | REGEX)
     | WORD
     | QUOTED
     | REGEX                                    ← new
```

## Interaction with `isTermStart`

The parser's `isTermStart()` check gates whether a token can begin a new term inside an implicit AND group. It must be extended to include `TokenType.REGEX`, otherwise a bare regex after another term (e.g., `c:r /bolt/`) would not be parsed as an AND.

Similarly, `isAtomStart()` must include `TokenType.REGEX` so that `-/pattern/` correctly parses the regex as the negated atom.

## Test Strategy

### Parser tests (`parser.test.ts`)

1. **Simple bare regex** — `/bolt/` desugars to `OR(REGEX_FIELD(name,:,bolt), REGEX_FIELD(oracle,:,bolt), REGEX_FIELD(type,:,bolt))`.
2. **Unclosed bare regex** — `/bolt` produces the same desugared OR (lexer handles unclosed).
3. **Negated bare regex** — `-/bolt/` produces `NOT(OR(REGEX_FIELD...))`.
4. **Bare regex in AND** — `c:r /bolt/` produces `AND(FIELD(c,:,r), OR(REGEX_FIELD...))`.
5. **Bare regex in OR** — `c:r OR /bolt/` produces `OR(FIELD(c,:,r), OR(REGEX_FIELD...))`.
6. **Empty bare regex** — `/` desugars to OR with empty-pattern REGEX_FIELD children.
7. **Parser never throws** — add bare regex inputs to the existing "never throws" test.

### No evaluator tests needed

The desugared nodes are standard `REGEX_FIELD` nodes already exercised by existing evaluator tests. No new evaluation logic is introduced.

## Acceptance Criteria

1. `parse("/bolt/")` returns an `OrNode` with three `RegexFieldNode` children (name, oracle, type).
2. `parse("/bolt")` (unclosed) returns the same structure.
3. `-/bolt/` wraps the OR in a `NOT` node.
4. Bare regex composes with AND and OR as described above.
5. No new AST node types are introduced.
6. No evaluator changes are required.
7. All existing tests continue to pass.
