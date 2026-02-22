# Spec 023: Breakdown Remove Node

**Status:** In Progress

**Depends on:** Spec 021 (Inline Query Breakdown)

## Goal

Let users remove individual terms from a query directly in the breakdown panel. Clicking the remove button on a row reconstructs the query with that term excluded, replacing the search input. This is especially useful when a multi-term query produces zero results because of one overly restrictive leaf — the user can identify the bottleneck (highlighted amber) and remove it without manually editing the query string.

## Background

Spec 021 introduced clickable breakdown labels that let users **drill down** — clicking a row replaces the query with just that subtree. This is a *focus* action: it discards everything except the clicked node.

Remove is the complementary *subtract* action: it preserves everything except the clicked node. Together, the two interactions give users full breakdown-driven query refinement without touching the text input.

### Current state

Each `BreakdownRow` in `InlineBreakdown.tsx` has an `onClick` handler that calls `onNodeClick(reconstructQuery(node))`. The `reconstructQuery` function walks a subtree top-down to produce a query string. The `onNodeClick` callback is wired to `setQuery` in `App.tsx`, which updates the search input and triggers a new search.

## Design

### UI: Remove button column

Each leaf row and each removable parent row in the expanded breakdown displays a small **×** button to the right of the match count. The buttons form a right-aligned column:

```
┌─────────────────────────────────────────────────────┐
│ t:creature                          18,606      [×] │
│ c:green                              6,952      [×] │
│ ─────────────────────────────────────────────────── │
│ ▸ ALL                    3,891 cards (4,505 faces)  │
└─────────────────────────────────────────────────────┘
```

Layout of a single row (three columns):

```
[clickable label]          [match count]  [× button]
```

- The **label** remains clickable for drill-down (existing behavior).
- The **match count** is right-aligned with `tabular-nums` (existing behavior).
- The **× button** sits in a fixed-width column to the right of the count.

### Visibility

The × button is **always visible** at reduced opacity (`opacity-60`), increasing to full opacity on hover. This avoids layout jitter and ensures discoverability on both desktop and mobile without requiring hover-based reveal.

### Which rows show the button

The remove button appears on nodes that are **direct children of the root** in flat cases, or **any node** in nested cases — with the following constraints:

| Case | Removable rows |
|---|---|
| Single term | The single row. Removing it clears the query. |
| Flat AND (2+ children) | Each child row. |
| Flat OR (2+ children) | Each child row. |
| Nested tree | Every row except the root. Removing the root is equivalent to clearing the query. |

The × button is always present — even in the single-term case — to avoid layout jitter. As the user types, a query frequently transitions between one and two terms (e.g., `"black "` → `"black l"`). If the × column appeared and disappeared at that boundary, the count column would shift horizontally on every keystroke. A stable three-column layout eliminates this.

Removing the last term produces an empty string, which clears the query and returns the user to the landing state.

When removing the **last remaining sibling** from an AND/OR parent (i.e., the parent had exactly 2 children and one is removed), the parent collapses: the surviving child replaces the parent in the query string. This prevents leaving behind a degenerate `AND`/`OR` with a single child.

### Query reconstruction

The existing `reconstructQuery(node)` builds a query string from a subtree. Remove needs a new function that builds a query string from the **full tree minus one node**.

```typescript
function reconstructWithout(
  root: BreakdownNode,
  exclude: BreakdownNode,
): string
```

The function walks the tree. When it encounters `exclude`, it skips it. When an AND/OR node loses a child:

- If ≥2 children remain, reconstruct the parent normally with the reduced child list.
- If exactly 1 child remains, the parent is collapsed — return the reconstruction of the surviving child (no wrapping AND/OR).
- If 0 children remain (only possible if the parent had a single child that was excluded), return `''`.

Because `BreakdownNode` instances are unique objects in each breakdown tree, identity comparison (`===`) is sufficient to identify the exclusion target.

#### Examples

**Flat AND — remove one term:**

Query: `t:creature c:green pow>3`

Tree: `AND(t:creature, c:green, pow>3)`

Remove `c:green` → `AND(t:creature, pow>3)` → `"t:creature pow>3"`

**Flat AND — remove from two terms (parent collapse):**

Query: `t:creature c:green`

Tree: `AND(t:creature, c:green)`

Remove `c:green` → only `t:creature` remains → parent collapses → `"t:creature"`

**Flat OR — remove one term:**

Query: `c:green OR c:white OR c:red`

Tree: `OR(c:green, c:white, c:red)`

Remove `c:white` → `OR(c:green, c:red)` → `"c:green OR c:red"`

**Nested — remove a leaf inside a nested AND:**

Query: `t:creature c:green OR c:white pow>3`

Tree: `OR(AND(t:creature, c:green), AND(c:white, pow>3))`

Remove `c:green` → `OR(t:creature, AND(c:white, pow>3))` → `"t:creature OR (c:white pow>3)"`

**Nested — remove an internal AND/OR node:**

Same tree. Remove the entire `AND(c:white, pow>3)` branch → only `AND(t:creature, c:green)` remains → parent OR collapses → `"t:creature c:green"`

### Interaction with drill-down

The drill-down (label click) and remove (× click) actions are independent. Both produce a new query string and call `setQuery`. The × button uses `e.stopPropagation()` to prevent the click from also triggering the row's drill-down handler.

### Callback plumbing

Add a new `onNodeRemove` callback prop to `InlineBreakdown`, parallel to the existing `onNodeClick`:

```typescript
export default function InlineBreakdown(props: {
  breakdown: BreakdownNode
  cardCount: number
  faceCount: number
  expanded: boolean
  onToggle: () => void
  onNodeClick: (query: string) => void
  onNodeRemove: (query: string) => void  // new
})
```

In `App.tsx`, wire `onNodeRemove` to `setQuery`, same as `onNodeClick`. The callbacks are identical today, but separate props keep the door open for distinct behavior later (e.g., an undo toast on remove).

### Accessibility

- The × button has `aria-label="Remove <label>"` (e.g., `aria-label="Remove c:green"`).
- The button is a `<button>` element (not a clickable `<span>`) for keyboard accessibility.
- Focus order within a row: label first (drill-down), then × button (remove).

## Implementation Plan

### 1. `reconstructWithout` function (`app/src/InlineBreakdown.tsx`)

Add `reconstructWithout(root, exclude)` alongside the existing `reconstructQuery`. It reuses `reconstructQuery` for subtrees that don't contain the excluded node, and filters children for nodes that do.

### 2. `BreakdownRow` changes (`app/src/InlineBreakdown.tsx`)

- Add an `onRemove?: () => void` prop.
- Add a third column to the row layout: a `<button>` with an × SVG icon, rendered when `onRemove` is provided.
- The button is always visible at `opacity-60`, with `hover:opacity-100` for emphasis.

### 3. Wire remove handlers

- In the flat AND/OR rendering paths, pass `onRemove={() => props.onNodeRemove(reconstructWithout(props.breakdown, child))}` to each child's `BreakdownRow`.
- In `BreakdownTreeNode`, pass `onRemove` to each non-root node.
- In the single-term case, pass `onRemove={() => props.onNodeRemove('')}` to clear the query.

### 4. `InlineBreakdown` props (`app/src/InlineBreakdown.tsx`)

Add `onNodeRemove` to the component's props type.

### 5. `App.tsx` integration

Pass `onNodeRemove={setQuery}` to the `InlineBreakdown` component.

## Edge Cases

### Bare regex expansion

A bare regex `/giant/` is expanded by the parser into `OR(name:/giant/, type:/giant/, oracle:/giant/)`. The breakdown displays three child rows. Removing one (e.g., `oracle:/giant/`) should produce `name:/giant/ OR type:/giant/`. This works naturally with `reconstructWithout` — the OR node loses one child, two remain, and the reconstruction emits them joined with ` OR `.

The user cannot reconstruct the original `/giant/` syntax from the remaining nodes, but that matches the drill-down behavior today and is acceptable.

### NOT-leaf removal

A NOT-leaf like `-c:red` is displayed as a single merged row. Removing it works the same as removing any other leaf — `reconstructWithout` skips the NOT node.

### Removing the last term

When the query is a single term and the user clicks ×, `reconstructWithout` returns `''`. This clears the query and returns to the landing state — the same behavior as clicking the Frantic Search banner.

## Acceptance Criteria

1. In a flat AND query (e.g., `t:creature c:green`), each child row displays a × button that removes that term and searches for the remaining terms.
2. In a flat OR query (e.g., `c:green OR c:white`), each child row displays a × button with the same behavior.
3. In a nested query, every non-root row (leaves and internal AND/OR nodes) displays a × button.
4. A single-term query displays a × button. Clicking it clears the query.
5. Removing a child from a two-child AND/OR collapses the parent: the surviving child's query is used directly, with no redundant grouping.
6. The × button is always visible at reduced opacity and brightens on hover.
8. Clicking the × button does not trigger the drill-down (label click) action.
9. The × button is a `<button>` element with an appropriate `aria-label`.
10. Removing a term from a zero-result query (where the removed term had zero matches) produces a new query that returns results.
