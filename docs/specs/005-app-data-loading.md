# Spec 005: App Data Loading

**Status:** Implemented

## Goal

Make the ETL output (`data/dist/columns.json`, `thumb-hashes.json`, `printings.json`) available to the app at runtime, in both local development and production (GitHub Pages), without manual copy steps or environment-specific logic.

## Background

The ETL pipeline (Spec 003, Spec 046) produces data files at the project root: `columns.json` (face-level searchable data), `thumb-hashes.json` (display placeholders), and `printings.json` (printing-level data). The app (ADR-003) runs search in a WebWorker that needs the core data. The main thread loads supplemental files after the worker posts `ready`. The app is deployed as a static SPA to GitHub Pages (ADR-004) at a subpath (`/<repo>/`). The data format is JSON, compressed transparently by the hosting layer (ADR-005).

The challenge: `data/dist/` lives outside the `app/` workspace, but Vite's build only emits files from within the app directory (source code, public assets). The solution must bridge this gap for both `vite dev` and `vite build` without requiring the developer (or CI) to run a manual copy step.

## Design

### Relative base path

The Vite config sets `base: './'` so all asset URLs in HTML, CSS, and JS are emitted as relative paths. This means the same build output works at any deployment path — `localhost:5173/`, `username.github.io/frantic-search/`, or elsewhere — with no path rewriting.

### Vite plugin: `serveData`

A small inline Vite plugin in `vite.config.ts` handles dev and build for three data files:

| File               | Loaded by      | Purpose                                      |
|---------------------|----------------|----------------------------------------------|
| `columns.json`      | WebWorker      | Core searchable face-level data              |
| `thumb-hashes.json` | Main thread    | Art crop and card image placeholders (Spec 017) |
| `printings.json`    | Main thread    | Printing-level data for set, rarity, price, etc. (Spec 046) |

**Dev behavior:** The dev server intercepts requests to `/columns.json`, `/thumb-hashes.json`, and `/printings.json` and streams each from `data/dist/`. No files are copied; the ETL output is the single source of truth.

**Build behavior:** The `closeBundle` hook copies all three files into `app/dist/` with content-hashed filenames (for cache busting) and stable names (for restore and PWA fallback). The PWA runtime cache includes rules for all three.

### WebWorker data fetch

The WebWorker fetches the data using a relative URL:

```typescript
const response = await fetch('columns.json')
const data: ColumnarData = await response.json()
```

Because both `base` and the fetch URL are relative, the path resolves correctly in all environments:

| Environment                  | Worker script URL                                          | Fetch resolves to                                            |
|------------------------------|------------------------------------------------------------|--------------------------------------------------------------|
| Dev (`vite dev`)             | `http://localhost:5173/worker.js`                          | `http://localhost:5173/columns.json`                         |
| Production (GitHub Pages)    | `https://user.github.io/frantic-search/assets/worker.js`  | `https://user.github.io/frantic-search/assets/columns.json` |

**Note on production path:** Vite places JS assets (including the worker) in the `assets/` subdirectory. A relative `fetch('columns.json')` from a worker in `assets/` resolves to `assets/columns.json`, not the root. Two options:

1. Place `columns.json` inside `assets/` at build time (adjust `closeBundle` target).
2. Use `fetch(new URL('../columns.json', import.meta.url))` in the worker to resolve relative to the worker's location.

Option 2 is more robust — it works regardless of Vite's output directory structure and explicitly communicates intent. This is the recommended approach.

### Error handling

If `columns.json` is not available (ETL hasn't been run), the WebWorker posts an error message back to the main thread. The UI displays a clear error state prompting the user to check the data pipeline. During dev, the Vite plugin returns a 404 with a helpful message.

## Prerequisites

The ETL pipeline must have been run (`npm run etl -- download && npm run etl -- process`) before the data is available. This is a one-time setup step for local development and is automated in CI (Spec 006).

## Acceptance Criteria

1. `npm run dev` serves `columns.json`, `thumb-hashes.json`, and `printings.json` at the app root without any manual copy step (assuming ETL has been run).
2. `npm run build -w app` produces all three files (hashed and stable names) in `app/dist/` alongside the SPA assets.
3. The WebWorker successfully fetches and parses `columns.json` using a relative URL in both dev and production.
4. If a data file is missing during dev, the server returns a 404 with a message suggesting the ETL be run.
5. The Vite config uses `base: './'` — no absolute paths or environment-specific base configuration.

## Implementation Notes

- 2026-02-27: Data loading split into two files (Spec 045). The `serveData`
  plugin now handles both `columns.json` (core searchable data, loaded by the
  worker) and `thumb-hashes.json` (display-only ThumbHash placeholders, loaded
  by the main thread after the worker posts `ready`). Both files get
  content-hashed filenames for cache busting and stable names for the
  restore command. The `__THUMBS_FILENAME__` define is injected alongside
  `__COLUMNS_FILENAME__`.
- 2026-03-04: Added `printings.json` (Spec 046). The plugin serves and copies
  it alongside columns and thumb-hashes. The main thread fetches it after
  `ready` per Spec 048. `__PRINTINGS_FILENAME__` define added. PWA runtime
  cache includes printings.
