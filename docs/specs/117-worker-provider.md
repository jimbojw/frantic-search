# Spec 117: WorkerProvider — Centralized Main Thread / Worker Boundary

**Status:** Draft

**Depends on:** Spec 007 (Worker Protocol), Spec 024 (Index-Based Result Protocol), Spec 076 (Worker Protocol and List Caching), Spec 114 (Worker-Based Deck List Validation), Spec 116 (Index-Based Deck Validation Protocol)

## Goal

Introduce a **WorkerProvider** at the app root that centralizes the main thread / worker boundary. The provider owns worker lifecycle, display data, index resolution, and higher-level RPC APIs. It provides a single source of truth for worker-related state and a clean abstraction for consumers, while preserving the performance benefits of the current index-based transfer protocol.

Migration of existing consumers to use the WorkerProvider is **out of scope** for this spec. The spec defines the provider's responsibilities and the vision; adoption is incremental.

## Motivation

### 1. Leaky abstractions

The worker returns **indices** (Int32Array) instead of strings for performance — Transferable payloads, smaller wire traffic. The main thread holds `DisplayColumns` and `PrintingDisplayColumns` and performs index → string lookups. This conversion is scattered:

- **DeckEditor:** Receives `{ result, indices }` from validation, stores `{ oracleIndex, scryfallIndex }`, passes `display` and `printingDisplay` into `indicesToParsedEntry` to resolve oracle_id and scryfall_id.
- **list-mask-builder:** Builds reverse lookups (`buildOracleToCanonicalFaceMap`, `buildPrintingLookup`) to convert `InstanceState` (oracle_id, scryfall_id, finish) → faceMask, printingMask for `list-update`.
- **App:** Owns `sendListUpdatesFor`, which builds these maps and posts to the worker.
- **SearchResults, CardDetail:** Direct `display.scryfall_ids[ci]`, `printingDisplay.scryfall_ids[pi]` lookups.

Each consumer must know about indices, display, and printingDisplay. The boundary is leaky.

### 2. Worker status not visible to consumers

`workerStatus` is owned by App and passed to search-related components (DualWieldLayout, SearchResults, WorkerErrorBanner). The Lists page is a sibling view — it does not receive `workerStatus`. When the worker is loading or has failed, DeckEditor shows "Validating..." indefinitely and users on the Lists page never see the WorkerErrorBanner. Worker status is a cross-cutting concern that should be available to any consumer.

### 3. Duplication of display data flow

`display` and `printingDisplay` flow from App through multiple props. SearchContext receives them for the search view; ListsPage receives them for the deck editor. There is no single source of truth for "worker-derived data."

## Vision

A **WorkerProvider** wraps the app (or the relevant subtree) and provides:

1. **Worker lifecycle** — `workerStatus`, `display`, `printingDisplay` as reactive accessors.
2. **Index resolution** — `oracleIdForFace(faceIndex)`, `scryfallIdForPrinting(printingIndex)` — or higher-level APIs that return resolved data without exposing indices.
3. **Higher-level RPC** — `validateDeckLines(lines)` returns `ParsedEntry[]` with oracle_id and scryfall_id already resolved; `serialize(instances, format)` returns `string`. Consumers do not see indices.
4. **Reverse lookup memoization** — `buildOracleToCanonicalFaceMap`, `buildPrintingLookup` memoized when display/printingDisplay change, used internally for `list-update` and exposed if needed.
5. **Worker error visibility** — WorkerErrorBanner or equivalent can be rendered inside the provider for all views, not just search.

Performance is preserved: the worker still sends indices (Transferable); lookup is O(1) array access; reverse maps are memoized in one place.

## Responsibilities of the WorkerProvider

### 1. Worker lifecycle

- Create and own the worker instance.
- Handle `worker.onmessage` — status updates, `validate-result`, `serialize-result`, `search` result, etc.
- Expose `workerStatus: Accessor<'loading' | 'ready' | 'error'>`.
- Expose `display: Accessor<DisplayColumns | null>` and `printingDisplay: Accessor<PrintingDisplayColumns | null>` (updated when worker posts `status: 'ready'` and `status: 'printings-ready'`).

### 2. Index resolution (index → string)

- `oracleIdForFace(faceIndex: number): string` — `display.oracle_ids[faceIndex] ?? ''`.
- `scryfallIdForPrinting(printingIndex: number): string | null` — `printingDisplay.scryfall_ids[printingIndex] ?? null`.
- These are trivial lookups but centralize the "index is an internal detail" concern.

### 3. Higher-level RPC APIs

- **`validateDeckLines(lines: string[]): Promise<{ result: LineValidationResult[]; parsedEntries: ParsedEntry[] }>`**  
  Posts `validate-list` to worker, receives `{ result, indices }`, resolves indices to oracle_id/scryfall_id using display/printingDisplay, returns `ParsedEntry[]` with IDs filled in. Consumers never see indices.

- **`serialize(instances: InstanceState[], format: DeckFormat): Promise<string>`**  
  Posts `serialize-list` to worker, returns serialized text. (Same as current `serializeDeckList`; naming may align.)

- **`sendListUpdates(listId: string, faceMask: Uint8Array, printingMask?: Uint8Array): void`**  
  Or a higher-level API that accepts a list of instances and builds the masks internally. The provider builds `buildOracleToCanonicalFaceMap` and `buildPrintingLookup` from display/printingDisplay (memoized) and constructs masks for the worker.

### 4. Reverse lookup memoization

- `oracleToCanonicalFace: Accessor<Map<string, number> | null>` — memoized when display changes.
- `printingLookup: Accessor<Map<string, number> | null>` — memoized when printingDisplay changes.
- Used internally for `sendListUpdates` and exposed if other consumers need them (e.g. list-mask-builder logic could move into the provider).

### 5. Optional: error banner placement

- WorkerProvider could render `WorkerErrorBanner` so it is visible for all views (lists, search, card, report), not just search. The banner is a sibling of the view content; consumers do not need to know about it.

## Potential / Known Users

The following consumers are candidates for migrating to WorkerProvider (migration is out of scope for this spec):

| Consumer | Current usage | Potential WorkerProvider usage |
|----------|---------------|--------------------------------|
| **DeckEditor** | Receives `display`, `printingDisplay`, `onValidateRequest`; does `indicesToParsedEntry` with indices from worker | `validateDeckLines(lines)` returns `ParsedEntry[]`; `display()` or `printingDisplay()` for `buildValidationResult`; `workerStatus()` for status |
| **ListsPage** | Passes `display`, `printingDisplay`, `onValidateRequest`, `onSerializeRequest` to DeckEditor | Passes `useWorkerContext()` or provider ref to DeckEditor; or DeckEditor consumes directly |
| **SearchContext** | Receives `display`, `printingDisplay` from App | Consumes `display()`, `printingDisplay()` from WorkerProvider |
| **CardDetail** | Receives `display`, `printingDisplay` as props | Consumes from WorkerProvider |
| **CardListStore** | Uses `sendListUpdatesFor` callback (App) | Callback could use WorkerProvider's `sendListUpdates` or `oracleToCanonicalFace` / `printingLookup` |
| **App** | Owns worker, display, printingDisplay, validateLines, serializeDeckList, sendListUpdatesFor | WorkerProvider owns these; App wraps the app with WorkerProvider and passes provider ref or context to children |
| **WorkerErrorBanner** | Rendered inside search view's `<main>` | Rendered inside WorkerProvider for all views |
| **list-mask-builder** | Called by App with display, printingDisplay | Could be called by WorkerProvider with its own display/printingDisplay; or provider exposes memoized maps |
| **DualWieldLayout** | Receives `workerStatus` | Consumes from WorkerProvider |
| **pane-state-factory** | Receives `display`, `printingDisplay` in opts | Receives from WorkerProvider via parent or context |

## Out of Scope

- **Migration of implementations** — No acceptance criterion that all consumers move to WorkerProvider at once. Adoption is incremental.
- **Worker protocol changes** — The wire format (indices, Transferable) remains the same. WorkerProvider is a main-thread abstraction.
- **SearchContext redesign** — SearchContext continues to provide search-specific derived state. It may consume WorkerProvider for display/printingDisplay; the provider does not replace SearchContext.

## Dependencies

- Spec 007, 024, 076 — Worker protocol and index-based IPC.
- Spec 114, 116 — Deck validation and index-based validation protocol.

## Implementation Notes

- (To be added when implementation begins.)
