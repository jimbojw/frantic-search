# Spec 021: Inline Query Breakdown

**Status:** Implemented

**Supersedes:** Spec 009 (Query Breakdown)

**Depends on:** Spec 002 (Query Engine), Spec 004 (Eval Cache)

## Goal

Replace the toggle-hidden query breakdown with an always-visible panel that extends directly below the search input, providing real-time feedback on query structure and per-term match counts. The breakdown teaches users the query grammar passively — every keystroke shows how terms are parsed and how many cards each one matches.

## Background

Spec 009 introduced the query breakdown as a progressive-disclosure panel hidden behind a "show breakdown" link. While useful for debugging zero-result queries, the hidden-by-default design means most users never discover it. The data is already computed (every AST node carries a `matchCount` as a byproduct of evaluation) so there is no performance cost to always showing it.

This spec redesigns the breakdown as an **inline panel attached to the search input** — visually a "lip" that extends downward from the input box, sharing its border and background. The panel appears automatically when the user types and adapts its format to the query structure, using human-friendly summary labels (ALL, ANY, FINAL) instead of raw logical operators.

## Design

### Positioning and visibility

The breakdown panel is **always visible** when there is a non-empty query with results (or a breakdown from the worker). It sits directly below the search input with no gap — the input and breakdown share a continuous border, as if the input has grown a body:

- **Input only (no query):** `rounded-xl` border on all sides, as today.
- **Input + breakdown (expanded or collapsed):** Input becomes `rounded-t-xl` (flat bottom), breakdown becomes `rounded-b-xl` (flat top). They share the same border color, background, and shadow, appearing as a single connected element. This applies in both expanded and collapsed states — the summary line is always visible when there is a query, so the connected styling is always active.

### Summary line

Every query displays a **summary line** as the last row of the breakdown. This line shows the deduplicated card count and the face match count:

```
<label>                    <card_count> cards (<face_count> faces)
```

- `card_count` comes from the deduplicated result set (`results().length`).
- `face_count` comes from `totalMatches` (the worker's total face-level match count, which equals the root node's `matchCount`).
- `label` depends on the query structure — see display cases below.

The summary line is visually distinct from term rows: it sits below a subtle separator and may use a different text weight or color to signal that it is a total rather than an individual term.

### Display cases

#### Case 1: Single term

A query consisting of a single leaf node (or NOT-leaf). The term appears on one line, followed by the summary line with **no label**.

```
t:creature                                    18,606
                              14,832 cards (18,606 faces)
```

The summary line exists to show the card/face distinction, which matters for multi-face cards. The unlabeled summary is unambiguous because there is only one term above it.

#### Case 2: Flat AND (implicit conjunction, 2+ terms)

All terms are implicitly AND'd with no OR or nesting. Each term appears on its own line. The summary line is labeled **ALL**.

```
t:creature                                    18,606
c:green                                        6,952
ALL                            3,891 cards (4,505 faces)
```

#### Case 3: Flat OR (2+ terms)

All terms are explicitly OR'd with no AND or nesting. Each term appears on its own line. The summary line is labeled **ANY**.

```
c:green                                        6,952
c:white                                        7,152
ANY                            9,428 cards (10,731 faces)
```

This case also covers **bare regex** queries (`/giant/`), which the parser expands into `OR(name:/giant/, type:/giant/, oracle:/giant/)`. The three field-specific children appear as individual rows, making the expansion visible to the user:

```
name:/giant/                                     112
type:/giant/                                     204
oracle:/giant/                                   387
ANY                              502 cards (703 faces)
```

#### Case 4: NOT as leaf

A NOT node wrapping a single leaf is displayed as a **single row** using the `-` prefix, matching Scryfall syntax. The NOT node and its child are merged for display purposes.

| Query fragment | Display label |
|---|---|
| `-c:red` | `-c:red` |
| `-t:instant` | `-t:instant` |
| `-"Lightning Bolt"` (negated bare word) | `-Lightning Bolt` |

The match count shown is the NOT node's count (the complement). In the breakdown, `-c:red` is a leaf — it has no visible children.

For the uncommon case of NOT wrapping a complex subtree (e.g., `-(a OR b)`), the NOT node displays with label `NOT` and its subtree is shown indented beneath it, as in the existing tree rendering.

#### Case 5: Nested tree

When the tree has nesting (AND/OR nodes whose children are themselves AND/OR nodes), the breakdown shows the **full tree with indentation**. AND/OR nodes appear as labeled parent rows *before* their children, with match counts right-aligned like leaf nodes.

The summary label depends on whether the tree is **homogeneous** or **mixed**:

- **All AND (no OR nodes):** Summary label is **ALL**.
- **All OR (no AND nodes):** Summary label is **ANY**.
- **Both AND and OR present:** Summary label is **FINAL**.

##### Mixed example

`t:creature c:green OR c:white pow>3` — parsed as `OR(AND(t:creature, c:green), AND(c:white, pow>3))`:

```
OR                                             5,103
  AND                                          4,505
    t:creature                                18,606
    c:green                                    6,952
  AND                                            808
    c:white                                    7,152
    pow>3                                      4,741
FINAL                          5,052 cards (5,103 faces)
```

##### Homogeneous OR example

`/angel/ OR /demon/` — parsed as `OR(OR(name:/angel/, type:/angel/, oracle:/angel/), OR(name:/demon/, type:/demon/, oracle:/demon/))`:

```
OR                                               987
  name:/angel/                                   112
  type:/angel/                                    38
  oracle:/angel/                                 850
OR                                               654
  name:/demon/                                    89
  type:/demon/                                    31
  oracle:/demon/                                 540
ANY                            1,580 cards (1,641 faces)
```

##### Homogeneous AND example

`(c:w c:r) (c:u c:g)` — parsed as `AND(AND(c:w, c:r), AND(c:u, c:g))`:

```
AND                                            2,100
  c:w                                          7,152
  c:r                                          6,340
AND                                            1,890
  c:u                                          6,780
  c:g                                          6,952
ALL                              412 cards (418 faces)
```

The summary line repeats the root node's face count (which is also shown on the root node's own row) but adds the deduplicated card count. This repetition is intentional — the summary line is a consistent anchor at the bottom of the breakdown regardless of tree depth.

### Determining the display case

The UI determines which case to use based on the breakdown tree structure:

1. **Single term:** Root has no children (leaf, including merged NOT-leaf).
2. **Flat AND:** Root is AND, all children are leaves or NOT-leaves (no nested AND/OR).
3. **Flat OR:** Root is OR, all children are leaves or NOT-leaves (no nested AND/OR).
4. **Nested tree:** Any other structure. The summary label is determined by scanning the tree for AND and OR nodes — ALL if only ANDs, ANY if only ORs, FINAL if both.

A "NOT-leaf" is a NOT node whose child is a leaf. It counts as flat for display purposes because it renders as a single row.

### Collapsible drawer

The breakdown panel is **collapsible**. The summary line doubles as the collapse/expand toggle — it is always visible regardless of state.

- **Expanded (default):** The full breakdown is visible: term rows, separator, and summary line. A small chevron (▾) appears on the summary line indicating it can be collapsed.
- **Collapsed:** Only the summary line is visible (term rows are hidden). The chevron changes to ▸. The summary line continues to show the card/face counts, so the user always has a results-at-a-glance readout.

Tapping **anywhere on the summary line** (not just the chevron) toggles the drawer. This gives the toggle a large, easy-to-hit tap target.

The collapsed/expanded state is persisted to `localStorage` so power users who prefer the compact view keep their preference across sessions.

### Wire protocol changes

Add a `type` field to `BreakdownNode` so the UI can determine the node kind without parsing the label string:

```typescript
export type BreakdownNode = {
  type: 'AND' | 'OR' | 'NOT' | 'FIELD' | 'BARE' | 'EXACT' | 'REGEX_FIELD'
  label: string
  matchCount: number
  children?: BreakdownNode[]
}
```

The `type` field mirrors the AST node's `type` and is set in the worker's `toBreakdown()` function. The UI uses it to determine the display case (flat AND vs flat OR vs mixed) and to merge NOT-leaf nodes.

The `label` field continues to hold the human-readable label as before (e.g., `t:creature`, `AND`, `-c:red`). The change for NOT-leaf labels is: when a NOT node wraps a single leaf, the worker now emits a merged label (`-${childLabel}`) and omits the `children` array. When NOT wraps a complex subtree, the label is `NOT` and children are preserved.

### Styling

- **Connected border.** Input and breakdown share a single visual container. Use matching `border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900` for both. When the breakdown is showing, the input has no bottom border-radius or bottom border, and the breakdown has no top border-radius or top border — they meet seamlessly.
- **Monospace labels and counts.** Term labels and match counts use `font-mono text-xs` with `tabular-nums` for count alignment, consistent with current styling.
- **Right-aligned counts.** All counts are right-aligned. `flex justify-between` per row, as today.
- **Indentation.** Mixed-tree child nodes are indented (e.g., `padding-left: depth * 1.25rem`), consistent with current tree rendering.
- **Summary separator.** A thin `border-t` divides term rows from the summary line.
- **Summary line.** The summary label (ALL/ANY/FINAL or none) is on the left. The `N cards (M faces)` text is on the right. The summary may use a slightly muted or distinct style to differentiate it from term rows.
- **Zero-match highlighting.** Nodes with `matchCount === 0` remain highlighted in amber, as today.
- **Summary line as toggle.** The summary line has `cursor-pointer` and a subtle hover state to indicate interactivity. The chevron is small and muted, sitting at the far right or left of the summary line.

### Removed elements

The following elements from the current breakdown (Spec 009) are removed:

- **"Query breakdown" header.** The panel needs no title — its position directly under the input makes its purpose self-evident.
- **"show breakdown" / "hide breakdown" toggle links** in the results header and empty-state area. The breakdown is always visible (unless the user collapses the drawer).
- **"Syntax help" and "Report a problem" footer links** inside the breakdown panel. These are available elsewhere (help icon in the input).

## Implementation Plan

### 1. Wire protocol (`shared/src/worker-protocol.ts`)

Add the `type` field to `BreakdownNode`.

### 2. Worker label generation (`app/src/worker.ts`)

- Set `type` on each `BreakdownNode` from the AST node's type.
- For NOT nodes wrapping a leaf: emit a merged node with `type: 'NOT'`, `label: '-${childLabel}'`, `matchCount` from the NOT node, and no `children`.
- For NOT nodes wrapping a complex subtree: emit `type: 'NOT'`, `label: 'NOT'`, with children.

### 3. Breakdown display logic (`app/src/App.tsx`)

Replace the current `QueryBreakdown`, `BreakdownTree`, and `BreakdownRow` components with a new implementation:

- **Case detection.** Examine the root `BreakdownNode` to determine which display case applies (single, flat AND, flat OR, mixed).
- **Flat rendering.** For cases 1–3, render a flat list of children (or the single node) with a summary row.
- **Tree rendering.** For case 5, render the indented tree with a summary row.
- **Summary label.** Derive from root type and tree structure: none (single), ALL (flat AND), ANY (flat OR), FINAL (mixed).
- **Summary counts.** Card count from `results().length`, face count from `totalMatches()`.

### 4. Input/breakdown container (`app/src/App.tsx`)

Wrap the search input and breakdown in a shared container. Conditionally apply border-radius classes:

- Breakdown visible: input gets `rounded-t-xl`, breakdown gets `rounded-b-xl`.
- Breakdown hidden/collapsed: input gets `rounded-xl`.

### 5. Drawer state (`app/src/App.tsx`)

- Add a `breakdownExpanded` signal, initialized from `localStorage`.
- Persist changes to `localStorage` on toggle.
- Render the collapse rail with a chevron. When collapsed, hide the breakdown rows but keep the rail visible below the input.

### 6. Cleanup

- Remove the `showBreakdown` signal and all toggle links ("show breakdown" / "hide breakdown").
- Remove the "Query breakdown" header and footer (syntax help, report links) from the breakdown panel.
- Remove the `QueryBreakdown` panel's standalone rounded-border styling (it's now part of the input container).

## Acceptance Criteria

1. When the user types a query and results arrive, the breakdown panel appears directly below the input with no gap, forming a single visual element.
2. A single-term query shows one term row and an unlabeled summary line with card and face counts.
3. A flat AND query (e.g., `t:creature c:green`) shows term rows and an ALL summary line.
4. A flat OR query (e.g., `c:green OR c:white`) shows term rows and an ANY summary line.
5. A bare regex query (e.g., `/giant/`) shows the three expanded field children (name, type, oracle) with an ANY summary line.
6. A NOT-leaf (e.g., `-c:red`) displays as a single row with the `-` prefix and the NOT node's match count.
7. A nested query shows the full indented tree with AND/OR parent labels. The summary label is ALL (homogeneous AND), ANY (homogeneous OR), or FINAL (mixed AND/OR).
8. The summary line shows `<card_count> cards (<face_count> faces)` using the deduplicated card count and total face match count.
9. Nodes with zero matches are highlighted in amber.
10. The breakdown is collapsible by tapping anywhere on the summary line. The collapsed/expanded state is persisted to `localStorage`.
11. When collapsed, the summary line remains visible below the input (with connected styling), showing the card/face counts. Only the per-term rows are hidden.
12. The `BreakdownNode` type includes a `type` field matching the AST node type.
13. The old toggle links ("show/hide breakdown"), panel header, and panel footer are removed.

## Implementation Notes

- 2026-02-22: The summary label was simplified to always read **MATCHES** regardless of query structure (instead of ALL/ANY/FINAL as originally designed). The structural distinction added cognitive overhead without clear user benefit — "MATCHES" is universally understandable. The acceptance criteria above (items 2–4, 7) still describe the original ALL/ANY/FINAL labels for historical context; the as-built behavior uses MATCHES everywhere.
