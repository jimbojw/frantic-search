# Spec 009: Query Breakdown

**Status:** Draft

## Goal

Show users a per-node decomposition of their search query so they can see how each filter contributes to the result. This is especially valuable when a query returns zero results — the user can immediately identify which term is the culprit.

## Background

The evaluator (Spec 004) already produces a `QueryNodeResult` tree where every AST node carries a `matchCount`, `cached` flag, and timing data (`productionMs`, `evalMs`). This tree is computed as a natural byproduct of evaluation — it costs nothing extra. Today the worker discards it, sending only the matched cards and total count back to the main thread. This spec adds the tree to the wire protocol and renders it in the UI.

## Wire Protocol Changes

### `FromWorker` result message

Add an optional `breakdown` field to the `result` message. It carries a serializable mirror of the `QueryNodeResult` tree, stripped to the fields the UI needs.

```typescript
type BreakdownNode = {
  label: string
  matchCount: number
  children?: BreakdownNode[]
}
```

| Field        | Description                                                           |
|--------------|-----------------------------------------------------------------------|
| `label`      | Human-readable description of the node (e.g. `t:creature`, `OR`, `-c:blue`) |
| `matchCount` | Number of face matches for this node in isolation                     |
| `children`   | Child nodes, present for AND / OR / NOT                               |

The worker builds the `BreakdownNode` tree from the `QueryNodeResult` tree by converting each `ASTNode` into a readable label. Timing data (`productionMs`, `evalMs`, `cached`) is omitted from the wire format — it is interesting for internal profiling but not useful in the user-facing breakdown. If we want it later, we can add it without breaking changes.

```typescript
type FromWorker =
  | { type: 'status'; status: 'loading' | 'ready' | 'error'; error?: string }
  | { type: 'result'; queryId: number; cards: CardResult[]; totalMatches: number; breakdown: BreakdownNode }
```

The `breakdown` field is always present when there is a result. There is no opt-in flag — the tree is tiny (one object per AST node, typically under 20 nodes) and is already computed.

### Label generation

The worker converts each `ASTNode` into a human-readable label:

| Node type     | Label format                                           | Examples                        |
|---------------|--------------------------------------------------------|---------------------------------|
| `FIELD`       | `${field}${operator}${value}`                          | `t:creature`, `pow>5`, `c>=wu`  |
| `BARE`        | `${value}`                                             | `lightning`                     |
| `EXACT`       | `!"${value}"`                                          | `!"Lightning Bolt"`             |
| `REGEX_FIELD` | `${field}${operator}/${pattern}/`                      | `o:/enters the/`                |
| `NOT`         | `NOT`                                                  | `NOT`                           |
| `AND`         | `AND`                                                  | `AND`                           |
| `OR`          | `OR`                                                   | `OR`                            |

Internal nodes (AND, OR, NOT) use uppercase keywords. Their semantics are conveyed by the tree structure — the label just identifies the combinator.

## UI Design

### Progressive disclosure

The breakdown is hidden by default. It appears through a disclosure affordance that varies by context:

| Context                        | Affordance                                                                          |
|--------------------------------|-------------------------------------------------------------------------------------|
| Zero results                   | A "Show query breakdown" link in the empty state, visually prominent                |
| Has results                    | A "Show query breakdown" link next to the result count, visually subtle             |
| No query / loading / error     | No affordance (nothing to break down)                                               |

Tapping the link toggles the breakdown panel open/closed. The open/closed state persists across queries within the session but resets on page reload.

### Breakdown panel

The panel renders as a flat list of leaf nodes for simple AND queries (the overwhelmingly common case), or as an indented tree for queries with OR, NOT, or nesting.

Each row shows:
- The node label (e.g. `t:creature`)
- The match count, right-aligned (e.g. `14,230`)
- A visual indicator when matchCount is 0 (warning color)

#### Simple AND example

For a query `t:creature c:green pow>5 legal:pauper` that returns 0 results:

```
Query breakdown

  t:creature          14,230
  c:green              8,450
  pow>5                2,100
  legal:pauper         6,800
  ─────────────────────────
  Combined                 0
```

The "Combined" row shows the root AND node's matchCount. Users scan the individual counts to see that every term has matches individually — the empty result comes from their intersection. (If any leaf had 0, it would be highlighted as the obvious culprit.)

#### Nested example

For `(c:red OR c:blue) t:instant`:

```
Query breakdown

  AND                     42
  ├─ OR                5,200
  │  ├─ c:red          3,100
  │  └─ c:blue         2,800
  └─ t:instant         6,400
```

### Styling

- The panel sits between the search input and the results list.
- Background: subtle (gray-50/gray-900 dark) with a rounded border, consistent with the existing card list.
- Text: monospace or tabular-nums for match counts so columns align.
- Zero-match rows: text in amber/warning color.
- The "Combined" separator line only appears for top-level AND nodes.

## Implementation Plan

### 1. Worker protocol (`shared/src/worker-protocol.ts`)

Add the `BreakdownNode` type. Add `breakdown: BreakdownNode` to the `result` variant of `FromWorker`.

### 2. Worker (`app/src/worker.ts`)

After `cache.evaluate(ast)`, walk the `QueryNodeResult` tree and build a `BreakdownNode` tree. Include it in the posted `result` message.

### 3. App state (`app/src/App.tsx`)

Add a `breakdown` signal (type `BreakdownNode | null`). Populate it from the worker's result message. Clear it when the query is empty.

Add a `showBreakdown` signal (boolean, default `false`). Toggled by the disclosure link.

### 4. Breakdown component (`app/src/App.tsx`)

A `QueryBreakdown` component that accepts a `BreakdownNode` and renders the panel. For a root AND node with only leaf/negation children, render the flat list with a "Combined" footer. Otherwise, render the indented tree.

## Acceptance Criteria

1. The `result` message from the worker includes a `breakdown` field containing a `BreakdownNode` tree.
2. Each `BreakdownNode` has a human-readable `label` and `matchCount` matching the evaluator's `QueryNodeResult`.
3. When results are empty, a "Show query breakdown" link is visible. Tapping it reveals the breakdown panel.
4. When results are present, a subtler "Show query breakdown" link is available near the result count.
5. The breakdown panel correctly renders flat AND queries as a list with a "Combined" footer row.
6. The breakdown panel correctly renders nested queries (OR, NOT, parenthesized groups) as an indented tree.
7. Nodes with zero matches are visually distinguished (warning color).
8. The breakdown panel can be toggled open and closed. Its state persists across queries within the session.
