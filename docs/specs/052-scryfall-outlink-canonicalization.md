# Spec 052: Scryfall Outlink Canonicalization

**Status:** Implemented

**GitHub Issue:** [#34](https://github.com/jimbojw/frantic-search/issues/34)

## Goal

Canonicalize Frantic Search queries before embedding them in Scryfall outlinks so that the linked search has the best chance of succeeding.

## Background

Frantic Search is intentionally liberal with incomplete input — unclosed quotes, unclosed regexes, bare regexes, partial dates, and other malformed constructs all produce useful instant results during typing. These are deliberate divergences from Scryfall's stricter parser.

The app exposes two Scryfall search outlinks (results toolbar, bug report) that currently pass the raw query string verbatim via `encodeURIComponent(query().trim())`. When the query contains any of these liberal constructs, Scryfall rejects the search.

## Divergences Requiring Canonicalization

| Frantic Search allows | Scryfall behavior | Canonicalization |
|---|---|---|
| Unclosed quotes: `"oracle` | Errors | Parser extracts value; serializer re-wraps in `"..."` |
| Unclosed regex: `/oracle` | Errors | Parser extracts pattern; serializer re-wraps in `/.../` |
| Invalid regex: `/[/` | Errors | Pass through with closed delimiters (user intent is clear) |
| Bare regex: `/giant/` | Not supported | Parser expands to `OR(name:, type:, oracle:)`; serializer emits explicit OR |
| Single quotes: `'bolt'` | Errors | Serialize as double quotes |
| Partial dates: `date>=202` | Errors | Pad to `YYYY-MM-DD` using zero-fill |
| NOP nodes (malformed input) | N/A | Skip entirely |
| Empty field value: `c:` | May error | Skip term |

## Approach

### AST serializer

Parse the raw query into the existing AST via `parse()`, then serialize the AST back to valid Scryfall syntax via a new `toScryfallQuery()` function. The parser already handles all error recovery (unclosed delimiters, bare regex expansion, NOP insertion), so the serializer's job is simply to emit correct syntax for each node type.

```
raw query → parse() → ASTNode → toScryfallQuery() → canonical string → URL
```

### Serialization rules

| Node type | Output |
|---|---|
| `NOP` | Empty string (dropped from output) |
| `BARE` (unquoted) | `value` |
| `BARE` (quoted) | `"value"` |
| `FIELD` | `field<op>value` — quote value if it contains whitespace; skip node entirely if value is empty |
| `REGEX_FIELD` | `field<op>/pattern/` |
| `EXACT` | `!"value"` |
| `NOT` | `-(child)` — parenthesize child if compound |
| `AND` | Children joined by space |
| `OR` | Children joined by ` OR `, parenthesized when nested inside AND or NOT |

### Date padding

For `FIELD` nodes where the field resolves to `date` via `FIELD_ALIASES`, partial date values are padded to `YYYY-MM-DD` using the same zero-fill strategy as the evaluator (`eval-printing.ts`):

- `202` → `2020-01-01`
- `2021-0` → `2021-01-01`
- `2021-06` → `2021-06-01`

Special values (`now`, `today`, set codes) pass through unchanged — Scryfall supports them natively.

## Scope of Changes

| File | Change |
|---|---|
| `shared/src/search/canonicalize.ts` | New — `toScryfallQuery(node: ASTNode): string` |
| `shared/src/search/canonicalize.test.ts` | New — tests |
| `shared/src/index.ts` | Export `toScryfallQuery` |
| `app/src/App.tsx` | Import `parse` + `toScryfallQuery`; use in `scryfallUrl` signal |
| `app/src/BugReport.tsx` | Import `parse` + `toScryfallQuery`; use in `scryfallComparisonText` |

## Test Strategy

Tests drive the implementation (TDD). Each test parses a raw query string, feeds the AST to `toScryfallQuery()`, and asserts the canonical output:

- Each node type round-trips correctly
- Unclosed quotes produce closed double-quoted output
- Unclosed regex expands to OR with closed delimiters
- Bare regex expands to explicit OR of field regexes
- Partial dates are padded
- NOP and empty-value nodes are dropped
- Compound queries with AND/OR/NOT preserve structure
- Parenthesized groups round-trip correctly

## Acceptance Criteria

1. `toScryfallQuery(parse('"oracle'))` returns `"oracle"`.
2. `toScryfallQuery(parse('/giant/'))` returns `(name:/giant/ OR type:/giant/ OR oracle:/giant/)`.
3. `toScryfallQuery(parse('date>=202'))` returns `date>=2020-01-01`.
4. `toScryfallQuery(parse("'bolt'"))` returns `"bolt"`.
5. `toScryfallQuery(parse('c: t:creature'))` returns `t:creature` (empty field value dropped).
6. NOP-only ASTs produce an empty string.
7. The Scryfall outlink in `App.tsx` uses the canonicalized query.
8. The Scryfall URL in `BugReport.tsx` uses the canonicalized query.
