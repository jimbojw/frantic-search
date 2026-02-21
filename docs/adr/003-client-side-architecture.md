# ADR-003: Client-Side Architecture

**Status:** Accepted

## Context

The app performs instant search across ~27,000+ unique MTG cards. Filtering and ranking this dataset on every keystroke must not block the UI thread, especially on mobile devices.

## Decision

Build the app as a **Single Page Application (SPA)** with a dedicated **WebWorker** for search.

- The **main thread** handles rendering (SolidJS) and user input.
- The **WebWorker** owns the card index and executes all search/filter logic off the main thread.
- Communication between the two uses `postMessage`.

## Consequences

- **Positive:** The UI remains responsive during search, even on low-end mobile hardware.
- **Positive:** The WebWorker can load and decompress the card dataset without blocking rendering.
- **Negative:** Data must be serialized across the main thread / worker boundary via `postMessage`. Transferable objects (e.g., `ArrayBuffer`) can mitigate this.
- **Negative:** Debugging is slightly more complex (separate DevTools context for the worker).

## SharedWorker Consideration (2026-02-20)

A SharedWorker would allow multiple tabs to share a single card index in memory, avoiding redundant ~8 MB loads. However, SharedWorker is not supported in Safari on iOS as of early 2026. Since mobile is a primary target (and iOS/Safari is a significant share of mobile traffic), we defer SharedWorker in favor of a standard WebWorker. This can be revisited when Safari support ships — the migration path is straightforward since the `postMessage` API is identical.
