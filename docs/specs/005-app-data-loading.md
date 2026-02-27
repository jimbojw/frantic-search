# Spec 005: App Data Loading

**Status:** Implemented

## Goal

Make the ETL output (`data/dist/columns.json`) available to the app's WebWorker at runtime, in both local development and production (GitHub Pages), without manual copy steps or environment-specific logic.

## Background

The ETL pipeline (Spec 003) produces `data/dist/columns.json` at the project root. The app (ADR-003) runs search in a WebWorker that needs this data. The app is deployed as a static SPA to GitHub Pages (ADR-004) at a subpath (`/<repo>/`). The data format is JSON, compressed transparently by the hosting layer (ADR-005).

The challenge: `data/dist/` lives outside the `app/` workspace, but Vite's build only emits files from within the app directory (source code, public assets). The solution must bridge this gap for both `vite dev` and `vite build` without requiring the developer (or CI) to run a manual copy step.

## Design

### Relative base path

The Vite config sets `base: './'` so all asset URLs in HTML, CSS, and JS are emitted as relative paths. This means the same build output works at any deployment path — `localhost:5173/`, `username.github.io/frantic-search/`, or elsewhere — with no path rewriting.

### Vite plugin: `serveData`

A small inline Vite plugin in `vite.config.ts` handles both dev and build:

```typescript
function serveData(): Plugin {
  const dataFile = path.resolve(__dirname, '..', 'data', 'dist', 'columns.json')

  return {
    name: 'serve-data',

    configureServer(server) {
      // Dev: serve columns.json from data/dist/ at the app root
      server.middlewares.use('/columns.json', (_req, res) => {
        if (!fs.existsSync(dataFile)) {
          res.writeHead(404)
          res.end('columns.json not found — run ETL first')
          return
        }
        res.setHeader('Content-Type', 'application/json')
        fs.createReadStream(dataFile).pipe(res)
      })
    },

    closeBundle() {
      // Build: copy columns.json into the output directory
      const outDir = path.resolve(__dirname, 'dist')
      if (fs.existsSync(dataFile)) {
        fs.copyFileSync(dataFile, path.join(outDir, 'columns.json'))
      }
    },
  }
}
```

**Dev behavior:** Vite's dev server intercepts requests to `/columns.json` and streams the file from `data/dist/`. No file is copied; the ETL output is the single source of truth.

**Build behavior:** After Vite finishes writing the output bundle, the `closeBundle` hook copies `columns.json` into `app/dist/`. The file is deployed alongside the SPA assets.

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

1. `npm run dev` serves `columns.json` and `thumb-hashes.json` at the app root without any manual copy step (assuming ETL has been run).
2. `npm run build -w app` produces both files (hashed and stable names) in `app/dist/` alongside the SPA assets.
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
