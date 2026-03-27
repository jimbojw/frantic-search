# Spec 137: Persistent Search App Bar

**Status:** Implemented

**Depends on:** Spec 013 (URL State), Spec 086 (Dual Wield), Spec 129 (Back and Copy URL), Spec 027 (Terms Drawer), Spec 081 (Side Panel / MenuDrawer)

**Modifies:** Spec 129 (single-pane bar is persistent; layout unchanged), Spec 027 (filter icon removal; Menu sole entry point)

**Extended by Spec 143:** The app bar is first shown as a minimal shell placeholder (logo, nav placeholders) for fast first paint. Once the main App chunk loads, the full bar (per this spec) is rendered via Portal into the shell's header slot.

**Related:** [Spec 165](165-card-detail-app-bar-and-copy-menu.md) — same bar chrome portaled for card detail view.

## Goal

Make the top app bar persistent and predictable. The bar is always visible from first load, containing Home, Split View, My List, and Menu. Remove the redundant filter toggle inside the search box. Collapse the hero when the user types a query or opens the menu (not on focus alone — that was too aggressive).

## Background

### Current behavior

- The compact bar (Home, Split view, My list, Menu) appears only when `headerCollapsed` (user engaged).
- When the hero is visible (landing state), a filter icon (`IconAdjustmentsHorizontal`) appears inside the search box to open the MenuDrawer.
- Users must engage (focus, type, or open menu) before seeing the compact bar. The bar content shifts when the header collapses.

### Problem

1. **Discoverability.** Navigation affordances (My List, Menu) are hidden until the user engages. New users may not realize they exist.
2. **Redundancy.** Two entry points for filters: the filter icon (hero state) and the burger (collapsed state). The filter icon competes with the search input for attention.
3. **Predictability.** The bar appears and disappears based on engagement. A persistent bar is industry standard and reduces cognitive load.

## Design

### Persistent bar

The app bar is **always rendered** above the hero and search area. It uses the same height and styling as the current collapsed bar: `h-11`, `flex items-center justify-between`, `mb-2`.

Layout structure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [ Home ] [ Split View ] [ Back ] [ Copy URL ]   [ My List ] [ Menu ]   │  ← persistent bar
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [ Hero image + title — when !headerCollapsed ]                          │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [ Search box — full width, no filter icon ]                             │
│  [ UnifiedBreakdown ]                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Bar content (left to right)

- **Left group:**
  - **Home** — Always visible. Industry standard; keeps the bar consistent. Uses app icon (e.g. `/pwa-192x192.png`). Action: `navigateHome()`.
  - **Split View** — When `viewportWide()` only. Action: `enterDualWield()`.
  - **Back** — When `!viewportWide()` and query present. Per Spec 129.
  - **Copy URL** — When query present. Per Spec 129.
- **Right group:**
  - **My List** — Action: `navigateToLists()`.
  - **Menu** — `IconBars3`. Action: `toggleTerms()` (opens MenuDrawer).

### Hero and collapse

The hero (image, "Frantic Search" title, "Instant MTG card search") expands when `!headerCollapsed` and collapses when engaged.

**Collapse triggers** — `headerCollapsed` is true when any of:

| Condition | Meaning |
|-----------|---------|
| `urlHasQueryParam()` | URL has `q` param (even empty `?q=`) — parameterless URL shows hero |
| `query().trim() !== ''` | User has typed a non-empty query |
| `termsExpanded()` | Menu (MenuDrawer) is open |

Hero visible when the URL bar is parameterless (no `q`). When there's `q=` in the URL, even empty, the hero collapses. Opening the menu or typing also collapses.

### Home button two-step clear

When the user taps the Home icon in the search view (single-pane):

- **If `q` has a value** (e.g. `?q=foo`): First tap → `?q=` (empty). Query cleared, hero stays collapsed.
- **If `q` is empty** (e.g. `?q=`): Second tap → remove `q` entirely (parameterless). Hero returns.

This lets the user "back out" of search in two taps: first clear the query, then remove the param to restore the hero.

### Filter toggle removal

Remove the `IconAdjustmentsHorizontal` button from inside the search box. The Menu (burger) in the persistent bar is the sole entry point for filters/terms in all states.

- Search box always uses `pr-4` (no reserved space for the removed button).
- Remove the `<Show when={!headerCollapsed()}>` block that wraps the filter button.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/App.tsx` | Extract bar markup to render unconditionally. Restructure: persistent bar first, then hero (conditional), then search box. `headerCollapsed` triggers: `urlHasQueryParam()` (URL has `q` param, even empty), query non-empty, or termsExpanded. Home button two-step clear: first tap `q=foo` → `q=`; second tap `q=` → parameterless. Remove filter toggle block. Change search box padding to always `pr-4`. Remove `IconAdjustmentsHorizontal` import if unused. |
| `docs/specs/129-back-and-copy-url-buttons.md` | Add "Modified by Spec 137" note: bar is persistent. |
| `docs/specs/027-terms-drawer.md` | Update "Mobile engagement" section: remove filter icon; Menu is sole entry point; opening menu collapses header. |

**Out of scope:** DualWieldLayout. Its rails are unchanged.

## Acceptance Criteria

1. The app bar is always visible from first load, including when the hero is shown.
2. Bar content: Home, Split View (wide only), Back (narrow + query), Copy URL (query), My List, Menu. Home is always present.
3. Focusing the search box alone does not collapse the hero (users can see the hero on fresh load).
4. Typing a non-empty query collapses the hero.
5. Opening the menu (Menu button) collapses the hero.
6. The filter icon (`IconAdjustmentsHorizontal`) is removed from inside the search box. The Menu button is the sole entry point for filters.
7. Search box uses `pr-4` at all times (no extra right padding for a removed button).
8. Hero visible when URL is parameterless (no `q`). Collapse when: `q` in URL (even empty), query non-empty, or termsExpanded.
9. Home button: first tap clears query value (`q=foo` → `q=`); second tap removes `q` param (`q=` → parameterless). Hero returns after second tap.

## Implementation Notes

- 2026-03-18: Implemented persistent bar, filter toggle removal. Bar order: Home, Split view (wide), Back (narrow + query), Copy URL (query), My List, Menu.
- 2026-03-18: Removed `inputFocused()` from collapse triggers — focus alone was too aggressive; users could not see the hero. Collapse now only on query non-empty, termsExpanded, or urlHasQueryParam.
- 2026-03-18: Renamed urlEngaged to urlHasQueryParam; collapse when URL has `q` param (any value, including empty). Hero shows when URL is parameterless.
- 2026-03-18: Home button two-step clear: first tap `q=foo` → `q=`; second tap `q=` → parameterless. Hero returns after second tap.
- 2026-03-18: `urlHasQueryParam` is now a reactive signal (not a plain function) so the header re-renders when we programmatically change the URL via pushState. The signal is updated in the URL-sync effect, popstate handler, and navigateHome.
- 2026-03-18: App bar always at top: header always uses `pt-[max(1rem,env(safe-area-inset-top))]`; space (`mt-16`) moved to between app bar and hero when hero is visible.
