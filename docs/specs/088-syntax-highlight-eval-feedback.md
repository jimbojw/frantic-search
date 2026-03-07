# Spec 088: Syntax Highlight Eval Feedback

**Status:** Implemented

**Depends on:** Spec 053 (Search Input Syntax Highlighting), Spec 021 (Inline Query Breakdown), Spec 039 (Non-Destructive Error Handling)

## Goal

Extend syntax highlighting so that terms with **erroneous values** (e.g., unknown set code) or **zero results** are visually distinguished in the search input. Today, only lex-time issues (e.g., unknown field names) are highlighted. Post-evaluation feedback — which the query breakdown already surfaces — should also appear inline in the syntax layer.

## Background

### Problem

Spec 053 added syntax highlighting based on lexer output. A term like `set:us` is lexically valid: `set` is a known field, `us` is a valid value token. The syntax highlighter shows it as valid. But the evaluator treats `set:us` as an error — there is no set with code `us` — and the query breakdown shows it as erroneous. The user sees green syntax and must look at the breakdown to discover the problem.

Similarly, a term like `t:nonexistent` might be syntactically valid but match zero cards. The breakdown highlights zero-match rows in amber; the syntax layer does not.

### Analogy

Modern code editors do this: `const foo = "bar";` is legal JavaScript syntax, but if `foo` is already defined in scope, the editor shows an error. Greater considerations (type checking, scope analysis) affect highlighting beyond raw parsing. We have the same opportunity — the evaluator already produces error and match-count data per leaf.

### Existing infrastructure

- `BreakdownNode` (worker protocol) carries `error`, `span`, `valueSpan`, and `matchCount` for each leaf.
- The worker builds the breakdown from `QueryNodeResult` and includes these fields (Spec 039, Spec 021).
- `QueryHighlight` currently takes only `query: string` and uses `lex()` + `classifyToken()`.
- The breakdown is available in `App.tsx` and `DualWieldLayout.tsx` where `QueryHighlight` is rendered.

## Design

### Data flow

1. Pass `breakdown: BreakdownNode | null` to `QueryHighlight` alongside `query`.
2. When breakdown is present, walk the tree to collect leaves with `error` set or `matchCount === 0`.
3. For each such leaf, use `span` (whole term) or `valueSpan` (value portion) to define character ranges that should be overridden.
4. Merge these ranges with the lex-derived spans and apply error/warning styling.

### New highlight roles

| Role | When | Styling |
|------|------|---------|
| `value-error` | Leaf has `error` set (e.g., unknown set, invalid format) | Same as `field-unknown`: red + wavy underline |
| `value-zero` | Leaf has `matchCount === 0` and no error | Amber/warning (consistent with breakdown zero-match rows) |

### Span selection

- **Value-specific errors** (e.g., `unknown set "us"`, `unknown format "xyz"`): Use `valueSpan` when present so only the value token is highlighted. This pinpoints the offending part.
- **Other errors** (e.g., `unknown field`, `invalid regex`): Use `span` for the whole term. Lex-time unknown fields are already handled; this covers evaluator errors that span the full term.
- **Zero results**: Use `span` for the whole term. The entire term contributes to the empty result.

### Collecting problem leaves

Recursively walk the breakdown tree. For each leaf (or NOT wrapping a leaf):

- If `error` is set and `span` exists → add `{ span, valueSpan?, kind: 'error' }`.
- Else if `matchCount === 0` and `type !== 'NOP'` and `span` exists → add `{ span, kind: 'zero' }`.

NOT nodes that wrap a single leaf carry the child's error/zero state; use the NOT node's `span` for the full `-term`.

### Span overlay algorithm

1. Build lex spans as today, but add `start` and `end` to each `HighlightSpan` for overlap checking.
2. Build a list of problem regions from the breakdown.
3. For each lex span, check if it overlaps any problem region. If so, override the role:
   - Overlap with error region → `value-error`
   - Overlap with zero region → `value-zero`
4. When a span overlaps multiple regions, prefer error over zero.

### Integration points

| Location | Breakdown to pass |
|----------|-------------------|
| `App.tsx` (single-pane) | `breakdown()` |
| `DualWieldLayout.tsx` (SearchPane) | `props.state.breakdown()` |

For pinned + live queries, the live breakdown matches the live query in the textarea. Use the live breakdown.

### Call sites that do not pass breakdown

`buildSpans` is also used by `MenuDrawer` and `InlineBreakdown` for chip labels (short strings like `t:creature`). Those call sites do not have breakdown context. The `breakdown` prop is optional; when absent, behavior is unchanged (lex-only highlighting).

## Edge cases

| Case | Handling |
|------|----------|
| **Stale breakdown** | Only apply overlay when `reconstructQuery(breakdown).trim() === query.trim()`. Otherwise fall back to lex-only. This prevents showing eval feedback for a previous query (e.g. "tarmog" has results) when the user has typed more ("tarmogy" has zero). |
| **Spans beyond query length** | Ignore breakdown spans with `end > query.length` (user may have edited). |
| **Missing span** | Skip leaves without `span` (should not occur for parsed terms). |
| **NOP nodes** | Exclude from zero-result highlighting (`matchCount` is -1, not meaningful). |
| **Pinned + live** | Live breakdown matches live query; spans align. |

## Scope of changes

| File | Change |
|------|--------|
| `app/src/QueryHighlight.tsx` | Add `breakdown` prop, `collectProblemLeaves`, span overlay logic, new roles and classes |
| `app/src/App.tsx` | Pass `breakdown={breakdown()}` to `QueryHighlight` |
| `app/src/DualWieldLayout.tsx` | Pass `breakdown={props.state.breakdown()}` to `QueryHighlight` |
| `app/src/QueryHighlight.test.ts` | Tests for overlay behavior (with/without breakdown, error vs zero) |

## Acceptance criteria

1. A term with an erroneous value (e.g., `set:us` — unknown set) shows error styling (red + wavy underline) on the value portion when breakdown is available.
2. A term with zero results (e.g., `t:nonexistent`) shows warning styling (amber) on the term when breakdown is available.
3. Lex-time errors (unknown field) continue to work as today.
4. When breakdown is null or stale, highlighting falls back to lex-only (no regression).
5. Call sites that use `buildSpans` without breakdown (MenuDrawer, InlineBreakdown) continue to work unchanged.
6. Both single-pane and dual-wield layouts receive the correct breakdown and display eval feedback.
