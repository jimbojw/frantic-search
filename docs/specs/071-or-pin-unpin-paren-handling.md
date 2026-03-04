# Spec 071: OR Pin/Unpin Paren Handling

**Status:** Implemented

**Depends on:** Spec 054 (Pinned Search Criteria), Spec 023 (Breakdown Remove Node), Spec 036 (Source Spans)

## Goal

Fix two parenthesis bugs when pinning or unpinning OR query terms via the breakdown chips.

## Problem 1 — Empty parentheses left behind (pin)

- **Procedure:** `a (b or c) d` → tap OR chip to pin → live becomes `a () d` instead of `a d`
- **Root cause:** Parser spans for parenthesized expressions exclude the `(` and `)` (Spec 036 § "Compound node spans"). `removeNode` splices only the inner content, leaving empty `()`.

## Problem 2 — Missing parentheses (unpin)

- **Procedure:** Pinned `a OR b`, live `c` → tap OR chip to unpin → live becomes `a OR b c` instead of `(a OR b) c`
- **Root cause:** `prependTerm` only wraps the *live* query when it is OR; it never wraps the *term* when the term is OR. Due to operator precedence (OR binds looser than AND), `a OR b c` parses as `a OR (b c)` — wrong.

## Design

### Fix 1: Extend span in `removeNode` when target is parenthesized

Before splicing, check if the target's span is immediately surrounded by matching parentheses in the query string:

```ts
// If query has '(' at span.start-1 and ')' at span.end, extend span to include them
if (target.span.start > 0 && target.span.end < query.length &&
    query[target.span.start - 1] === '(' && query[target.span.end] === ')') {
  span = { start: target.span.start - 1, end: target.span.end + 1 }
}
```

- **Location:** `app/src/query-edit.ts` — inside `removeNode`, before calling `spliceQuery`
- **Edge case:** Adjacent terms without spaces (e.g. `a(b or c)d`) — the heuristic still works: we extend only when both parens are present. Result: `ad`.

### Fix 2: Wrap OR term in `prependTerm`

When the *term* being prepended parses as an OR-root, wrap it in parentheses:

```ts
const termBd = parseBreakdown(term.trim())
const termNeedsParens = termBd?.type === 'OR'
const liveNeedsParens = breakdown?.type === 'OR'
const termPart = termNeedsParens ? `(${term})` : term
const livePart = liveNeedsParens ? `(${sealed})` : sealed
return `${termPart} ${livePart}`
```

- **Location:** `app/src/query-edit.ts` — `prependTerm` function
- **Symmetry:** `appendTerm` wraps the *existing* query when it is OR. `prependTerm` must wrap *both* sides independently: term when term is OR, live when live is OR.

## Acceptance Criteria

1. Pin OR from `a (b or c) d` → live becomes `a d` (no empty parens)
2. Unpin OR from pinned `a OR b` into live `c` → live becomes `(a OR b) c`
3. Existing `removeNode` and `prependTerm` tests continue to pass
4. New unit tests cover both scenarios

## Scope of changes

| File | Change |
|------|--------|
| `docs/specs/071-or-pin-unpin-paren-handling.md` | New spec |
| `docs/specs/054-pinned-search-criteria.md` | Add Implementation Note referencing Spec 071 |
| `app/src/query-edit.ts` | Span extension in `removeNode`; term wrapping in `prependTerm` |
| `app/src/query-edit.test.ts` | New tests for both fixes |
| `app/src/App.tsx` | `findAndRemoveNode` updated to match root by `reconstructQuery` |

## Implementation Notes

- 2026-03-04: `findAndRemoveNode` in App.tsx and the test helper was updated to check `reconstructQuery(bd) === nodeLabel` first. This enables unpinning the root OR node when pinned query is `a OR b` — previously the root was never matched (only children were checked), so the pinned query was not cleared.
