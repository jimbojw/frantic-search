# Spec 079: Consolidated Query Accordion

**Status:** Implemented

**Depends on:** Spec 021 (Inline Query Breakdown), Spec 054 (Pinned Search Criteria)

**References:** [Issue #88](https://github.com/jimbojw/frantic-search/issues/88)

## Goal

Replace the two separate collapsible panels (PINNED and MATCHES) with a single unified accordion. This reduces vertical space on mobile and desktop by collapsing two headers into one, while preserving all functionality and feedback.

## Background

### Current behavior

Spec 054 introduced a PINNED drawer that appears above the MATCHES drawer when the pinned query is non-empty. Each drawer has its own:

- Summary lip (label, card count, printing count, error count, expand toggle)
- Expandable content (breakdown chips)
- Persisted expand state (`frantic-pinned-expanded`, `frantic-breakdown-expanded`)

On mobile, two accordion headers push the search results further down the page.

### Problem

Vertical screen real estate is at a premium on mobile devices. Two separate accordion headers and panels consume space before the user reaches the actual search results. The information density of the collapsed state can be improved by consolidating both summaries into a single, denser header.

## Design

### Unified accordion structure

A single collapsible panel replaces both PINNED and MATCHES drawers. One expand toggle controls visibility of all query tokens (pinned and live).

**Collapsed state (summary footer):** A single clickable summary row displays dense information. When both pinned and live content exist, the summary shows two stacked rows. When only one exists, a single row is shown.

**Expanded state:** Pinned chips first, a visual divider, then live chips. Same chip behavior as today (pin/unpin, remove, syntax highlighting, error states).

### Summary footer layout

The summary footer is the always-visible row at the bottom of the accordion. It serves as the expand/collapse toggle.

#### When both pinned and live exist

Two rows, stacked vertically:

| Row | Label | Content | Visual weight |
|-----|-------|---------|---------------|
| 1 | `PINNED` (with pin icon) | `N cards (M printings)` + optional `· X ignored` | Secondary (muted) |
| 2 | `MATCHES` | `J cards (K printings)` + optional `· Y ignored` | Primary (higher contrast) |

Example:

```
[pin icon] PINNED           1,234 cards (1,500 printings)
 MATCHES [1 ignored]        456 cards (520 printings)
```

The chevron (▾/▸) appears once, vertically centered relative to the footer content: when there is one row, it aligns with that row; when there are two rows, it sits between them. Tapping anywhere on the footer toggles expansion.

#### When only pinned exists

Single row:

```
[pin icon] PINNED           1,234 cards (1,500 printings)
```

#### When only live exists

Single row:

```
 MATCHES [2 ignored]        456 cards (520 printings)
```

#### Error bubbling

Validation feedback (e.g., ignored/error tokens) must appear in the collapsed summary so users know a token failed without expanding. Each row shows its own error count when `countErrors(breakdown) > 0`, using the existing `· N ignored` pattern. The MATCHES row is the primary surface for live-query errors; the PINNED row for pinned-query errors.

### Expanded panel layout

When expanded, the panel uses a two-column layout:

**Left column (chips):**
1. **Pinned chips** (when `pinnedBreakdown` is present) — same rendering as today: `BreakdownChip` / `ChipTreeNode` with `pinned={true}`, unpin-on-click, × to remove.
2. **Visual divider** — a subtle horizontal rule (`<hr>`) or equivalent structural separation. Shown only when both pinned and live sections are present.
3. **Live chips** (when live query is non-empty and `breakdown` is present) — same rendering as today: `BreakdownChip` / `ChipTreeNode` with `pinned={false}`, pin-on-click, × to remove.

**Right column (action links):**

Implemented via `ResultsActionsColumn` (Spec 152), shared with the Results Summary Bar:
- **Try on Scryfall ↗** — Outlink to Scryfall search with the effective query. Styling: `text-blue-500 hover:text-blue-600`.
- **Syntax help** — Shown when `navigateToDocs` present; navigates to `?doc=reference/syntax`.
- **Report a problem** — Button with bug icon that navigates to the bug report page. Styling: muted (`text-gray-400`).

The links stack vertically. `ResultsActionsColumn` uses `useSearchContext()` for `scryfallUrl()`, `navigateToDocs`, and `navigateToReport()`.

Padding and spacing match the current per-drawer styling (`px-3 pt-1.5 pb-1` or equivalent).

### Visibility rules

The consolidated accordion is shown when **either**:

- `pinnedBreakdown` is present (pinned query is non-empty), or
- `query.trim() !== ''` and `breakdown` is present (live query has results)

When both are empty, no accordion is shown (same as today).

### Expand state and persistence

A single expand state replaces the two existing states. Persisted to `localStorage` as `frantic-breakdown-expanded`.

**Migration:** On first load after this change, if either `frantic-pinned-expanded` or `frantic-breakdown-expanded` exists:

- If either is `'true'`, set `frantic-breakdown-expanded` to `'true'`.
- Otherwise, set to `'false'` (or omit; default is expanded per current behavior).

After migration, remove reads of the old keys. Optionally clear the old keys on next write to avoid clutter.

**Default:** Expanded (same as current `frantic-breakdown-expanded !== 'false'`). Users who had both collapsed will see expanded on first load; acceptable trade-off for simpler state.

### Visual hierarchy

The MATCHES row should read as primary when both rows are present. Implementation options:

- Slightly bolder font weight on MATCHES
- Higher contrast text color on MATCHES (e.g., `text-gray-700` vs `text-gray-500` for PINNED)
- Slightly larger font size on MATCHES

The PINNED row remains readable but visually secondary. Exact styling is an implementation detail; the spec requires that the hierarchy is perceptible.

### Component structure

Introduce a `UnifiedBreakdown` component (or equivalent name) that:

- Accepts props for pinned breakdown, live breakdown, counts, and callbacks (pin, unpin, remove)
- Renders the two-row (or one-row) summary footer
- Renders the expanded content: pinned chips + divider + live chips
- Owns the single expand state

`PinnedBreakdown` and `InlineBreakdown` can be refactored into internal sub-renderers or inlined; the external API from `App.tsx` becomes a single `<UnifiedBreakdown ... />` call.

## Scope of changes

| File | Change |
|------|--------|
| `app/src/App.tsx` | Replace `PinnedBreakdown` + `InlineBreakdown` with `UnifiedBreakdown`; collapse to single expand signal; migration logic for localStorage |
| `app/src/UnifiedBreakdown.tsx` | New component: two-row footer, expanded content with divider |
| `app/src/InlineBreakdown.tsx` | Extract shared chip/lip logic if needed; `PinnedBreakdown` may be removed or reduced to a sub-component |
| `app/src/PinnedBreakdown.tsx` | Remove or fold into `UnifiedBreakdown` |

No worker protocol changes. No changes to `query-edit`, `worker`, or shared packages.

## Acceptance Criteria

1. The two existing query accordions (PINNED and MATCHES) are merged into a single accordion.
2. The accordion footer displays two tight rows when both pinned and live content exist: PINNED row (secondary) and MATCHES row (primary).
3. When there is no pinned query, only the MATCHES row is displayed in the footer.
4. When there is no live query (but pinned exists), only the PINNED row is displayed in the footer.
5. Error states (ignored terms) bubble up to the collapsed footer: each row shows `· N ignored` when its breakdown has errors.
6. When expanded, Pinned chips and Live chips are grouped separately within the same container, with a visual divider between them.
7. A single expand/collapse toggle controls visibility of all chips. The expand state is persisted to `frantic-breakdown-expanded`.
8. Migration from the two previous localStorage keys results in expanded state if either was expanded.
9. Pin, unpin, and remove interactions behave identically to the current implementation.
10. The accordion is visible when either pinned or live content exists; hidden when both are empty.
11. When expanded, a right column shows "Try on Scryfall ↗" and "Report a problem" (with bug icon) links. Try on Scryfall opens the effective query in Scryfall; Report a problem navigates to the bug report page. Links always stack vertically.
