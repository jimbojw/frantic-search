# Spec 085: PostHog Cookieless Analytics with Offline Queuing

**Status:** Implemented

**Depends on:** Spec 005 (App Data Loading), ADR-003 (WebWorker), ADR-004 (GitHub Pages deploy), ADR-005 (JSON data format)

## Goal

Implement cookieless PostHog analytics to understand search usage and UI interactions. To maintain excellent UX and comply with privacy laws, we will not use a cookie banner. To support players in low-connectivity environments (e.g., store basements), the PWA Service Worker will queue failed analytics requests and retry when connectivity returns.

## Background

We need to understand how users interact with Frantic Search to optimize hot paths: what search queries are run (standard Scryfall vs. Frantic extensions), and which UI elements see the most use.

PostHog's default setup uses cookies and autocapture. We must:

- Initialize PostHog in a cookieless state (`persistence: 'memory'`)
- Disable all automatic DOM tracking (`autocapture: false`)
- Disable automatic pageviews (`capture_pageview: false`)
- Feed only programmatic events

Because players are often in signal-dead environments, failed analytics network requests must be queued and replayed when the connection is restored.

## Design

### 1. Environment Setup

- Add `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to GitHub Repository Secrets.
- Pass them into the build step in `.github/workflows/deploy.yml`:

```yaml
- name: Build app
  run: npm run build -w app
  env:
    VITE_POSTHOG_KEY: ${{ secrets.VITE_POSTHOG_KEY }}
    VITE_POSTHOG_HOST: ${{ secrets.VITE_POSTHOG_HOST }}
```

- Access in code via `import.meta.env.VITE_POSTHOG_KEY` and `import.meta.env.VITE_POSTHOG_HOST`.

### 2. Dev vs Production

PostHog is not initialized when running the Vite dev server (`import.meta.env.DEV`), so no analytics traffic is sent from local development and production metrics stay clean.

- Use Vite's built-in `import.meta.env.DEV` flag.
- Only call `posthog.init()` when `!import.meta.env.DEV` **and** `VITE_POSTHOG_KEY` is set (same condition as today).
- All exported capture helpers in `app/src/analytics.ts` funnel through an internal **`captureEvent(eventName, properties?)`**:
  - **Send:** If PostHog was initialized (`posthog.init` ran), call `posthog.capture(eventName, properties)`.
  - **Console:** If `import.meta.env.DEV` is true **and** `import.meta.env.MODE !== 'test'` (so Vitest is excluded), log `console.log('[analytics]', eventName, properties)` so `npm run dev` shows what would have been sent. No PostHog network.
  - **Otherwise** (production build without key, or Vitest): call `posthog.capture` anyway. If the SDK was never initialized, `posthog.capture()` is a no-op; in Vitest, tests mock `posthog-js` and assert on `capture`.
- Callers never import PostHog directly outside the analytics module; the thin wrapper owns transport and dev logging.

### 3. Cookieless Initialization

Create `app/src/analytics.ts` and initialize from `app/src/index.tsx` before rendering:

```typescript
import posthog from 'posthog-js'

if (!import.meta.env.DEV) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    persistence: 'memory',
    autocapture: false,
    capture_pageview: false,
  })
}
```

Do not use the `defaults` option; it enables behavior we explicitly disable.

**Super properties (session):** Immediately after `posthog.init`, call `posthog.register({ ... })` with:

- `is_pwa` (boolean) — `true` when the client runs as an installed PWA (`window.matchMedia('(display-mode: standalone)').matches`) or iOS Safari home-screen mode (`navigator.standalone === true`) ([GitHub #183](https://github.com/jimbojw/frantic-search/issues/183)).
- `app_version` (string) — Vite-injected git short hash (`__APP_VERSION__`), same value shown in the app footer and bug reports.
- `build_time` (string) — Vite-injected ISO 8601 timestamp (`__BUILD_TIME__`) for the build.

These are small static strings; registering them (rather than only adding them to the first `$pageview`) repeats them on every captured event so funnels and breakdowns can filter by deploy without joining on the pageview. Cost per event is negligible.

**Campaign UTMs:** Also at init, parse the landing query string for `utm_campaign`, `utm_source`, `utm_medium`, `utm_content`, and `utm_term`. For each non-empty value, register the corresponding PostHog property (`$utm_campaign`, etc.). That preserves funnel attribution when Spec 013 strips `utm_*` from the URL after load; memory persistence keeps these session-scoped (GitHub #188).

### 4. Event Schemas

Standardize event properties for easy grouping in the PostHog dashboard:

| Event                     | Properties                                                              |
|---------------------------|-------------------------------------------------------------------------|
| `search_executed`         | `{ query: string, used_extension: boolean, results_count: number, triggered_by: "url" \| "user", url_snapshot: string }` (Spec 144; `url_snapshot` + coherence rules — [GitHub #184](https://github.com/jimbojw/frantic-search/issues/184)) |
| `search_resolved_from_url`| `{ duration_ms: number, results_count: number, had_results: boolean }` (Spec 140) |
| `ui_interacted`           | `{ element_name: string, action: 'toggled' \| 'clicked', state?: string }` — for `element_name: 'copy_link_menu'`, `state` is one of `opened`, `copied_url`, `copied_markdown_search`, `copied_markdown_card_name` (Spec 164). |
| `suggestion_applied`       | `{ suggestion_id: string, suggestion_label: string, variant: 'rewrite' \| 'cta', applied_query?: string, cta_action?: string, mode?: 'empty' \| 'rider' }` (Spec 151, Spec 153) |
| `menu_chip_used`           | `{ section: string, chip_label: string }` (Spec 083) |
| `scryfall_outlink_clicked` | `{ query: string, used_extension: boolean, results_count: number, pane_id?: string }` — fired when the user activates **Try on Scryfall** (Spec 152). `query` is the trimmed effective query (same string family as `search_executed`). `used_extension` matches §5 at click time. `results_count` uses the same cardinality as `search_executed.results_count`: when the pane has non-empty printing indices and view mode is `images` or `full`, use raw printing row count; otherwise use card index count. `pane_id` is `left` or `right` in dual-wield; omitted in single-pane (or set to `main` if the implementation standardizes on a string). |
| `card_detail_interacted` | Discriminated by `control` plus optional fields (`set_code`, `face`, `tag_label`, `list_scope`, `oracle_id`, `finish`, `scryfall_id`) — Spec 160; header Copy… menu adds `card_copy_menu_opened`, `card_copy_url`, `card_copy_url_card_only`, `card_copy_name`, `card_copy_markdown`, `card_copy_slack_reddit` (Spec 165). Card detail page only; do not use `ui_interacted` for these controls. |
| `search_results_interacted` | Discriminated by `control` (`open_card`, `all_prints`, `name_copy`, `list_add`, `list_remove`) plus `view_mode`, `row_kind`, optional `pane_id`, and list/id fields aligned with Spec 160 where applicable — Spec 161. |
| `my_list_interacted` | Discriminated by `control` (`back`, `view_in_search`, `edit_open`, `cancel_edit`, `revert`, `review_open`, `review_back`, `save_committed`, `copy`, `bug_report_open`, `format_select`, `export_outlink`, `preserve_toggle`, `review_filter_toggle`, `validation_panel_toggle`, `quick_fix_apply`, `quick_fix_apply_all`, `deck_paste`) plus `list_id`, `editor_mode`, and control-specific fields (`deck_format`, counts, enums) — Spec 162. |

### 5. `used_extension` Definition

**Intent:** `used_extension` is `true` when the user’s **effective** search query (pinned + live, same string the worker evaluates) uses syntax that **Frantic Search accepts** but that would **fail or diverge on Scryfall**—custom handling, Frantic-only fields, or syntax Scryfall does not understand.

**Not** extension: terms that are valid on both engines, including `unique:` (`cards` / `prints` / `art`), `++` / `@@` (parser sugar for `unique:`), and `include:extras` (Scryfall supports including extras in search). Those must **not** set `used_extension`.

**Counted as extension** (non-exhaustive; align implementation with `toScryfallQuery` / Spec 057 / 061 / 080 / 095 / 099 / 101 / 136):

1. **`**` (include extras alias)** — Frantic-only sugar for `include:extras` (Spec 057); Scryfall does not accept the `**` token. Spelled-out `include:extras` is **not** extension (see above).
2. **Salt** — any query on the `salt` field (and aliases), which Scryfall does not support.
3. **Percentile literals** — a value matching `(\d+(?:\.\d+)?)%` on a field that Frantic treats as percentile-capable (`usd`, `date`, `name`, `edhrec`, `salt`), e.g. `edhrec>99%`, while Scryfall does not support that syntax for those filters.
4. **Partial `date` / `year` literals** — values that Frantic expands to explicit ranges (Spec 061), e.g. `date=202` for the 2020s; Scryfall does not interpret those partials the same way.
5. **`null` value queries** — `usd=null` / `usd!=null` (Spec 080) and `power` / `toughness` / `loyalty` / `defense` / `mana` (and aliases) with `null` (Spec 136); Scryfall does not support these.

**Derivation:** The WebWorker parses the **effective** query (same `sealQuery` concatenation as the app’s `effectiveQuery()`), walks the AST, and sets boolean `usedExtension`. The `result` message includes `usedExtension`; the main thread passes it through to PostHog and the Scryfall outlink as `used_extension`. Do **not** derive `used_extension` from `includeExtras` or `uniqueMode`.

**Future:** Additional Frantic-vs-Scryfall gaps (e.g. plain `edhrec:` filters, `$` price alias) may extend the same AST walk without changing the event schema.

### 6. Worker Protocol (`result` message)

- **`includeExtras`:** Still included on `result` for UI and the playable filter (Spec 057); it does **not** drive `used_extension`.
- **`usedExtension`:** Required boolean on every `result` (Spec 085 §5). Computed in `app/src/worker-search.ts` from the effective query AST.
- In `app/src/App.tsx`, store `usedExtension` when handling results and pass it to `scheduleSearchCapture` and `SearchContext` so the Scryfall outlink uses the same value as `search_executed`.

### 7. Search Capture Point

Search runs on every keystroke (ADR-003). Emitting every search would flood PostHog.

**Throttling:** Debounce or throttle: only capture after the user stops typing for 500–1000 ms, or on blur of the search input.

**Location:** Main thread when `worker.onmessage` receives a `result` message. Data available: `query()`, `pinnedQuery()`, `effectiveQuery()`, result count (from `msg.indices` / printing rows or pinned-only counts), `msg.usedExtension`, `msg.uniqueMode`, `msg.includeExtras`, and `location.pathname` + `location.search` read synchronously in that handler.

**Event:** `captureSearchExecuted({ query, used_extension, results_count, triggered_by, url_snapshot })`.

**Coherence (Issue #184):** The debounced send must not fire if the trimmed effective query has changed since that result was scheduled; discard the pending payload. PostHog’s automatic `$current_url` reflects the moment `capture` runs, which can lag the stored `query` by the debounce window—use `url_snapshot` (pathname + search at result-handling time) for analysis that must align query, result count, and URL.

**Pinned-only (live query empty):** `results_count` uses the same cardinality as normal searches: `pinnedPrintingCount` when view mode is `images` or `full`, otherwise `pinnedIndicesCount`. The card list is empty by design, but the count must reflect pinned matches, not `indices.length` (always zero).

### 8. UI Capture Points

Add `captureUiInteracted({ element_name, action, state? })` at these locations:

| Element       | Action   | Location / Trigger                          |
|---------------|----------|---------------------------------------------|
| `breakdown`   | toggled  | `toggleBreakdown()` in App.tsx              |
| `histograms`  | toggled  | `toggleHistograms()` via SearchContext      |
| `terms`       | toggled  | `toggleTerms()` in App.tsx (filters menu)   |
| `menu_drawer` | clicked  | MenuDrawer open/close                       |
| `syntax_help` | clicked  | SyntaxHelp opened                           |
| `bug_report`  | clicked  | BugReport opened                            |
| `scryfall_outlink` | clicked (event: `scryfall_outlink_clicked`) | User activates **Try on Scryfall** in `ResultsActionsColumn` (Outlink); `captureScryfallOutlinkClicked()` |

Suggestion chips (Spec 151, Spec 153) use a dedicated `suggestion_applied` event via `captureSuggestionApplied()`, fired in SuggestionList when the user taps a chip. Properties include `suggestion_id`, `suggestion_label`, `variant`, `applied_query` (rewrite) or `cta_action` (CTA), and `mode` (empty vs rider) for funnel analysis.

MenuDrawer filter chips (Spec 083) use `menu_chip_used` via `captureMenuChipUsed()`, fired in each chip's onClick when the user taps. Properties: `section` (mylist, views, formats, color, layouts, etc.) and `chip_label` (e.g. `f:commander`, `view:images`, `ci:w`).

**Card detail (Spec 160, Spec 165):** The card detail page uses `card_detail_interacted` via `captureCardDetailInteracted()`, not `ui_interacted`, so dashboards stay on one structured event for back, Scryfall external link, all-prints navigation, set navigation, DFC face toggle, inline Slack copy, header Copy… menu open and clipboard rows, tag navigate/copy, and list add/remove.

**Search results (Spec 161):** The results list uses `search_results_interacted` via `captureSearchResultsInteracted()` for open card, all-prints navigation from list popovers, name copy, and list add/remove—not `ui_interacted`.

### 9. Offline Resilience (Background Sync)

PostHog's JS SDK uses `fetch` for payloads to `https://[api_host]/e/`. The service worker must intercept failed requests and queue them for retry.

**Current setup:** `vite-plugin-pwa` with `generateSW` and `runtimeCaching`. Background Sync requires custom routes, which `generateSW` does not support.

**Required changes:**

1. Switch to `strategies: 'injectManifest'` in `app/vite.config.ts`.
2. Create a custom service worker (e.g. `app/public/sw.js` or `app/src/sw.ts`) that:
   - Uses `precacheAndRoute(self.__WB_MANIFEST)` for app assets.
   - Registers a route for PostHog's `/e/` endpoint using `NetworkOnly` + `BackgroundSyncPlugin`.
3. Add `workbox-background-sync`, `workbox-routing`, `workbox-strategies` as dev dependencies.

**Host matching:** The route must match the configured PostHog host. Users may use `app.posthog.com`, `eu.posthog.com`, or self-hosted. Match any URL whose pathname includes `/e/` (PostHog's batch endpoint).

**Note:** Background Sync only queues requests that fail due to network errors (no connectivity). It does not retry on 4xx/5xx responses. That is acceptable for analytics.

**Transport:** If PostHog uses `navigator.sendBeacon` for some events, those bypass the service worker. Configure the SDK to use `fetch` if the option exists.

### 10. Dependencies

- `posthog-js` — add to `app` workspace.
- `workbox-background-sync`, `workbox-routing`, `workbox-strategies` — dev dependencies for the custom service worker (likely available via `vite-plugin-pwa` / Workbox).

## Scope of Changes

| File                          | Change                                                                 |
|-------------------------------|------------------------------------------------------------------------|
| `docs/specs/085-posthog-analytics.md` | New spec (this document).                                        |
| `shared/src/worker-protocol.ts`       | Add `includeExtras` to result type.                            |
| `app/src/worker-search.ts`            | Pass `includeExtras` in SearchResult.                          |
| `app/src/App.tsx`                     | Set `includeExtras`; call analytics on result; wire UI capture. |
| `app/src/analytics.ts`                | New: init, `captureSearchExecuted`, `captureUiInteracted`.      |
| `app/src/index.tsx`                   | Import and init analytics before render.                       |
| `app/vite.config.ts`                  | `strategies: 'injectManifest'`, SW srcDir/filename.            |
| `app/public/sw.js` or `app/src/sw.ts` | Custom SW with precache + PostHog Background Sync route.       |
| `.github/workflows/deploy.yml`        | Add `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` to build env.      |
| `app/package.json`                    | Add posthog-js, workbox-* dev deps.                            |

## Acceptance Criteria

1. PostHog API key and host are routed through GitHub Secrets and exposed to the Vite build via `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`.
2. PostHog is not initialized in Vite dev mode; would-be events are logged to the browser console with an `[analytics]` prefix instead of being sent. Vitest (`MODE === 'test'`) continues to exercise `posthog.capture` via mocks.
3. Cookieless initialization: `persistence: 'memory'`, `autocapture: false`, `capture_pageview: false`.
4. Custom event tracking: `search_executed` (throttled) and `ui_interacted` at the specified capture points.
5. `used_extension` matches `msg.usedExtension` from the worker (effective-query AST; Spec 085 §5), not `includeExtras` or `uniqueMode`.
6. Service worker intercepts failed PostHog requests and uses Workbox Background Sync to queue and replay them when connectivity is restored.
7. `npm run dev` surfaces analytics payloads in the console; `npm test -w app` behavior is unchanged (no console-only path during tests).

## Revision history

- **2026-03-26** ([GitHub #186](https://github.com/jimbojw/frantic-search/issues/186)): Redefined `used_extension` to mean Frantic-vs-Scryfall syntax divergence only; `unique:` / spelled-out `include:extras` no longer count; `**` does count (Frantic-only sugar). Worker computes `usedExtension` on the effective query AST and sends it on every `result`. Follow-up: `usd=null` / face-field `null` (Spec 080 / 136), aligned with `toScryfallQuery` stripping.

## Edge Cases

- **Pinned + live query:** `used_extension` must reflect the **effective** combined query (same parse as effective breakdown). The worker sets `usedExtension` from that AST.
- **Empty query:** Do not capture `search_executed` when the user clears the search.
- **Stale debounced capture:** If the user keeps typing after a result, drop the pending `search_executed` when the timer fires unless `effectiveQuery().trim()` still equals the pending `query`.
- **Try on Scryfall with empty effective query:** If the control is still activated (e.g. rare edge), emit `scryfall_outlink_clicked` with `query: ''`. In normal UX the results summary bar is omitted when the effective query is empty (Spec 155), so this is uncommon.
- **PostHog sendBeacon:** If the SDK falls back to `sendBeacon`, those requests bypass the service worker. Prefer `fetch` transport if configurable.
