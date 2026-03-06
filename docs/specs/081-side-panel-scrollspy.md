# Spec 081: Side Panel Scrollspy

**Status:** Implemented

**Depends on:** Spec 044 (Terms Drawer Redesign)

**Extended by:** Spec 083 (MenuDrawer) — the panel is renamed to MenuDrawer. VIEWS (ViewModeToggle) and TOOLS (Try on Scryfall) sections are added above the TERMS categories. Header label changes from "Terms" to "Menu".

**References:** [Issue #87](https://github.com/jimbojw/frantic-search/issues/87)

## Goal

Replace the tabbed Terms panel with a scrollspy pattern: continuous scroll in the content area, anchor navigation from a left rail, active-state tracking from scroll position, independent scroll zones, and a sticky Help footer. This improves discoverability, reduces interaction cost, and prepares the panel for future app-level tools.

## Background

### Current behavior

Spec 044 introduced a tabbed layout for the Terms drawer. Eight sections (formats, layouts, roles, lands, rarities, printings, prices, sort) are accessed via discrete tabs. Only one section's chips are visible at a time. The help button sits in the header row.

### Problem

1. **Discoverability.** Users must tap each tab to see what filters exist. There is no way to rapidly scan all sections.
2. **Interaction cost.** Switching sections requires a tap; scrolling through a single view would be faster.
3. **Screen real estate.** As more tools are added to the panel, the tab list will grow. The layout must scale.
4. **Help placement.** The help button competes with the close button in the header. A dedicated Help section at the bottom of the rail keeps it accessible without cluttering the header.

## Design

### Layout structure

The panel retains a two-column layout: a left-hand **navigation rail** and a right-hand **content area**. Both columns scroll independently.

- **Parent container:** `flex flex-row` with `min-h-0` so children can shrink. Both columns use `flex-1 min-h-0` (or equivalent) to share vertical space.
- **Left rail:** `overflow-y-auto` — scrolls independently when the category list exceeds viewport height.
- **Right content:** `overflow-y-auto` — scrolls independently. Apply `scroll-smooth` for anchor link transitions.
- **Scroll padding:** Consider `scroll-pt-[value]` on the right container so anchor-scrolled sections are not obscured by any fixed header.

### Content area

The right-hand column renders **all eight sections** in one continuous scroll container. Section order matches the current `TABS` in `TermsDrawer.tsx`: formats, layouts, roles, lands, rarities, printings, prices, sort.

Each section:

- Has an `id` attribute matching the section key (e.g. `id="formats"`, `id="layouts"`).
- Contains a section heading (e.g. "Formats", "Layouts") and its chips.
- Preserves chip behavior from Spec 044: tri-state cycling, `unique:prints` and `include:extras` on modifier tabs (formats, roles, rarities, printings), sort chips with directional arrows.

Chip content and semantics are unchanged. Only the layout and navigation model change.

### Navigation rail

The left column contains:

1. **Category list** — One button per section. Labels: formats, layouts, roles, lands, rarities, printings, prices, sort (same as current tab labels).
2. **Active state** — The button for the section currently in view is highlighted (e.g. blue text/background, matching current active-tab styling).
3. **Click behavior** — Tapping a category scrolls the corresponding section into view via `element.scrollIntoView({ behavior: 'smooth' })`.
4. **Scrollspy** — As the user manually scrolls the right content, the active nav button updates to reflect the section in view.

The category list scrolls independently above the sticky footer (see below).

### Scrollspy implementation

Use `IntersectionObserver` with:

- **root:** The right-hand scroll container element (not the viewport).
- **rootMargin:** Tune to control when "active" flips. For example, `-10% 0px -80% 0px` makes the top ~10% of the visible area the "active" zone, so the first section that enters that zone becomes active.
- **threshold:** Or use `threshold` (e.g. 0.5) to require a section to be at least half-visible before it becomes active.

Observe each section element. When intersection state changes, update the active nav item. Disconnect observers on cleanup.

### Sticky Help footer

A dedicated "Help" section is pinned to the bottom of the left rail. It does not scroll with the category list.

- **Layout:** Use `flex flex-col` on the rail. The category list has `flex-1 min-h-0 overflow-y-auto`. The footer has `mt-auto` or `sticky bottom-0` so it stays at the bottom.
- **Content:** Two links:
  - **Syntax Help** — Calls `onHelpClick` (navigates to help view).
  - **Report Bug** — Calls `onReportClick` (navigates to report view).
- **Styling:** Muted, compact. Visually distinct from category buttons so it reads as a footer, not a category.

### Auto-scroll rail (stretch goal)

When scrollspy updates the active section (from manual scroll), the left rail may have scrolled such that the active nav button is off-screen. Optionally: when `activeSection` changes, call `scrollIntoView({ block: 'nearest' })` on the active nav button so it remains visible in the rail.

Document as optional. Implement if time permits.

### Props

Add `onReportClick` to the TermsDrawer interface:

```typescript
{
  query: string
  onSetQuery: (query: string) => void
  onHelpClick: () => void
  onReportClick: () => void
  onClose: () => void
}
```

`App.tsx` already has `navigateToReport`; pass it as `onReportClick`.

### Persistence

Repurpose `frantic-terms-tab` (localStorage) to store the last active section. When the panel opens, optionally scroll the content area so that section is in view. This preserves "remember where I was" behavior across sessions.

### Dual contexts

The Terms panel appears in two contexts:

1. **Modal overlay** — When `termsExpanded && headerCollapsed` (mobile, or desktop with collapsed header). Fixed aside, full height.
2. **Inline** — When `termsExpanded && !headerCollapsed`. Rendered above the search input, constrained height.

The scrollspy layout must work in both. In the inline case, vertical space is limited; both columns must scroll when content overflows. Ensure the flex/overflow setup behaves correctly in both contexts.

### Header row

The header row (Terms label, close button) remains. The help button moves from the header to the sticky footer. The header may retain a minimal help icon for discoverability, or rely entirely on the footer — implementation detail.

## Scope of Changes

| File | Change |
|------|--------|
| `docs/specs/081-side-panel-scrollspy.md` | This spec |
| `app/src/TermsDrawer.tsx` | Refactor: two-column scrollspy layout, render all sections, IntersectionObserver, sticky Help footer |
| `app/src/App.tsx` | Pass `onReportClick={navigateToReport}` to TermsDrawer |

No changes to `query-edit`, worker protocol, or shared packages. Chip components and logic are reused.

## Acceptance Criteria

1. The panel uses a two-column layout: left navigation rail, right content area. Both columns scroll independently when content overflows.
2. All eight sections (formats, layouts, roles, lands, rarities, printings, prices, sort) are rendered in the right content area in one continuous scroll container.
3. Tapping a category in the left rail smoothly scrolls the corresponding section into view in the right pane.
4. As the user scrolls the right content, the left rail's active state updates to highlight the section currently in view (scrollspy).
5. A sticky Help section at the bottom of the left rail contains links for Syntax Help and Report Bug. Both links navigate correctly.
6. Chip behavior (tri-state cycling, modifiers, sort arrows) is unchanged from Spec 044.
7. The panel works correctly in both modal overlay and inline contexts.
8. The close button remains functional.
9. The last active section is persisted to `frantic-terms-tab`; on open, the panel scrolls to that section when possible.
10. No new dependencies. Use native `IntersectionObserver`.

## Implementation Notes

- 2026-03-05: Implemented two-column scrollspy layout. Modal aside changed from `overflow-y-auto` to `overflow-hidden` so inner columns scroll independently. Inline context wrapped in `max-h-96` container for constrained height. Included stretch goal: active nav button auto-scrolls into view when scrollspy updates.
