# Spec 027: Terms Drawer

**Status:** Implemented

**Depends on:** Spec 026 (Results Box with Options Drawer)

## Goal

Add a collapsible "TERMS" drawer above the search input that provides one-tap access to commonly used format and type filters. The drawer surfaces the query syntax that power users type manually, making it discoverable to newcomers while remaining useful as a shortcut for experienced users.

## Background

Frantic Search already provides interactive drill-down for **color identity** and **mana value** via the STATS panel (Spec 025). Format legality and card type are the other two most common filtering axes, but they have no equivalent shortcut — users must know and type the syntax (`f:commander`, `t:creature`, etc.).

A collapsible drawer above the input solves this gap. Placing it above the input (rather than below, like STATS) means it is present on the landing page before the user types anything, serving as both a discovery mechanism and a quick-start tool. The toggle row is always visible; the chip content is revealed on demand. The chips double as syntax documentation: clicking `f:standard` teaches the user that `f:` is the format prefix.

### Precedents

| System | Feature | Behavior |
|---|---|---|
| Scryfall | "Advanced Search" page | Separate page with dropdowns; not inline |
| Google | Search chips below the input | Quick filters for Images, News, etc. |
| App stores | Category pills | Tappable pills above results grid |

## Design

### Placement and chrome

The TERMS drawer is the **topmost element** inside the search input container. It sits above the `<input>` element and below the header art/title, inside the same `rounded-xl` bordered box that wraps the input and MATCHES breakdown. The full vertical structure of the search box becomes:

```
┌─ Search Box (single rounded-xl container) ──────────┐
│ ▸ TERMS                                              │
├──────────────────────────────────────────────────────┤
│  (when expanded)                                     │
│  [f:standard]         │  [t:creature]                │
│  [f:pioneer]          │  [t:instant]                 │
│  [f:modern]           │  [t:sorcery]                 │
│  [f:commander]        │  [t:artifact]                │
│  [f:pauper]           │  [t:enchantment]             │
│  [f:legacy]           │  [t:land]                    │
│                       │  [t:planeswalker]            │
├──────────────────────────────────────────────────────┤
│  [🔍 Search input field                           ?] │
│  [MATCHES breakdown — collapsible]                   │
└──────────────────────────────────────────────────────┘
```

- **Label:** "TERMS" appears next to the chevron on the toggle row.
- **Chevron:** Points right (▸) when collapsed, rotates 90° (▾) when expanded. Same SVG and transition as STATS and RESULTS.
- **Help link:** A right-aligned "Syntax help" text link sits at the far end of the toggle row. Clicking it navigates to the syntax help view. The click uses `stopPropagation` so it does not toggle the drawer. This replaces the `?` icon that previously sat inside the search input field.
- **Toggle target:** Clicking anywhere on the toggle row (except the Help link) expands/collapses the drawer.
- **Separator:** A `border-b` divider always separates the TERMS toggle row from the input field below, regardless of whether the drawer is expanded or collapsed.

### Visibility

The TERMS drawer is **always rendered** — on the landing page, while a query is active, and even when results are empty. It is the only drawer visible before the user types anything. This is intentional: it serves as an invitation to explore.

The drawer is **not** rendered on non-search views (help, card detail, bug report).

### Default state

The drawer **begins collapsed** for new users. The toggle row is visible, but the chip content is hidden until the user clicks to expand. This keeps the landing page clean while signaling that more options exist.

The expanded/collapsed state is persisted to `localStorage` under the key `frantic-terms-expanded`, using the same pattern as the other collapsible sections:

```typescript
const [termsExpanded, setTermsExpanded] = createSignal(
  localStorage.getItem('frantic-terms-expanded') === 'true'
)
```

This evaluates to `false` when the key is absent (new user) or explicitly `'false'`, and `true` only when the user has previously expanded and left it open. This matches the RESULTS options drawer default (collapsed).

### Two-column layout

When expanded, the drawer content uses a two-column grid (`grid grid-cols-2`) mirroring the STATS panel layout:

- **Left column:** Format chips (`f:` terms).
- **Right column:** Type chips (`t:` terms).

No column headers are rendered. The `f:` and `t:` prefixes on the chips themselves make the grouping self-evident — users either recognize the syntax or learn it instantly by tapping a chip and observing the results.

### Chip list

**Formats (left column):**

| Chip label | Appended term | Meaning |
|---|---|---|
| `f:standard` | `f:standard` | Legal in Standard |
| `f:pioneer` | `f:pioneer` | Legal in Pioneer |
| `f:modern` | `f:modern` | Legal in Modern |
| `f:commander` | `f:commander` | Legal in Commander |
| `f:pauper` | `f:pauper` | Legal in Pauper |
| `f:legacy` | `f:legacy` | Legal in Legacy |

**Types (right column):**

| Chip label | Appended term | Meaning |
|---|---|---|
| `t:creature` | `t:creature` | Type line contains "creature" |
| `t:instant` | `t:instant` | Type line contains "instant" |
| `t:sorcery` | `t:sorcery` | Type line contains "sorcery" |
| `t:artifact` | `t:artifact` | Type line contains "artifact" |
| `t:enchantment` | `t:enchantment` | Type line contains "enchantment" |
| `t:land` | `t:land` | Type line contains "land" |
| `t:planeswalker` | `t:planeswalker` | Type line contains "planeswalker" |

The chip label and the appended term are identical — the chip displays the raw query syntax. This reinforces syntax learning.

### Chip styling

Each chip is a small clickable pill:

- `inline-flex items-center px-2 py-0.5 rounded text-xs font-mono`
- Background: `bg-gray-100 dark:bg-gray-800`
- Hover: `hover:bg-gray-200 dark:hover:bg-gray-700`
- Text: default text color (inherits from parent)
- Cursor: `cursor-pointer`
- Transition: `transition-colors`

Chips within each column are laid out with `flex flex-wrap gap-1.5`.

### Chip interaction

Clicking a chip appends the corresponding term to the current query, using the same append logic as the STATS panel (Spec 025):

1. If the query is empty, the term becomes the entire query.
2. If the current query's breakdown root is an `OR` node, the existing query is wrapped in parentheses before appending.
3. Otherwise, the term is appended with a leading space.

This reuses the existing `appendQuery` function in `App.tsx`.

## Implementation Plan

### 1. State and persistence (`app/src/App.tsx`)

Add a `termsExpanded` signal initialized from `localStorage`:

```typescript
const [termsExpanded, setTermsExpanded] = createSignal(
  localStorage.getItem('frantic-terms-expanded') === 'true'
)
function toggleTerms() {
  setTermsExpanded(prev => {
    const next = !prev
    localStorage.setItem('frantic-terms-expanded', String(next))
    return next
  })
}
```

### 2. TermsDrawer component (`app/src/TermsDrawer.tsx`)

New component with props:

```typescript
{
  expanded: boolean
  onToggle: () => void
  onChipClick: (term: string) => void
}
```

The component renders:

- A toggle row with chevron and "TERMS" label, matching the STATS/RESULTS toggle row style.
- When expanded, a `border-t` separated content area with a two-column grid of chips.
- The chip data is defined as static arrays within the component (no props needed — the terms are fixed).

### 3. Integration into the search box (`app/src/App.tsx`)

Insert `<TermsDrawer>` as the first child of the search input container `<div>` (the `rounded-xl` bordered box). The existing input field and MATCHES breakdown follow below it.

Current structure:

```
<div class="overflow-hidden rounded-xl border ...">
  <div class="relative">  <!-- input wrapper -->
    <input ... />
    ...
  </div>
  <Show when={breakdown()}>
    <InlineBreakdown ... />
  </Show>
</div>
```

New structure:

```
<div class="overflow-hidden rounded-xl border ...">
  <TermsDrawer
    expanded={termsExpanded()}
    onToggle={toggleTerms}
    onChipClick={appendQuery}
  />
  <div class="relative border-t border-gray-200 dark:border-gray-700">  <!-- input wrapper -->
    <input ... />
    ...
  </div>
  <Show when={breakdown()}>
    <InlineBreakdown ... />
  </Show>
</div>
```

The input wrapper gains a `border-t` to create the separator between the TERMS toggle row and the input field.

### 4. Styling

- Toggle row: same classes as STATS and RESULTS (`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`).
- Chevron: same SVG, `size-2.5 fill-current text-gray-500 dark:text-gray-400 transition-transform`, `rotate-90` when expanded.
- Label: `font-mono text-xs text-gray-500 dark:text-gray-400`.
- Content area: `grid grid-cols-2 gap-4 px-3 pb-2 border-t border-gray-200 dark:border-gray-700 pt-2` (matching STATS expanded area).
- Chips: `inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-colors`.

## Acceptance Criteria

1. A collapsible "TERMS" toggle row appears above the search input field, inside the same bordered container.
2. The TERMS toggle row is visible on the landing page (before any query is typed), on active queries, and on zero-results — but not on help, card detail, or bug report views.
3. A `border-b` separator always divides the TERMS toggle row from the input field below.
4. Clicking anywhere on the toggle row (except the Help link) expands or collapses the drawer.
5. The drawer begins collapsed for new users (no `localStorage` entry).
6. The expanded/collapsed state is persisted to `localStorage` under `frantic-terms-expanded`.
7. When expanded, the drawer shows two columns: format chips (left, 6 chips) and type chips (right, 7 chips). No column headers are rendered.
8. Chips display raw query syntax (`f:standard`, `t:creature`, etc.) in monospace text.
9. Clicking a chip appends the corresponding term to the current query using the standard append logic (parenthesizing when the breakdown root is OR).
10. The two-column layout mirrors the STATS panel grid and compresses on narrow viewports rather than stacking.
11. All styling (toggle row, chevron, label, content grid) is consistent with the existing STATS and RESULTS drawers.
12. A right-aligned "Syntax help" text link in the TERMS toggle row navigates to the syntax help view. The `?` icon previously inside the search input field is removed.
