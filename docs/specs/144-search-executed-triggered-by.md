# Spec 144: search_executed triggered_by Property

**Status:** Implemented

**Implements:** [GitHub #160](https://github.com/jimbojw/frantic-search/issues/160)

**Depends on:** Spec 085 (PostHog Analytics), Spec 013 (URL State & History), Spec 140 (search_resolved_from_url)

## Goal

Add a `triggered_by` property to the `search_executed` analytics event to distinguish URL-initiated searches from user-initiated searches.

## Background

When a user arrives from an ad campaign with a pre-populated query in the URL (e.g. `?q=f:edh+salt>99%+$<1`), a `search_executed` event fires automatically as the search resolves on landing. This is indistinguishable in analytics from a search the user typed themselves, which makes it hard to measure genuine engagement beyond the landing experience.

## Design

### 1. Schema Extension

Add `triggered_by: "url" | "user"` to the `search_executed` event properties (Spec 085 §4). Other properties on the same event (e.g. `url_snapshot`, coherence rules) are defined in Spec 085 §7 ([GitHub #184](https://github.com/jimbojw/frantic-search/issues/184)).

### 2. Value Semantics

| Value  | When to set it                                                       |
|--------|----------------------------------------------------------------------|
| `"url"`  | Search was auto-triggered by a query present in the URL on page load |
| `"user"` | Search was explicitly initiated by the user                          |

If other trigger sources are added in future (e.g. suggested searches, recent searches feed), new values can be added to this property without any schema changes.

### 3. Derivation Logic

Use the same condition as `search_resolved_from_url` (Spec 140):

- `triggered_by: "url"` when:
  - `hadQueryInUrlOnInit` is true
  - `!searchResolvedFromUrlFired` (first such result this page load)
  - `query().trim() === initialQueries.left.trim()` (user did not change the query before worker was ready)
- `triggered_by: "user"` otherwise

Computed at the `scheduleSearchCapture` call site in the result handler, alongside the existing `search_resolved_from_url` fire logic.

### 4. Scope

Only the left/single pane emits `search_executed`; no change for right pane.

## Scope of Changes

| File                               | Change                                                                     |
|------------------------------------|---------------------------------------------------------------------------|
| `docs/specs/144-search-executed-triggered-by.md` | New spec (this document).                                    |
| `docs/specs/085-posthog-analytics.md`           | Update `search_executed` row in Event Schemas table.                      |
| `app/src/analytics.ts`             | Add `triggered_by` to `captureSearchExecuted` params.                       |
| `app/src/useSearchCapture.ts`      | Add `triggered_by` to `scheduleSearchCapture` args; pass through to capture. |
| `app/src/App.tsx`                  | Compute `triggeredBy` at call site; pass to `scheduleSearchCapture`.        |

## Acceptance Criteria

1. Every `search_executed` event includes `triggered_by: "url"` or `triggered_by: "user"`.
2. `triggered_by: "url"` when user lands with `?q=...` (or `q1`/`q2`) and first left-pane result matches initial URL query.
3. `triggered_by: "user"` for all other searches (typing, editing, etc.).
4. Analytics: filter `search_executed` to `triggered_by = user` for intentional searches.
5. Analytics: funnel `search_executed (triggered_by=url)` → `search_executed (triggered_by=user)` for campaign conversion.

## Edge Cases

- **Empty query:** `search_executed` is not fired (unchanged behavior).
- **User edits before first result:** `triggered_by: "user"` (query no longer matches initial).
- **Dual Wield with only right-pane query on init:** Left pane is empty; no `search_executed` for left pane. Right pane does not emit `search_executed` (unchanged).
- **Debounced send vs current query:** If Spec 085’s coherence check drops a pending event because the user changed the effective query, `triggered_by` is irrelevant for that discarded payload; the next qualifying result schedules a new pending capture.
