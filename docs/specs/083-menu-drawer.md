# Spec 083: MenuDrawer

**Status:** Implemented

**Depends on:** Spec 081 (Side Panel Scrollspy), Spec 038 (Collapsible Sparkline Histograms), Spec 041 (Result Display Modes)

**Modifies:** Spec 038 (toolbar removal), Spec 016 (Report Bug entry points), Spec 026 (Options Panel), Spec 041 (view mode toggle location), Spec 058 (adds `v:` alias for `view:`)

**Extended by:** Spec 084 (MenuDrawer View Consolidation — unique row, include:extras in VIEWS), Spec 102 (EDHREC and Salt Percentile Chips)

## Goal

Consolidate the terms panel and results toolbar into a single MenuDrawer. The drawer becomes the primary hub for view controls, outlinks, and filter chips. This removes the toolbar between histograms and the card list, simplifying the results area while keeping all controls accessible from the menu.

## Background

### Current behavior

- **TermsDrawer** (Spec 081): A two-column scrollspy panel with eight TERMS sections (formats, layouts, roles, lands, rarities, printings, prices, sort) and a sticky footer (Syntax Help, Report Bug). Opened via the hamburger menu (collapsed header) or filter icon (expanded header).
- **Results toolbar** (Spec 038): A row between the histogram area and the card list containing "Try on Scryfall ↗", Report Bug button, and ViewModeToggle (Slim | Detail | Images | Full). Always visible when a query has been run, regardless of histogram expanded/collapsed state.

### Problem

The toolbar and the terms panel serve related purposes (tools and filters) but live in separate places. The toolbar consumes vertical space between histograms and results. As more tools are added, the layout fragments further. Consolidating into a single MenuDrawer simplifies the UI and creates a natural home for future tools.

## Design

### Section order (top to bottom)

1. **VIEWS** — View mode chips: `v:slim`, `v:detail`, `v:images`, `v:full`. Same behavior as the current ViewModeToggle — tapping a chip updates or appends the view term in the query. The `v:` alias (Spec 058) is used for chip labels. Controls how each card row is rendered and whether oracle text is shown (Spec 041).
2. **TOOLS** — Try on Scryfall ↗ outlink. Opens the current effective query in Scryfall search (Spec 052).
3. **TERMS** — All eight sections from Spec 081: formats, layouts, roles, lands, rarities, printings, prices, sort. Layout, scrollspy, and chip behavior unchanged.
4. **Sticky footer** — Syntax Help, Report Bug. Unchanged from Spec 081.

### Header

- **Label:** "Menu" (replaces "Terms"). Matches the hamburger affordance and reflects the drawer's broader scope.
- **Close button:** Unchanged. `aria-label="Close filters"` remains appropriate.

### Left rail layout

The left rail (navigation column) lists section labels only. VIEWS and TOOLS are sections like FORMATS, LAYOUTS, etc. — a unified scrollspy menu system:

```
┌─ Left rail ─────────┐
│ views              │
│ tools              │
│ formats            │
│ layouts            │
│ roles              │
│ lands              │
│ rarities           │
│ printings          │
│ prices             │
│ sort               │
│ ─────────────────── │
│ Syntax Help        │  ← sticky footer
│ Report Bug         │
└─────────────────────┘
```

Tapping a section scrolls the right content area to that section. Scrollspy highlights the active section as the user scrolls. Sticky footer unchanged.

### Right content area

All sections (VIEWS, TOOLS, plus the eight TERMS sections) in one scroll container with IntersectionObserver-based scrollspy:

```
VIEWS
[v:slim] [v:detail] [v:images] [v:full]

TOOLS
[Try on Scryfall ↗]

FORMATS
[f:commander] [f:modern] ... [include:extras]

LAYOUTS
[is:dfc] [is:transform] ...
...
```

**VIEWS:** Four chips: `v:slim`, `v:detail`, `v:images`, `v:full`. Active chip (matching effective view mode) is highlighted; tapping a chip calls `setViewTerm` (or equivalent). Chip labels use the `v:` alias.

**TOOLS:** "Try on Scryfall ↗". Styling: `text-blue-500 hover:text-blue-600`. Uses `Outlink` component (`target="_blank"`). (My List moved to header button per Spec 090.)

**TERMS:** Chip behavior (tri-state, modifiers, sort arrows) unchanged from Spec 044 and Spec 059.

### Data source for VIEWS and TOOLS

MenuDrawer is rendered within `SearchProvider` in both modal and inline contexts. It uses `useSearchContext()` to obtain:

- `scryfallUrl()` — for the Try on Scryfall link
- `viewMode()` — for which VIEWS chip is active (derived from effective query via `extractViewMode`)
- `changeViewMode` or `onSetQuery` + `setViewTerm` — for chip tap handler

No new props from `App.tsx` are required. The existing `query`, `onSetQuery`, `onHelpClick`, `onReportClick`, `onClose` props remain.

### Toolbar removal

The toolbar row in `SearchResults.tsx` (the flex container with Try on Scryfall, Report Bug, and ViewModeToggle) is **removed entirely**. The histogram area connects directly to the card list (or empty state). No spacer or divider between histograms and cards beyond any existing border.

### Zero-results escape hatch

When the result set is empty (`totalCards() === 0`), users are most likely to suspect a bug (Spec 016). The toolbar currently provides "Try on Scryfall ↗" and Report Bug at that moment. To preserve this flow without keeping the full toolbar:

A **compact inline row** appears below the "No cards found" message, containing:

- "Try on Scryfall ↗" link via `Outlink` (`href={scryfallUrl()}`)
- "Report a problem" button (`onClick={navigateToReport}`)

Styling: `text-sm` with muted colors (`text-gray-400 dark:text-gray-600`), inline flex with gap. Matches the density of the existing empty-state "Source on GitHub" / "Report a problem" row on the init page.

When results exist, these links are only available via the MenuDrawer.

### Dual contexts

The MenuDrawer appears in two contexts (Spec 081):

1. **Modal overlay** — When `termsExpanded && headerCollapsed`. Fixed aside, full height, slides in from right.
2. **Inline** — When `termsExpanded && !headerCollapsed`. Rendered above the search input, constrained to `max-h-96`.

Both contexts render the full MenuDrawer including VIEWS, TOOLS, TERMS, and footer. The layout must work in both; VIEWS and TOOLS add minimal height.

### Persistence

The `frantic-terms-tab` localStorage key stores the last active section (views, tools, or any terms section). On open, the panel scrolls to that section. View mode is derived from the query via `view:` or `v:` term (Spec 058).

### v: alias (Spec 058 extension)

Add `v:` as an alias for `view:` in the parser and evaluator. Both `view:slim` and `v:slim` are valid. The VIEWS chips display the shorter form (`v:slim`, `v:detail`, `v:images`, `v:full`) for consistency with other drawer terminology. When the user taps a chip, the app appends or replaces with `v:{mode}` (or `view:{mode}` — implementation may canonicalize). `extractViewMode` and all consumers (evaluator, canonicalize, query-for-sort) must recognize both field names.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/search/evaluator.ts` | Recognize `v:` in addition to `view:` for display-modifier FIELD nodes. |
| `shared/src/search/canonicalize.ts` | Strip `v:` in addition to `view:` from Scryfall outlinks. |
| `shared/src/search/query-for-sort.ts` | Strip `v:` in addition to `view:` when building sort seed. |
| `app/src/view-query.ts` | `collectViewValues` / `extractViewMode` recognize `v` field in addition to `view`. |
| `app/src/query-edit.ts` | Extend `VIEW_FIELDS` to `['view', 'v']`; `setViewTerm` clears both, appends `v:{mode}`. |
| `app/src/TermsDrawer.tsx` | Rename to `MenuDrawer.tsx`. Add VIEWS and TOOLS as first-class sections in the unified scrollspy: left rail lists section labels (views, tools, formats, …); right content renders VIEWS chips, TOOLS link, and eight TERMS sections. Change header label to "Menu". Use `useSearchContext()` for scryfallUrl, viewMode, changeViewMode. |
| `app/src/App.tsx` | Update import and component name from TermsDrawer to MenuDrawer. No new props. |
| `app/src/SearchResults.tsx` | Remove toolbar div (lines 119–139). Add zero-results inline row with Try on Scryfall and Report a problem below "No cards found". |
| `docs/specs/038-collapsible-sparkline-histograms.md` | Add "Modified by Spec 083" note: toolbar removed. |
| `docs/specs/016-bug-report.md` | Add menu drawer as Report Bug entry point. Note zero-results inline links. |
| `docs/specs/081-side-panel-scrollspy.md` | Add "Extended by Spec 083" note: TermsDrawer renamed to MenuDrawer, VIEWS and TOOLS added. |
| `docs/specs/041-result-display-modes.md` | Add note: view mode toggle now in MenuDrawer VIEWS section. |

## Acceptance Criteria

1. The terms panel is renamed to MenuDrawer. The header label reads "Menu".
2. The left rail contains section labels only: views, tools, formats, layouts, roles, lands, rarities, printings, prices, sort, followed by the sticky footer (Syntax Help, Report Bug). The right content area renders VIEWS (chips), TOOLS (Try on Scryfall link), and the eight TERMS sections in that order.
3. VIEWS chips (`v:slim`, `v:detail`, `v:images`, `v:full`) correctly control result display mode. Tapping a chip updates the query via `v:` or `view:` term (last one wins). The active chip reflects the effective view mode.
4. The Try on Scryfall link in TOOLS opens the effective query in Scryfall search in a new tab.
5. The toolbar between histograms and the card list is removed. Histograms connect directly to the card list.
6. When the result set is empty, a compact row below "No cards found" provides "Try on Scryfall ↗" and "Report a problem" links.
7. The MenuDrawer works correctly in both modal overlay and inline contexts.
8. TERMS sections, scrollspy, chip behavior, and sticky footer are unchanged from Spec 081.
9. Report Bug remains accessible from the menu footer and from the zero-results inline row. The init-page "Report a problem" link (next to Source on GitHub) is unchanged.
10. No new props are required from App; MenuDrawer uses SearchContext for scryfallUrl, viewMode, and changeViewMode.
