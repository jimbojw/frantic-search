# Spec 138: Hybrid Performance Tracking

**Status:** Draft

**Implements:** [GitHub #152](https://github.com/jimbojw/frantic-search/issues/152)

**Depends on:** Spec 085 (PostHog Analytics), Spec 013 (URL State & History), Spec 031 (Debounced Browser History), ADR-003 (WebWorker)

## Goal

Enable PostHog to report meaningful pageviews and baseline Web Vitals (FCP, LCP) so we can measure app load times and direct performance improvements. Track the WebWorker's graduated loading phases (Card Faces vs. Printings) with custom performance events.

## Background

We use PostHog in cookieless mode (`persistence: 'memory'`) per Spec 085. With `capture_pageview: false`, PostHog reports 0 pageviews per session — we need manual pageview capture that respects our history semantics.

Because Frantic Search is an as-you-type app, we use `replaceState()` for URL updates on every keystroke and `pushState()` only for discrete navigation (Spec 013, Spec 031). PostHog's default SPA pageview tracking listens to `replaceState`; enabling it would flood analytics with false pageviews. We must fire `$pageview` only when legitimate navigation occurs.

The WebWorker loads data in two phases: (1) Card Faces (name, oracle text, color identity) for basic search, and (2) Printings (prices, sets, rarity, artwork) for full functionality. We want to measure both milestones to identify bottlenecks.

## Design

### 1. PostHog Initialization Update

Add `capture_performance: true` to the existing `posthog.init()` config in `app/src/analytics.ts`. This enables automatic capture of FCP and LCP via the browser Performance API. Keep all existing options: `persistence: 'memory'`, `autocapture: false`, `capture_pageview: false`, `transport: 'fetch'`.

### 2. Centralized pushState and Pageview Capture

Create a single function that performs `history.pushState` and fires `posthog.capture('$pageview')`. All call sites that currently call `history.pushState` directly must route through this function. No context provider — a module-level function is sufficient.

**Location:** Add `pushStateAndCapturePageview(url: string, state?: object | null)` to `app/src/history-debounce.ts`. The function:

1. Calls `history.pushState(state ?? null, '', url)`.
2. Calls `capturePageview()` from the analytics module.

**Analytics module:** Add `capturePageview(): void` to `app/src/analytics.ts` that calls `posthog.capture('$pageview')`. The centralized push function imports and invokes it.

**Call sites to migrate:** Every `history.pushState` in `App.tsx`, plus `pushIfNeeded()` in `history-debounce.ts`. Most call sites use `history.pushState(null, '', url)` — invoke as `pushStateAndCapturePageview(url)`. The `pushIfNeeded()` case preserves scroll state: invoke as `pushStateAndCapturePageview(location.href, history.state)`.

### 3. When to Fire `$pageview`

Fire `$pageview` in three cases:

| Event | Location | Rationale |
|-------|----------|-----------|
| **Initial load** | App mount (e.g., in `App.tsx` or `index.tsx` after first render) | First pageview of the session; fixes 0 pageviews. |
| **pushState** | Inside `pushStateAndCapturePageview` | Every navigation we trigger, including debounced commits. |
| **popstate** | `popstate` event handler in `App.tsx` | Back/forward button — user navigated to a previous URL. |

Do **not** fire on `replaceState` — that would flood analytics on every keystroke.

### 4. Worker Performance Marks

In `app/src/worker.ts`, use `self.performance.mark()` and `self.performance.measure()` to track load durations. The worker has no access to PostHog; it sends duration to the main thread, which fires the event.

**Phase 1 (Faces):** Mark at the start of `init()`. When posting `status: 'ready'`, measure from the start mark, record the duration, and include it in the message.

**Phase 2 (Printings):** When posting `status: 'printings-ready'`, measure from the same start mark, record the duration, and include it in the message.

**Worker protocol extension:** Add optional `facesLoadDurationMs?: number` to the `status: 'ready'` variant and `printingsLoadDurationMs?: number` to the `status: 'printings-ready'` variant in `FromWorker` (`shared/src/worker-protocol.ts`).

**Main thread:** When handling `status: 'ready'`, call `captureFacesLoaded({ duration_ms })`. When handling `status: 'printings-ready'`, call `capturePrintingsLoaded({ duration_ms })`. Add these to `analytics.ts`.

### 5. Event Schemas

| Event | Properties | When |
|-------|-------------|------|
| `$pageview` | (PostHog default — URL, etc.) | Initial load, pushState, popstate |
| `faces_loaded` | `{ duration_ms: number }` | Worker posts `status: 'ready'` |
| `printings_loaded` | `{ duration_ms: number }` | Worker posts `status: 'printings-ready'` |

Use snake_case for custom events to match Spec 085 (`search_executed`, `ui_interacted`).

### 6. Retain `search_executed`

Do **not** retire `search_executed`. It provides `used_extension` and `results_count`, which are not derivable from URL alone. Pageviews and search events serve different purposes.

## Scope of Changes

| File | Change |
|------|--------|
| `docs/specs/138-hybrid-performance-tracking.md` | New spec (this document). |
| `shared/src/worker-protocol.ts` | Add `facesLoadDurationMs?` to `status: 'ready'`, `printingsLoadDurationMs?` to `status: 'printings-ready'`. |
| `app/src/analytics.ts` | Add `capture_performance: true` to init; add `capturePageview()`, `captureFacesLoaded()`, `capturePrintingsLoaded()`. |
| `app/src/history-debounce.ts` | Add `pushStateAndCapturePageview(url?: string)`; update `pushIfNeeded()` to use it. |
| `app/src/App.tsx` | Replace all `history.pushState` calls with `pushStateAndCapturePageview`; fire `capturePageview()` on mount and in `popstate` handler. |
| `app/src/worker.ts` | Add `performance.mark` at init start; add `performance.measure` and duration before each `post` for `ready` and `printings-ready`. |

## Acceptance Criteria

1. PostHog init includes `capture_performance: true`. FCP and LCP appear in PostHog dashboards.
2. Typing in the search bar (triggering `replaceState`) does **not** fire `$pageview`. Verified in dev tools.
3. Initial load fires exactly one `$pageview`.
4. Every `pushState` (including debounced commits via `pushIfNeeded`) fires `$pageview`.
5. Browser back/forward fires `$pageview`.
6. Worker sends `facesLoadDurationMs` with `status: 'ready'` and `printingsLoadDurationMs` with `status: 'printings-ready'`.
7. Main thread fires `faces_loaded` and `printings_loaded` with duration properties.
8. `search_executed` continues to fire as before (unchanged).

## Edge Cases

- **Worker error before ready:** No `faces_loaded` or `printings_loaded` event. Acceptable.
- **No printings data:** Worker may not post `printings-ready`. No `printings_loaded` event. Acceptable.
- **popstate on initial load:** `popstate` typically does not fire on initial load. Fire the initial pageview once on mount. If implementation reveals edge cases (e.g., certain browsers), add an Implementation Note.
- **Dual Wield, Lists, etc.:** All `pushState` call sites use the centralized function. No special handling.
