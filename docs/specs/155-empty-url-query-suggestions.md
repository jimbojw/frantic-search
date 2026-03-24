# Spec 155: Suggestions for empty `q` in URL

**Status:** Implemented

**Depends on:** Spec 013 (URL state), Spec 137 (persistent search app bar), Spec 151 (Suggestion system), Spec 152 (Results summary bar), Spec 024 (index-based result protocol)

## Goal

When the live search query is **empty** but the URL already includes the `q` parameter (including `q` with an empty value, e.g. `?q=` or `?q`), the app is in “search engaged” mode (collapsed chrome, empty textarea) but previously ran **no** worker search and showed **no** suggestions. This spec defines a worker round-trip that returns **starter suggestions** so the empty state is not a dead end.

Single-pane search only; Dual Wield (`q1` / `q2`) is out of scope for v1.

## Requirements

1. **Trigger (main thread):** Non–dual-wield, worker ready, live query trimmed empty, **no** pinned query trimmed empty, and `urlHasQueryParam` is true for the single-pane `q` parameter (i.e. `q` is present in the URL, value may be empty).
2. **Worker message:** The main thread sends a normal `search` message with `query: ''` and `emptyUrlLiveQuery: true`. The worker must accept this case (it is invalid without the flag; see protocol).
3. **Worker behavior:** Evaluate as an empty live query (NOP): zero card results, empty histograms, no printing expansion. Maintain a **pool** of **rewrite** starter chips (`id: example-query`) in `worker-empty-url-suggestions.ts` (extensible). For each result, **randomly sample 3** distinct entries from that pool using a **deterministic** seed (`sessionSalt` from the worker, XOR a fixed constant) so the same session does not reshuffle on every message. After sampling, **sort the three by query string length** (shortest first); break ties with `label` lexicographically. Reassign `priority` to `0..2` for display order. One pool entry uses **`date=<current year> -is:reprint`** with `new Date().getFullYear()` when the pool is built.
4. **UI — results summary:** When the **effective** query (pinned + live) is empty and the empty state is shown, **omit the entire Spec 152 `ResultsSummaryBar`** (query echo and Try on Scryfall / Syntax help / Report a problem). **Also omit** the collapsed histogram strip and expandable `ResultsBreakdown` (mv/ci/t spark row) — there is no query to attach breakdown semantics to. Render `SuggestionList` only (still inside the results card, below any printing-data banner when applicable). The suggestion panel heading must **not** say “refinement” (the user has not searched yet): use **“Try an example search?”** and an `aria-label` of **“Example search suggestions”**; the standard zero-result panel keeps **“Try a query refinement?”** / **“Query refinement suggestions”**.
5. **No change** to landing with **no** `q` parameter: no worker search, hero-style home behavior unchanged.

## Technical details

### Protocol (`shared/src/worker-protocol.ts`)

Extend the `search` variant:

```typescript
| {
    type: 'search'
    queryId: number
    query: string
    pinnedQuery?: string
    viewMode?: ViewMode
    side?: DualWieldSide
    /** Spec 155: URL has `q` but live query is empty; return starter suggestions. */
    emptyUrlLiveQuery?: boolean
  }
```

**Invariants:**

- Main must set `emptyUrlLiveQuery` only when `!query.trim() && !pinnedQuery?.trim()` and single-pane `q` is present in the URL.
- Worker: if `emptyUrlLiveQuery` is true, allow `search` with empty `query` and no `pinnedQuery`; otherwise preserve the existing rule (at least one of live or pinned non-empty after trim).

### Worker implementation

- `worker.ts` must not drop `search` messages that are empty live + empty pinned when `emptyUrlLiveQuery` is set.
- `runSearch` short-circuits to a minimal `result` (indices length 0, NOP breakdown, empty histograms) with `buildEmptyUrlLiveQuerySuggestions(sessionSalt)` from `worker-empty-url-suggestions.ts` (not the full `buildSuggestions` pipeline for unrelated triggers).

### App (`App.tsx`)

- Compute `emptyUrlLiveQuery` in the same `createEffect` that posts searches (single-pane branch only).
- Post `search` when `q || pq || emptyUrlLiveQuery`.
- Clear-state branches: full reset when `!q && !pq && !emptyUrlLiveQuery`. Use `else if (!q && pq)` for the pinned-only partial reset (equivalent to the previous `else if (!q)` whenever the first branch is unchanged without Spec 155; with Spec 155, `else if (!q && pq)` avoids clearing right after an empty-URL search is posted).

### UI (`SearchContext`, `SearchResults`, `SuggestionList`)

- **Results shell:** `SearchContext` exposes optional `urlHasEmptyLiveInUrl`: `!showDualWield() && urlHasQueryParam()`. `SearchResults` shows the bordered results card when `query().trim()` **or** `urlHasEmptyLiveInUrl()` is true (`showResultsShell`), so `?q=` with an empty textarea is not replaced by the “Type a query to search” fallback.
- **Empty-state zero cards:** wrap `ResultsSummaryBar` in `Show when={effectiveQuery.trim() !== ''}` so Spec 155 shows only `SuggestionList` when there is nothing to echo or summarize.
- **Histogram row + `ResultsBreakdown`:** nest `Show when={histograms}` inside `Show when={effectiveQuery.trim() !== ''}` (avoids widening Solid’s `Show` callback type) so empty effective query does not show the mv/ci/t strip or expanded breakdown.
- **Zero-result wrapper:** the div wrapping the empty-state summary + suggestions uses a gray `border-t` only when the histogram row or printing-loading banner is visible above it (`classList`), so a lone suggestion panel does not get a stray top rule.
- **`SuggestionList`:** `suppressTopBorder` when `effectiveQuery` is empty (no sky `border-t` with nothing above). `exampleSearchPanel` under the same condition (heading **“Try an example search?”**, `aria-label` **“Example search suggestions”**). Dual-wield panes do not set `urlHasEmptyLiveInUrl` (optional absent → false).

## Acceptance criteria

- [x] Visiting `/?q=` (or equivalent with empty `q`) with worker ready shows **three** starter suggestions (sampled from the pool, length-sorted) without typing.
- [x] Visiting `/` with no `q` does **not** trigger this worker path.
- [x] Pinned-only searches behave as before.
- [x] Empty state with empty effective query does not show the full `ResultsSummaryBar` (query echo or footer actions); only suggestions (and the rest of the results shell) appear.
- [x] Empty effective query: no histogram / breakdown strip; suggestion panel uses example heading and omits sky top border when it is the first block; gray wrapper `border-t` only when something sits above that block.
- [x] Dual Wield: no regression; empty-URL starter path not required for `q1`/`q2` in v1.

## Implementation notes

- **SearchResults shell:** The main results panel was originally gated on `query().trim()` only, which hid the entire block (including `SuggestionList`) when the live query was empty. Single-pane search passes `urlHasEmptyLiveInUrl` (`!showDualWield() && urlHasQueryParam()`) so the shell renders whenever `q` is present in the URL even if the value is empty.
- **Results summary:** An earlier revision hid only the query-echo column while keeping `ResultsActionsColumn`. The intended UX is to skip the whole `ResultsSummaryBar` when `effectiveQuery` is empty so starter suggestions are not preceded by an actions-only footer.
- **Histogram strip:** The same `effectiveQuery.trim() !== ''` gate hides the sparkline header and `ResultsBreakdown` panel; the worker still returns empty histograms for the empty-URL search, but the UI does not surface them without a query to contextualize.
- **Suggestion panel borders:** Empty-state `SuggestionList` uses `suppressTopBorder` when `effectiveQuery` is empty so the sky panel does not show a cyan top rule with nothing above it. The surrounding zero-result wrapper only gets a gray `border-t` when the histogram row or printing-loading banner is visible above that block.
- **Suggestion panel copy:** `exampleSearchPanel` on `SuggestionList` when `effectiveQuery` is empty switches the visible heading and region `aria-label` to example-search wording; non-empty effective query keeps refinement wording.
- **Starter lineup:** Pool + `buildEmptyUrlLiveQuerySuggestions(sessionSalt)` in `app/src/worker-empty-url-suggestions.ts` (not `buildSuggestions`). Fisher–Yates sample of 3 from the pool, then sort by query length; `sessionSalt` keeps picks stable for the page session. Export `emptyUrlLiveQuerySuggestionPool()` for tests. Unit tests in `worker-empty-url-suggestions.test.ts`.
