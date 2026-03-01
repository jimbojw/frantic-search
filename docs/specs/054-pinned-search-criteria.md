# Spec 054: Pinned Search Criteria

**Status:** Implemented 

**Depends on:** Spec 021 (Inline Query Breakdown), Spec 036 (Source Spans), Spec 044 (Terms Drawer Redesign)

## Goal

Allow users to "pin" individual query criteria out of the live search input into a persistent filter layer. Pinned criteria act as a stable pre-filter; the user continues to refine results by editing the live query. The pinned layer is stored in `localStorage` and survives page reloads and navigation.

## Background

### Current behavior

A single live query drives the search. The MATCHES drawer shows AST nodes with match counts. Clicking a node focuses the query (isolates to that node). The × button removes a node from the query.

### Problem

Users who consistently filter by a format (`f:commander`), a meta-category (`is:permanent`), or a display mode (`unique:prints`) must re-type these criteria every session — or leave them in the live query where they compete for attention with the terms being actively explored. There is no way to separate "always on" criteria from "currently exploring" criteria.

## Design

### State model

Two independent query strings:

| Signal | Storage | Purpose |
|--------|---------|---------|
| `liveQuery` | URL `?q=` param (existing) | The editable query in the input box |
| `pinnedQuery` | `localStorage` key `frantic-pinned-query` | Persistent filter layer |

The input box displays and edits only the live query. The pinned query is never shown in the input.

### Effective query

When both are non-empty, the effective query sent to the worker is the pinned query AND'd with the live query:

```
effectiveQuery = sealQuery(pinned) + " " + sealQuery(live)
```

If the pinned query is an OR-root, it is parenthesized: `(sealQuery(pinned))`. Same for live. This follows the same sealing and OR-root wrapping semantics as `appendTerm`.

When only live is non-empty, the effective query is the live query (no change from today). When only pinned is non-empty, pinned is evaluated for breakdown counts but no results are shown. When both are empty, landing state.

### Worker contract

#### `ToWorker`

```typescript
export type ToWorker = {
  type: 'search'
  queryId: number
  query: string
  pinnedQuery?: string
}
```

The main thread sends `pinnedQuery` when it is non-empty. It sends a search message whenever either query changes (including when live becomes empty but pinned is non-empty).

#### `FromWorker` result variant

```typescript
{
  type: 'result'; queryId: number;
  indices: Uint32Array; breakdown: BreakdownNode;
  pinnedBreakdown?: BreakdownNode;
  histograms: Histograms;
  printingIndices?: Uint32Array;
  hasPrintingConditions: boolean; uniquePrints: boolean;
}
```

`pinnedBreakdown` is present when the worker received a non-empty `pinnedQuery`.

#### Worker evaluation logic

1. **Both non-empty:** Parse and evaluate pinned and live ASTs separately. Intersect their index sets. Compute histograms and sort from the intersection. Return both breakdowns.
2. **Only live non-empty:** Same as today.
3. **Only pinned non-empty:** Evaluate pinned AST. Return `pinnedBreakdown` with counts, empty `indices`, empty histograms.
4. **Both empty:** Not sent.

Per-node match counts in each breakdown reflect that query evaluated in isolation — they are not filtered by the other query. The lip counts (total cards) reflect the intersection.

### Results visibility

The live query is the sole determiner of whether results are shown, as today. If the live query is empty, no results grid appears even if the pinned query is non-empty. The PINNED drawer may still be visible with its own breakdown counts.

### Query breakdown redesign

The existing MATCHES breakdown nodes are upgraded from rows to **chips** in the style of the TERMS drawer neutral state (with syntax highlighting via `HighlightedLabel`). Each chip shows:

- Syntax-highlighted label
- Match count
- × button for removal

The click-to-focus behavior is **removed**. Clicking a chip now **pins** it.

The `(no-op)` node, when visible, does not get chip treatment and is not pinnable.

### Pin interaction (live → pinned)

Tapping a chip in the live query breakdown pins it:

1. The node is spliced out of the live query (same semantics as `removeNode`).
2. The node is appended to the pinned query (same semantics as `appendTerm`).

### Pinned query drawer

When the pinned query is non-empty, a PINNED drawer appears between the input box and the MATCHES drawer.

**Structure:** Same as the MATCHES drawer — expandable/collapsible section with a lip. The lip says **PINNED** and shows the card count. The expanded section shows breakdown chips.

**Visibility:** Shown whenever the pinned query is non-empty, regardless of whether live is empty. Hidden entirely (including the lip) when pinned is empty.

**Expanded/collapsed state:** Persisted to `localStorage` as `frantic-pinned-expanded`.

### Pinned chips

Chips in the pinned drawer have the same syntax-highlighted style as live chips, plus a **pin icon** at the front. Pinned criteria are doubly encoded: by location (above the live breakdown) and by the pin icon.

### Unpin interaction (pinned → live)

Tapping a chip in the pinned drawer unpins it:

1. The node is spliced out of the pinned query (same semantics as `removeNode`).
2. The node is prepended to the live query (via a new `prependTerm` helper — mirrors `appendTerm` but prepends).

If unpinning the last term, the pinned query becomes empty and the PINNED drawer is hidden entirely.

### × button semantics

- **× on a live chip:** Removes it irrevocably from the live query. Same as today.
- **× on a pinned chip:** Removes it irrevocably from the pinned query.

The safe path for the user is to unpin (tap), which prepends the term back to the live query. The × button is the destructive path.

### Banner tap (navigateHome)

Tapping the banner clears the live query but does **not** clear the pinned query. Pinned criteria are a persistent preference — the explicit clearing mechanism is the × button on pinned chips.

## Scope of changes

| File | Change |
|------|--------|
| `shared/src/worker-protocol.ts` | Add `pinnedQuery` to `ToWorker`, `pinnedBreakdown` to `FromWorker` result |
| `app/src/worker.ts` | Dual evaluation, index intersection, return both breakdowns |
| `app/src/query-edit.ts` | Export `appendTerm`, add exported `prependTerm` |
| `app/src/query-edit.test.ts` | Tests for `prependTerm` |
| `app/src/InlineBreakdown.tsx` | Refactor from rows to chips, replace click-to-focus with tap-to-pin |
| `app/src/PinnedBreakdown.tsx` | New component: PINNED drawer with pin-icon chips, unpin-on-tap |
| `app/src/App.tsx` | `pinnedQuery` signal + localStorage, wire to worker, render PINNED drawer |

## Test strategy

### Unit tests for `prependTerm`

| Query | Term | Expected |
|-------|------|----------|
| (empty) | `f:commander` | `f:commander` |
| `t:creature` | `f:commander` | `f:commander t:creature` |
| `a OR b` | `f:commander` | `f:commander (a OR b)` |
| `name:"ang` | `f:commander` | `f:commander name:"ang"` |

### Integration: pin/unpin round-trip

| Action | Live | Pinned |
|--------|------|--------|
| Type `f:commander t:creature` | `f:commander t:creature` | (empty) |
| Pin `f:commander` | `t:creature` | `f:commander` |
| Unpin `f:commander` | `f:commander t:creature` | (empty) |

## Acceptance criteria

1. Tapping a chip in the live breakdown pins it (removes from live, appends to pinned).
2. When pinned is non-empty, the PINNED drawer appears between input and MATCHES.
3. Tapping a chip in the PINNED drawer unpins it (removes from pinned, prepends to live).
4. When the last pinned term is unpinned or removed via ×, the PINNED drawer disappears.
5. × on a live chip removes it from the live query.
6. × on a pinned chip removes it from the pinned query.
7. Results are shown only when the live query is non-empty.
8. Breakdown nodes are rendered as chips with syntax highlighting (no focus-on-click).
9. Pinned chips display a pin icon.
10. Effective query is `pinned AND live` when both are non-empty.
11. Pinned query is persisted to `localStorage` and survives page reloads.
12. Banner tap clears live query but preserves pinned query.

## Implementation Notes

- 2026-03-01: Unified chip rendering across all breakdown cases. All nodes (leaves, NOT-leaves, AND, OR) render as `BreakdownChip` components. AND/OR nodes display labels with non-NOP child counts (e.g. `AND (2)`, `OR (3)`). Flat-OR is now classified as nested (root OR chip is visible with indented children) while flat-AND remains simple (flex-wrap leaf chips, no root chip). The pin icon is always visible on all chips: filled blue for pinned, stroked gray for live. NOP nodes render as inert chips with no pin icon, no click handler, and no × button. OR nodes with exactly one non-NOP child are not pinnable (the single child is the rational pin target). Root nodes of nested trees now have × buttons — tapping × on a root clears the entire query.
