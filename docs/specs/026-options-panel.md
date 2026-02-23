# Spec 026: Results Box with Options Drawer

**Status:** Implemented

**Depends on:** Spec 021 (Inline Query Breakdown), Spec 025 (Results Breakdown)

## Goal

Wrap the card results list in a unified "RESULTS" container with a collapsible options drawer. The drawer provides a home for display-related toggles (starting with Oracle Text) and replaces the standalone results header row. The standalone Scryfall link is removed from the results area at the same time.

## Background

The search input and MATCHES breakdown already form a single contiguous visual element — the input is the top of the box and the MATCHES summary line is the bottom. The results list, by contrast, has a loose header row (Scryfall link, Oracle Text toggle) sitting above a separately-bordered card list.

This spec unifies the results list, histograms, and display options into a single bordered container, mirroring the input/MATCHES pattern:

- The **RESULTS** toggle row is the "lid" of the container.
- The **drawer** expands below the lid when toggled, containing the histograms (Spec 025) and the Oracle Text toggle.
- The **card rows** fill the rest of the container.

This creates a clean vertical rhythm: Input+MATCHES → MAP → RESULTS (histograms + options + cards).

## Design

### Layout

The full vertical stack when a query has results:

```
┌─ Search Input ──────────────────────────────────────┐
│  [Search input field]                               │
│  [MATCHES breakdown — collapsible]                  │
└─────────────────────────────────────────────────────┘

┌─ MAP ───────────────────────────────────────────────┐
│  (density map canvases — visible even without query)│
└─────────────────────────────────────────────────────┘

┌─ RESULTS ───────────────────────────────────────────┐
│ ▾ RESULTS                                      [⚙]  │
├─────────────────────────────────────────────────────┤
│  (when expanded — default)                          │
│  [Color Identity] [Mana Value] [Card Type]          │
│  (histograms — Spec 025)                            │
│  Oracle text                            [toggle]    │
├─────────────────────────────────────────────────────┤
│  Card row 1                                         │
│  Card row 2                                         │
│  Card row 3                                         │
│  …                                                  │
└─────────────────────────────────────────────────────┘
```

The RESULTS container is a single `rounded-xl` bordered box. The toggle row, options area, and card list are all part of this one element — they share the same border, background, and shadow. This mirrors how the search input and MATCHES breakdown form one contiguous box.

### RESULTS toggle row

The toggle row sits at the top of the RESULTS container. It has three elements:

- **Chevron** (left): Points right (▸) when options are collapsed, rotates 90° (▾) when expanded. Same SVG and transition as the STATS panel.
- **Label** (left, after chevron): "RESULTS" in `font-mono text-xs` muted text, matching the MATCHES and STATS label style.
- **Gear icon** (right-aligned): A small gear/cog icon signaling that clicking the row reveals settings. The icon uses the same muted color as the label (`text-gray-500 dark:text-gray-400`).

Clicking **anywhere on the toggle row** expands or collapses the options drawer. The entire row is the click target, not just the chevron or gear.

### Drawer contents

When expanded, the drawer area appears between the toggle row and the first card row, separated by `border-t` dividers. It contains two sections:

1. **Histograms** (Spec 025) — a three-column grid of bar charts (Color Identity, Mana Value, Card Type).
2. **Oracle Text toggle** — below the histograms.

```
│ ▾ RESULTS                                      [⚙]  │
├─────────────────────────────────────────────────────┤
│  [Color Identity] [Mana Value] [Card Type]          │
│  Oracle text                            [=====○]    │
├─────────────────────────────────────────────────────┤
│  Card row 1                                         │
```

When collapsed, the toggle row connects directly to the first card row — both histograms and the Oracle Text toggle are hidden:

```
│ ▸ RESULTS                                      [⚙]  │
├─────────────────────────────────────────────────────┤
│  Card row 1                                         │
```

The toggle styling reuses the existing switch: `peer sr-only` input, colored track (`bg-gray-300` / `peer-checked:bg-blue-500`), sliding knob. The label uses `text-sm text-gray-700 dark:text-gray-300`.

### Default state

The drawer **begins expanded**. The histograms provide immediate value on every query — the user sees the color, mana value, and type distributions at a glance. The expanded/collapsed state is persisted to `localStorage` under the key `frantic-results-options-expanded`.

Since `localStorage` returns `null` for a never-set key, the initialization logic defaults to expanded:

```typescript
const [resultsOptionsExpanded, setResultsOptionsExpanded] = createSignal(
  localStorage.getItem('frantic-results-options-expanded') !== 'false'
)
```

This evaluates to `true` when the key is absent (new user) or explicitly `'true'`, and `false` only when the user has previously collapsed the drawer.

### Contiguous container

The RESULTS box replaces the current standalone `<ul>` that holds card rows. Today the `<ul>` has its own `rounded-xl` border. In the new design:

- The outer container gets `rounded-xl`, border, background, and shadow.
- The RESULTS toggle row is the first child.
- The options drawer (when expanded) is the second child.
- Card rows follow, separated by `divide-y` dividers as today.
- The "…and N more" indicator remains the last row.

The `<ul>` element may remain for semantics but should not carry its own border/rounding — the parent container handles all chrome.

### Visibility

The RESULTS box (including the toggle row) is rendered whenever there is a query with `totalCards() > 0`. It is **not** rendered on the empty-query landing page, the zero-results state, or non-search views (help, card detail, bug report).

## Removed Elements

### Scryfall link (results header)

The `Scryfall ↗` link that currently appears to the left of the Oracle Text toggle in the results header row is removed. The link remains in the **zero-results** state ("Try on Scryfall ↗") where it serves as a useful escape hatch.

### Results header row

The `<div class="flex items-center justify-between mb-3">` wrapper that held the Scryfall link and oracle text toggle is removed entirely. Its functionality is absorbed by the RESULTS toggle row and options drawer.

## Implementation Plan

### 1. Restructure the results container (`app/src/App.tsx`)

Replace the current structure:

```
<div> (results header — Scryfall link + Oracle toggle) </div>
<ResultsBreakdown />  (standalone STATS box)
<ul> (card rows) </ul>
```

With:

```
<div> (RESULTS box — single rounded container)
  <ResultsToggleRow />  (RESULTS label + gear icon, click to expand/collapse)
  <Show when={resultsOptionsExpanded}>
    <ResultsBreakdown />  (histograms — Spec 025)
    <OptionsDrawer />     (Oracle Text toggle)
  </Show>
  <ul> (card rows — no own border/rounding)
  </ul>
</div>
```

### 2. State and persistence (`app/src/App.tsx`)

Add a `resultsOptionsExpanded` signal initialized from `localStorage` (defaulting to `true`):

```typescript
const [resultsOptionsExpanded, setResultsOptionsExpanded] = createSignal(
  localStorage.getItem('frantic-results-options-expanded') !== 'false'
)
function toggleResultsOptions() {
  setResultsOptionsExpanded(prev => {
    const next = !prev
    localStorage.setItem('frantic-results-options-expanded', String(next))
    return next
  })
}
```

### 3. RESULTS toggle row

Render inline in `App.tsx` (or extract to a small component). The row contains:

- Chevron SVG (same as STATS/MATCHES).
- "RESULTS" label in `font-mono text-xs`.
- Right-aligned gear icon SVG.
- Full-row click handler calling `toggleResultsOptions()`.

### 4. Options drawer

When `resultsOptionsExpanded` is true, render a `border-t` section between the toggle row and the card list containing:
1. The `ResultsBreakdown` component (histograms — Spec 025).
2. The Oracle Text toggle (moved from the old header row, styling preserved).

### 5. Card list

The existing `<ul>` loses its own `rounded-xl border shadow-sm` classes. These move to the parent RESULTS container. The `<ul>` retains `divide-y` for row separators. The "…and N more" row stays as-is.

### 6. Cleanup

- Remove the old results header `<div>` (Scryfall link + Oracle toggle).
- Remove the `scryfallUrl` computed value if no longer referenced (it is still used in the zero-results state, so keep it).

## Acceptance Criteria

1. When a query produces results, the card list is wrapped in a single bordered container with a "RESULTS" toggle row at the top.
2. The RESULTS toggle row shows a chevron, the label "RESULTS", and a right-aligned gear icon.
3. Clicking anywhere on the RESULTS toggle row expands or collapses the drawer.
4. The drawer **begins expanded** for new users (no `localStorage` entry).
5. The expanded/collapsed state is persisted to `localStorage` under `frantic-results-options-expanded`.
6. When expanded, the drawer appears between the toggle row and the first card row, containing the histograms (Spec 025) and the Oracle Text toggle — in that order.
7. Collapsing the drawer hides both the histograms and the Oracle Text toggle.
8. The RESULTS container (toggle row + drawer + card rows) is visually contiguous — one `rounded-xl` border, shared background, no gaps.
9. There is no standalone "STATS" box — the histograms live entirely within the RESULTS drawer.
10. The standalone Scryfall link is removed from the results area.
11. The "Try on Scryfall ↗" link in the zero-results state is unchanged.
12. The RESULTS box is not rendered on the landing page, zero-results state, or non-search views.
