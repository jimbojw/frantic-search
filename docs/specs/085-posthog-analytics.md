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

PostHog is completely disabled when running in localhost/development mode to prevent dev data from polluting production metrics.

- Use Vite's built-in `import.meta.env.DEV` flag.
- Only call `posthog.init()` when `!import.meta.env.DEV`.
- If not initialized, calling `posthog.capture()` is safe but does nothing.
- Wrap all capture calls in a thin analytics module so callers never touch an uninitialized SDK.

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

### 4. Event Schemas

Standardize event properties for easy grouping in the PostHog dashboard:

| Event                     | Properties                                                              |
|---------------------------|-------------------------------------------------------------------------|
| `search_executed`         | `{ query: string, used_extension: boolean, results_count: number, triggered_by: "url" \| "user" }` (Spec 144) |
| `search_resolved_from_url`| `{ duration_ms: number, results_count: number, had_results: boolean }` (Spec 140) |
| `ui_interacted`           | `{ element_name: string, action: 'toggled' \| 'clicked', state?: string }` |

### 5. `used_extension` Definition

`used_extension` is `true` when the query uses Frantic Search–specific syntax that Scryfall does not support or handles differently. Examples: `include:extras`, `**`, `++`, `@@`, `unique:prints`, `unique:art`.

Derive from evaluator output: `used_extension = includeExtras || uniqueMode !== 'cards'`.

The evaluator's `EvalOutput` exposes `includeExtras` and `uniqueMode`. The worker currently passes `uniqueMode` to the main thread but not `includeExtras`. Add `includeExtras` to the worker protocol.

### 6. Worker Protocol Change

- Add `includeExtras?: boolean` to the `result` variant of `FromWorker` in `shared/src/worker-protocol.ts`.
- In `app/src/worker-search.ts`, include `includeExtras` in the `SearchResult` (from `liveEval.includeExtras`).
- In `app/src/App.tsx`, store `includeExtras` when handling results and pass it to the analytics module.

### 7. Search Capture Point

Search runs on every keystroke (ADR-003). Emitting every search would flood PostHog.

**Throttling:** Debounce or throttle: only capture after the user stops typing for 500–1000 ms, or on blur of the search input.

**Location:** Main thread when `worker.onmessage` receives a `result` message. Data available: `query()`, `effectiveQuery()`, result count (from `msg.indices.length` or `totalDisplayItems()`), `msg.uniqueMode`, `msg.includeExtras`.

**Event:** `captureSearchExecuted({ query, used_extension, results_count })`.

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
2. PostHog is completely disabled (or mocked) when running in localhost/development mode.
3. Cookieless initialization: `persistence: 'memory'`, `autocapture: false`, `capture_pageview: false`.
4. Custom event tracking: `search_executed` (throttled) and `ui_interacted` at the specified capture points.
5. `used_extension` derived correctly from `includeExtras` and `uniqueMode`.
6. Service worker intercepts failed PostHog requests and uses Workbox Background Sync to queue and replay them when connectivity is restored.

## Edge Cases

- **Pinned + live query:** `used_extension` should reflect the effective combined query. The worker computes effective breakdown; ensure `includeExtras` and `uniqueMode` from the effective evaluation are used when both pinned and live are present.
- **Empty query:** Do not capture `search_executed` when the user clears the search.
- **PostHog sendBeacon:** If the SDK falls back to `sendBeacon`, those requests bypass the service worker. Prefer `fetch` transport if configurable.
