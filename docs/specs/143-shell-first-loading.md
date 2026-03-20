# Spec 143: Shell-First Loading

**Status:** Implemented

**Depends on:** Spec 137 (Persistent Search App Bar), Spec 013 (URL State), Spec 138 (Performance tracking), Spec 140 (search_resolved_from_url)

**Extends:** Spec 137 (adds shell phase — bar is first a placeholder, then full bar when App loads)

## Goal

Show a minimal app shell (header bar) immediately while the rest of the app loads asynchronously, reducing perceived load time and mobile drop-off.

## Background

~24% of mobile traffic drops before interacting; slow load time is the suspected cause. The current flow loads everything synchronously: `index.tsx` imports analytics, CSS, and App; App pulls in the WebWorker, `@frantic-search/shared`, search UI, docs, card detail, and other heavy modules. Users see a blank or loading screen until the full bundle parses and executes.

Spec 137 defines the persistent app bar. This spec surfaces a minimal version of that bar in a lightweight shell before the main App chunk loads, so users see recognizable chrome immediately.

## Design

### AppShell Component

New file `app/src/AppShell.tsx`. Renders immediately from the initial bundle. Must be minimal — no imports from `@frantic-search/shared`, worker, SearchContext, or other heavy modules.

**Structure:**

- Outer container: `min-h-dvh`, `overscroll-y-none`, `bg-gray-50`, `text-gray-900`, dark mode variants (match current App wrapper per Spec 137)
- Header slot: `<div id="app-header-slot">` containing a **minimal bar**:
  - Logo (`/pwa-192x192.png`)
  - Placeholder for Split view (wide viewport only) — same dimensions as real button, non-interactive or skeleton
  - Placeholder for My list — same dimensions; can use `<a href="?list=">` for progressive enhancement before App loads
  - Placeholder for Menu — same dimensions; non-interactive until App loads
  - Same layout and dimensions as Spec 137's bar to avoid layout shift when the full bar replaces it
- Main slot: `<main class="mx-auto max-w-4xl px-4">` with `<Suspense fallback={...}><App /></Suspense>` where `App` is lazy-imported

### Lazy App

`App` is loaded via `lazy(() => import('./App'))` from within AppShell (or from index). This splits App and its dependencies (worker, shared, SearchResults, etc.) into a separate chunk that loads after the shell paints.

### Portal for Full Header

When App mounts, it uses SolidJS `<Portal mount={document.getElementById('app-header-slot')}>` to render its real header into the shell's header slot. The header includes the full app bar (Spec 137), search input, hero (when not collapsed), and UnifiedBreakdown. The Portal replaces the placeholder content, so there is no layout shift.

**View handling:** The shell's header slot is relevant for all views. When App loads:
- **Search view (single-pane):** App portals the full search header (bar, hero, search box, breakdown) into the slot.
- **Search view (Dual Wield):** DualWieldLayout has its own rails; App does not portal the single-pane header. The shell bar can remain or be hidden; DualWieldLayout renders full-page.
- **Docs, Card, Report, Lists:** These views render full-page with their own chrome. App does not portal the search header; the shell bar remains as the top chrome (or App portals a minimal back-only bar). To keep scope tight: once App loads, App controls the header slot. For non-search views, App can portal a view-appropriate minimal header (e.g. back button) or leave the shell bar visible. The key is that the **first paint** is the minimal shell bar; after App loads, behavior is unchanged from current.

### Analytics

`pageLoadStartTime` stays in `analytics.ts`, imported first in `index.tsx` (unchanged). The shell and App both load from the same entry script; `pageLoadStartTime` remains the earliest moment. Spec 140's `search_resolved_from_url` duration and Spec 138's performance events remain accurate.

### Flow

```
Browser loads index.tsx
  → analytics.ts runs (pageLoadStartTime set)
  → index.css, noise-tile
  → AppShell renders
  → Minimal bar paints immediately
  → Suspense fallback shows in main
  → lazy import('./App') triggers network fetch
  → App chunk loads
  → App mounts, portals header into #app-header-slot
  → App renders content (DocsLayout, CardDetail, Search, etc.)
```

## Scope of Changes

| File | Change |
|------|--------|
| `docs/specs/143-shell-first-loading.md` | New spec (this document). |
| `app/src/AppShell.tsx` | New: minimal shell, header slot, Suspense, lazy App. No heavy imports. |
| `app/src/index.tsx` | Render `AppShell` instead of `App`; remove direct App import. |
| `app/src/App.tsx` | Wrap the search-view header (persistent bar, hero, search box, UnifiedBreakdown) in `<Portal mount={document.getElementById('app-header-slot')}>`. App still renders its outer wrapper and main content; the header is portaled. For DocsLayout, CardDetail, Report, Lists, DualWieldLayout — these render as today (full-page). The Portal only renders when `view() === 'search'` and `!showDualWield()`. When DualWield or other views are active, the shell's minimal bar stays (or we portal nothing; shell bar remains). |
| `docs/specs/137-persistent-search-app-bar.md` | Add "Extended by Spec 143" note. |

## Acceptance Criteria

1. Initial paint shows the minimal bar (logo, My list, Menu placeholders) within the first bundle. No blank screen.
2. App (worker, search, etc.) loads in a separate chunk; Suspense shows a loading state in main until App is ready.
3. When App mounts with search view active, the full search header (per Spec 137) appears via Portal in the header slot; no layout shift.
4. `pageLoadStartTime` and `search_resolved_from_url` (Spec 140) remain accurate.
5. Navigation (My list, Menu, Home) works once App is loaded. Before App loads, placeholders are non-interactive or use `href` fallbacks where safe (e.g. `?list=`).
6. DocsLayout, CardDetail, ListsPage, DualWieldLayout, BugReport render correctly when navigated to after App loads.
7. Typecheck and existing tests pass.

## Edge Cases

- **Direct navigation to docs/card/lists/report:** App loads; those views render. Shell bar may stay visible at top (they have their own headers below). Acceptable.
- **Slow network:** Shell and fallback display; App loads when chunk arrives.
- **Worker error:** Unchanged; WorkerErrorBanner shows once App has loaded.

## Out of Scope

- Deferring or lazy-loading analytics (PostHog) — remains in initial bundle.
- Additional code-splitting (ListsPage, DualWieldLayout already lazy).
- Service worker or PWA precache changes.

## Implementation Notes

- 2026-03-20: Implemented AppShell with minimal bar (logo, Split view placeholder on wide viewport, My list link, Menu placeholder). AppShell uses MutationObserver to hide the minimal bar when App portals its header into `#app-header-slot`. App uses `Portal` from `solid-js/web` to render the search header into the slot when `view() === 'search'` and `!showDualWield()`. Lazy `import('./App')` splits the main app chunk. Home link uses `import.meta.env.BASE_URL` for correct subpath support (e.g. GitHub Pages).
