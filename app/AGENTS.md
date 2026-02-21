# app/ — Agent Instructions

This workspace is the SolidJS single-page application. It is currently in early development (scaffold stage).

## Dev Server

```
npm run dev        # from repo root — starts Vite dev server with HMR
```

Do not run `npm run build` during agent sessions — it switches the output directory to production assets and can interfere with HMR.

## Architecture

- **SolidJS** for UI rendering. Fine-grained reactivity, no virtual DOM. See ADR-002 for rationale.
- **WebWorker** for search. The main thread handles rendering and user input; the worker owns the card index and runs all query evaluation off the main thread. See ADR-003.
- Communication between main thread and worker uses `postMessage`. Prefer `Transferable` objects (e.g., `ArrayBuffer`) to minimize serialization overhead.

## Dependencies

- `solid-js` — UI framework.
- `@frantic-search/shared` — Query engine, types, and bitmask constants (workspace dependency).
- `vite` + `vite-plugin-solid` — Build tooling.

## Deployment

Static SPA deployed to GitHub Pages via GitHub Actions (ADR-004). The built app plus processed card data are published together. No server-side logic.
