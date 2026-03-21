# Spec 145: App Shell Browser Hints

**Status:** Implemented

**Implements:** [GitHub #162](https://github.com/jimbojw/frantic-search/issues/162)

**Depends on:** Spec 143 (Shell-First Loading), Spec 005 (App Data Loading)

## Goal

Collapse the first-visit loading waterfall by injecting browser hints in the app shell HTML so the browser fetches app chunks and worker data in parallel with the initial parse.

## Background

The current loading waterfall is sequential:

```
app shell loads → app JS loads → worker created → worker fetches data files
```

The browser has no visibility into later stages until each preceding stage completes. Since the app shell is the first thing the browser parses, it is the ideal place to hint at downstream assets so the browser can begin fetching them in parallel.

The service worker already handles repeat visits efficiently. This spec is about improving the first-visit experience. Baseline stats exist for pageview → `faces_loaded` latency (p50: 1.9s, p90: 5.9s) to measure against after shipping.

## Design

### Vite Default vs. HTML-Level Hints

**What Vite does by default:** Vite injects a `__vitePreload` helper into the main bundle. When a dynamic import (e.g. `lazy(() => import('./App'))`) is about to execute, this helper runs first and injects a `<link rel="modulepreload">` at runtime, then the import proceeds. The browser never sees preload links in the initial HTML; they are created by JavaScript after the main script has loaded and run. That means the browser cannot start fetching dynamic chunks until the main script has been downloaded and parsed.

**What we do differently:** We inject static `<link>` tags directly into the HTML at build time. The browser discovers these during the initial HTML parse—before any JavaScript runs. It can begin fetching the worker script and data files in parallel with the main script download, collapsing the waterfall.

### Hint Types

**1. `<link rel="modulepreload">` for the worker chunk**

Vite's runtime preload does not apply to the worker (loaded via `import './worker?worker'`, not a dynamic import). We inject a static `modulepreload` link for the worker so the browser fetches, parses, and compiles it in parallel with the initial load.

**2. `<link rel="preload" as="fetch" crossorigin>` for worker data files**

The data files the worker fetches are known at build time: `columns.json`, `printings.json`, `otags.json`, `atags.json`, `flavor-index.json`. We inject preload links using the content-hashed filenames from the `serveData` plugin. The `crossorigin` attribute is required for the preloaded response to be reused by the worker's `fetch()`.

**3. `<link rel="preload" as="worker">` for the worker script**

Front-loads the worker bundle download, reducing worker init time.

### Technical Approach

Add a `transformIndexHtml` plugin (order: `post`) that runs during build:

- Read `ctx.bundle` / `ctx.chunks` to get hashed output filenames.
- Identify the worker chunk (e.g. by filename pattern matching `worker`).
- Inject `<link rel="modulepreload" href="...">` for the worker chunk.
- Inject `<link rel="preload" href="..." as="worker">` for the worker chunk.
- For data files: reuse the content-hash and filename resolution from `serveData`. Inject `<link rel="preload" href="..." as="fetch" crossorigin>` for each of columns, printings, otags, atags, flavor-index.

The plugin may extend `serveData` or be a companion plugin. Data file preload paths use content-hashed filenames when available (build only). In dev mode, `transformIndexHtml` runs but the bundle structure differs; we either skip data preloads in dev or use stable names—implementation chooses the simpler approach.

### Injection Location

Inject all link tags into `<head>`, before `</head>`.

## Scope of Changes

| File | Change |
|------|--------|
| `docs/specs/145-app-shell-browser-hints.md` | New spec (this document). |
| `app/vite.config.ts` | Add or extend plugin with `transformIndexHtml` for preload hints. |
| `docs/specs/143-shell-first-loading.md` | Add "Extended by Spec 145" note. |

## Acceptance Criteria

1. Production build injects correct preload links into `dist/index.html`.
2. Data file preload paths use content-hashed names when ETL output exists.
3. Worker chunk gets `modulepreload` and `preload as="worker"`.
4. No regression in dev server or existing tests.
5. Typecheck passes.

## Out of Scope

- 103 Early Hints — a separate CDN-level change worth considering independently.
- Repeat-visit performance — already handled by the service worker.

## Implementation Notes

- 2026-03-21: Extended `serveData` plugin with `transformIndexHtml` (order: post) for data file preloads and `generateBundle` + `closeBundle` for worker preload links. Data files use `transformIndexHtml` with `ctx.bundle` (skipped in dev when bundle is absent). Worker chunk not reliably in `ctx.bundle` under Vite 7/Rolldown; added fallback in `closeBundle` to scan `dist/assets/` for `worker*.js` and patch `index.html` with `modulepreload` and `preload as="worker"` links.
