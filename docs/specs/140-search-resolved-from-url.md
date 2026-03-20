# Spec 140: search_resolved_from_url Analytics Event

**Status:** Implemented

**Implements:** [GitHub #158](https://github.com/jimbojw/frantic-search/issues/158)

**Depends on:** Spec 085 (PostHog Analytics), Spec 013 (URL State & History), Spec 086 (Dual Wield), ADR-003 (WebWorker)

## Goal

Add a `search_resolved_from_url` event to track perceived load time for users who arrive on a page with a query string already in the URL (shared links, bookmarks).

## Background

When a user follows a shared or bookmarked search URL, the search fires automatically on page load. These users wait from page load until results render, with no control over that wait. This is a performance metric distinct from `search_executed` (behavior-focused, includes query). Spec 138's `faces_loaded` and `printings_loaded` measure worker phases, not end-to-end "query in URL to results visible."

## Design

### 1. Event Schema

| Property       | Type    | Description                                                 |
|----------------|---------|-------------------------------------------------------------|
| `duration_ms`  | number  | Time in ms from page load until search results are rendered |
| `results_count`| number  | Number of results returned                                  |
| `had_results` | boolean | Whether `results_count > 0`                                 |

Do **not** include `query` (privacy risk for URL-shared queries).

### 2. Start Time

Use `performance.now()` at app init. Export `pageLoadStartTime` from `app/src/analytics.ts` (imported first in index.tsx) so it captures the earliest moment in the app bundle.

### 3. Fire Condition

Fire when:

- URL had a non-empty query on page init (`q`, or `q1`/`q2` in Dual Wield)
- The first search result for the left/single pane has arrived
- The result's query matches the initial URL query (user did not change it before worker was ready)
- At most once per page load

### 4. Fire Location

In the `case 'result'` handler in `app/src/App.tsx`, when handling a left-pane or single-pane match. Reuse the same `results_count` logic as `scheduleSearchCapture`.

### 5. Dual Wield

Fire when the left-pane result resolves (primary pane). If only the right pane had a query on init, do not fire (edge case; shared URLs typically use `q` or `q1`+`q2`).

## Scope of Changes

| File                         | Change                                                                              |
|------------------------------|-------------------------------------------------------------------------------------|
| `docs/specs/140-search-resolved-from-url.md` | New spec (this document).                                           |
| `app/src/analytics.ts`       | Add `pageLoadStartTime`, `captureSearchResolvedFromUrl()`.                           |
| `app/src/App.tsx`            | Detect `hadQueryInUrlOnInit`, fire event in result handler with once-per-load guard. |

## Acceptance Criteria

1. Event fires when user lands with `?q=...` or `?q1=...&q2=...` and search resolves.
2. Event does not fire when URL had no query on init.
3. Event does not fire when user changed the query before the first result arrived.
4. Event fires at most once per page load.
5. `duration_ms`, `results_count`, `had_results` are correct; `query` is not included.

## Edge Cases

- **Empty `?q=` on init:** No event.
- **User edits query before worker ready:** No event (result query won't match initial).
- **Worker error before result:** No event.
- **Dual Wield with only right-pane query on init:** No event (left-pane is primary; spec could be extended later).
