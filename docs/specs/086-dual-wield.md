# Spec 086: Dual Wield

**Status:** Implemented

**Modified by:** Spec 129 (Back and Copy URL — adds Copy URL button to left rail)

**Depends on:** Spec 013 (URL State), Spec 083 (MenuDrawer), Spec 079 (Consolidated Query Accordion), Spec 038 (Collapsible Sparkline Histograms), Spec 041 (Result Display Modes)

**Modifies:** Spec 013 (adds q1, q2 params; Dual Wield mode)

## Goal

Enable two independent search panes side-by-side on desktop. Each pane has its own search box, breakdown, histograms, results, and menu drawer. Users can compare lists, refine two queries in parallel, or keep reference searches open while exploring. The layout uses minimal side rails with hamburger icons so the association between each menu and its pane is unambiguous.

## Trigger & Availability

### When Dual Wield is active

Dual Wield mode is enabled when the `q2` URL parameter is **present** (even with an empty value). Examples:

| URL | Mode |
|-----|------|
| `?q=t:creature` | Single pane (current behavior) |
| `?q2` | Dual Wield: left from `q` fallback (or empty), right empty |
| `?q1=t:creature&q2=t:creature` | Dual Wield: both panes identical (typical after split gesture) |
| `?q1=t:creature&q2=ci:red` | Dual Wield: left and right diverged |

### Viewport constraints

- **Desktop only.** Dual Wield is not available on mobile or narrow viewports.
- **Minimum width:** Requires a sufficiently wide viewport (e.g. `min-width: 1024px` or similar). Exact breakpoint TBD during implementation.
- **Fallback:** When the viewport is too narrow, the app collapses to single-pane mode. The `q2` param remains in the URL (so resizing wider restores Dual Wield), but only the left pane is shown. The right pane's query is preserved in the URL.

### Entering Dual Wield

An affordance (e.g. a "Split" button, keyboard shortcut, or link) adds `q2` to the URL. On transition:

- **First-time (user has never used Dual Wield):** Copy the current single-pane query to **both** `q1` and `q2`. (Read from `q1 ?? q` if already in Dual Wield; otherwise from `q`.) Result: `?q1=<current>&q2=<current>` — both panes start with the same query.
- **Returning (user has used Dual Wield before):** Restore the right pane's last live query from localStorage (`frantic-last-q2`). The left pane still uses the current single-pane query for `q1`. The right pane's pinned query is already restored from `frantic-pinned2` on app load.
- Remove `q` from the URL.

**Rationale:** The typical first-time use case is comparing a list to a card pool slice. Both sides start identical; the user then diverges them. Returning users benefit from resuming where they left off in the right pane.

### Leaving Dual Wield

Removing `q2` from the URL returns to single-pane mode. The left pane's query (`q1`) becomes the sole query. Before discarding, the right pane's live query is saved to localStorage (`frantic-last-q2`) so it can be recalled when the user re-enters Dual Wield.

## Background

### Current behavior

The app has a single search session: one query, one set of results, one MenuDrawer. The header contains the search box, breakdown, and a hamburger that opens the MenuDrawer. Everything is tied to one `q` URL param.

### Problem

Users who want to compare two queries (e.g. "creatures in my list" vs "creatures in the format") must switch back and forth, losing context. List-building workflows (Spec 075+) could benefit from side-by-side reference: one pane for the list filter, another for exploring additions. Dual Wield provides a dedicated layout for these use cases without fragmenting the single-pane experience.

## Design

### Layout: two panes, two side rails

```
┌─────┬──────────────────────────────────┬──────────────────────────────────┬─────┐
│ [≡] │  Left pane                        │  Right pane                     │ [≡] │
│     │  Search box, breakdown, histograms │  Search box, breakdown, etc.    │     │
│ L   │  Results                          │  Results                        │ R   │
│ r   │                                    │                                  │ r   │
│ a   │                                    │                                  │ a   │
│ i   │                                    │                                  │ i   │
│ l   │                                    │                                  │ l   │
└─────┴──────────────────────────────────┴──────────────────────────────────┴─────┘
```

- **Left rail:** Fixed to the left edge. Contains a hamburger icon at the top. Tapping it opens a drawer that slides in from the left and modifies the **left** pane's query (VIEWS, TERMS, etc.). Below the hamburger: Home button, then Copy URL button when a query is present (Spec 129).
- **Right rail:** Fixed to the right edge. Same structure: hamburger at top, drawer slides in from the right, modifies the **right** pane.
- **Center:** Two search panes side-by-side. Each pane is a full search session: search input, UnifiedBreakdown, histograms, SearchResults. No shared header — the rails provide the menu affordance.

The spatial mapping is explicit: left rail → left drawer → left pane. Right rail → right drawer → right pane. No "active side" tracking required.

### Resizable split

A draggable handle between the two panes lets users adjust how much horizontal space each pane receives. The split is expressed as the left pane's fraction of the center area (0–1), default 0.5 (50/50). The fraction is clamped (e.g. 0.25–0.75) so neither pane collapses below a minimum usable width. Persisted to localStorage as `frantic-dual-wield-split`.

### Per-pane independence

Each pane has:

- Its own `query` and `pinnedQuery` (stored in `q1`/`q2` in URL and `frantic-pinned-query`/`frantic-pinned2` in localStorage)
- `frantic-last-q2` in localStorage: the right pane's last live query, recalled when re-entering Dual Wield
- `frantic-dual-wield-split` in localStorage: left pane's fraction of center width (0–1), for the resizable split
- Its own `indices`, `breakdown`, `histograms`, `printingIndices`, etc.
- Its own `SearchProvider` — the MenuDrawer in each rail uses the context for that pane
- Its own histograms expand/collapse, breakdown expand/collapse (localStorage keys can be shared or per-pane; implementation detail)

Clicks in a pane (search input, breakdown chips, histogram bars) affect only that pane. The MenuDrawer in each rail is rendered within that pane's `SearchProvider`, so it automatically operates on the correct query.

### URL parameters

| Param | Mode | Meaning |
|-------|------|---------|
| `q` | Single pane | The search query |
| `q1` | Dual Wield | Left pane query |
| `q2` | Dual Wield | Right pane query (presence triggers Dual Wield) |

History semantics (replaceState vs pushState) follow Spec 013. Keystrokes in either pane use `replaceState` to update the URL. Discrete navigation (help, report, card detail) uses `pushState`.

### Worker and search execution

The worker receives two search requests when Dual Wield is active. Options:

1. **Two messages:** Send separate `search` messages with a `side: 'left' | 'right'` (or equivalent) in the protocol. The main thread tracks `latestQueryIdLeft` and `latestQueryIdRight`, routing each result to the correct pane.
2. **Batch message:** One message with both queries; worker returns both results. Reduces round-trips but requires protocol changes.

The worker's CardIndex and PrintingIndex are shared (one worker, one copy of the data). Only the query and result routing are duplicated.

### Drawer behavior

- **Left drawer:** Slides in from the left edge. Overlays the left portion of the screen. Same content as current MenuDrawer (VIEWS, TOOLS, TERMS, footer). Uses left pane's SearchContext.
- **Right drawer:** Slides in from the right edge. Same content. Uses right pane's SearchContext.

Only one drawer open at a time is simplest: opening one closes the other. Alternatively, both could be open if the viewport is wide enough; implementation choice.

### Single-pane unchanged

When `q2` is absent, the app behaves exactly as today. Single-pane retains the current header layout (collapsed/expanded header, search box, hamburger in header). No side rails. This spec does not alter the single-pane UX.

## Scope of Changes

| Area | Change |
|------|--------|
| `app/src/App.tsx` | Branch on Dual Wield (q2 present + viewport). Render DualWieldLayout vs current layout. Extract or duplicate pane state for two panes. |
| `app/src/` (new or refactored) | `DualWieldLayout`, `SearchPane`, `SideRail` components. `useSearchPane(side)` hook or equivalent to encapsulate per-pane state and worker communication. Resizable split handle with `frantic-dual-wield-split` persistence. |
| `app/src/SearchContext.tsx` | No interface change. Each pane gets its own provider. |
| `shared/src/worker-protocol.ts` | Add `side?: 'left' \| 'right'` to `ToWorker` search and `FromWorker` result. Or define batch search format. |
| `app/src/worker.ts` | Handle dual-search messages; return results tagged by side. |
| `app/src/history-debounce.ts` | Sync `q1` and `q2` to URL when in Dual Wield. |
| `docs/specs/013-url-state.md` | Add note: Dual Wield uses q1, q2. |

## Acceptance Criteria

1. When `q2` is present in the URL and viewport width ≥ breakpoint, the app shows two search panes side-by-side with left and right rails.
2. Each rail has a hamburger icon at the top. Left hamburger opens a drawer that modifies the left pane. Right hamburger modifies the right pane.
3. Each pane has an independent search box, breakdown, histograms, and results. Editing in one pane does not affect the other.
4. URL params `q1` and `q2` reflect each pane's query. Keystrokes update the URL via replaceState.
5. When viewport is below the breakpoint, the app collapses to single-pane (left pane only). `q2` remains in the URL.
6. When `q2` is absent, the app behaves as today (single-pane, `q` param). No regression.
7. An affordance exists to enter Dual Wield (adds `q2` to URL). Exact UX TBD.
8. Worker executes both pane queries and returns results to the correct pane.
9. When re-entering Dual Wield after having used it before, the right pane restores its last live query (and pinned query) from localStorage.
10. A draggable handle between the panes adjusts the split; the proportion is persisted to `frantic-dual-wield-split` and restored on load.

## Open Questions

- **Breakpoint:** Exact min-width for Dual Wield. 1024px is a starting point.
- **Enter affordance:** Button in header? Link in empty state? Keyboard shortcut?
- **localStorage:** Per-pane keys for pinned query, breakdown expanded, etc., or shared?
- **Page overlays (out of scope for initial implementation):** Card detail, help, report — when opened from a pane, should they overlay only that pane or full-screen? Deferred; desktop may have better options than the current card detail view anyway.
