# Spec 076: Worker Protocol and List Caching

**Status:** Implemented

**Depends on:** Spec 004 (Evaluation Cache), Spec 075 (Card List Data Model and Persistence), Spec 024 (Index-Based Result Protocol), Spec 121 (printing-domain list representation), Spec 123 (metadata index for `#` queries)

## Goal

Extend the worker protocol so the search worker caches one or more named card lists. The worker receives list updates via a dedicated message and uses the cached data when evaluating `my:` queries (e.g. `my:cart`, `my:trash` for MVP; future variants such as `my:deck:user-deck-name` or `my:collection`). List data is not sent with every search request.

## Background

The app runs search in a WebWorker (ADR-003). Spec 075 defines the main-thread storage for card lists (IndexedDB, BroadcastChannel, main thread materialized view). To support `my:` queries (e.g. `my:list` for MVP; later `my:deck:name`, `my:collection`, etc.), the worker must know which cards are in each named list. Sending full list data with every `search` message would be wasteful — the user may type many keystrokes without changing any list, and structured-cloning list data on each request adds latency.

The solution: the worker caches **sparse printing indices** and an optional **metadata index** per named list. The main thread sends a dedicated `list-update` message only when a list changes, transferring `Uint32Array` buffers zero-copy via `Transferable`. The worker starts with an empty cache until the first `list-update` for each list arrives.

## Scope

- **In scope:** `list-update` message type with `listId`; worker-side list cache (separate from NodeCache); full NodeCache eviction on every list-update; transferable `Uint32Array` printing indices; optional metadata index (Spec 123); main-thread mask building and send logic.
- **Out of scope:** Query evaluation for `my:list` (Spec 082+); list management UI (future spec).

## Technical Details

### Protocol Extension

Extend `ToWorker` in `shared/src/worker-protocol.ts`:

```typescript
export type ToWorker =
  | { type: 'search'; queryId: number; query: string; pinnedQuery?: string; /* ... */ }
  | {
      type: 'list-update';
      listId: string;
      printingIndices?: Uint32Array;
      /** Spec 123: pan-list metadata index for # queries. keys[i] → indexArrays[i]. */
      metadataIndex?: { keys: string[]; indexArrays: Uint32Array[] };
    };
```

For `list-update`, pass `printingIndices` (and optionally `metadataIndex` arrays) as [transferables](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) so buffers are moved, not copied. The `listId` identifies which named list the data belongs to (e.g. `"default"` for MVP `my:list`; future values like `"deck:user-deck-name"` or `"collection"`).

### List Data Semantics

- **listId:** Identifies the named list. MVP uses a single list (e.g. `"default"`); multiple lists are supported simultaneously.
- **printingIndices:** `Uint32Array` of **unique** printing row indices that belong to this list. The array is **deduplicated** — each printing appears at most once, regardless of how many instances reference it. This is sufficient for `my:` query evaluation (membership test). Sent when printing data is available (`printingCount > 0`); otherwise omitted.
- **metadataIndex:** Spec 123 pan-list metadata for `#` queries (zone, tags, collection_status, variant). `keys[i]` is a normalized metadata string; `indexArrays[i]` is a `Uint32Array` of printing row indices that carry that metadata value. Sent only for the default list.

**Note:** Because `printingIndices` is deduplicated, copy counts (e.g. "4× Lightning Bolt") are not preserved. Consumers that need per-instance data (e.g. Spec 185 deck scoring) should use a separate request/response protocol carrying resolved per-instance lines rather than relying on the `list-update` cache.

### Instance Resolution

The main thread resolves `InstanceState` entries to printing row indices using `buildMasksForList` in `shared/src/list-mask-builder.ts`:

- **Printing-level instances** (`scryfall_id` set): Look up `(scryfall_id, encodedFinish)` in the printing lookup map. When `finish` is null but `scryfall_id` is set, treat as nonfoil (`encodeFinish(finish ?? 'nonfoil')`).
- **Oracle-only instances** (`scryfall_id` null): Resolve to the **canonical printing** for that oracle via `canonicalPrintingPerFace` map (Spec 121). Preference order: standard nonfoil > standard any finish > nonfoil > first in group.
- Instances whose `oracle_id` is not in the canonical face map are skipped (unresolved).

### Main Thread Responsibilities

1. On list load or change: call `buildMasksForList` with the `MaterializedView`, relevant lookup maps, and `printingCount`. This yields a deduplicated `Uint32Array` of printing indices.
2. Build lookup maps from display columns:
   - `oracleToCanonicalFace`: `oracle_id` → canonical face index (from `display.oracle_ids` + `display.canonical_face`).
   - `printingLookup`: `(scryfall_id, finish)` → printing row index (from `PrintingDisplayColumns`).
   - `canonicalPrintingPerFace`: canonical face index → canonical printing row index (Spec 121).
3. Build `metadataIndex` via `buildMetadataIndex` for the default list (Spec 123). Includes zone, tags, collection_status, and variant metadata from all non-trash lists.
4. Send `{ type: 'list-update', listId, printingIndices, metadataIndex? }` to worker with transferables.
5. When `printings-ready` arrives: rebuild list data and send `list-update` again (so the worker receives `printingIndices` once printing data exists).
6. On BroadcastChannel receipt (cross-tab): after updating the materialized view, rebuild data for the affected list and send `list-update` to this tab's worker. Each tab has its own dedicated worker (ADR-003); cross-tab list changes must propagate to each tab's worker independently.

### Worker Responsibilities

The worker maintains **two distinct caches**:

1. **List cache (separate):** `Map<listId, { printingIndices?, metadataIndex? }>`. Holds the data sent via `list-update`. Each list's data persists until overwritten by a new `list-update` for that `listId`. Multiple lists (e.g. `my:list`, `my:cart`) can coexist — a query like `-my:list my:cart` requires data for both, so the worker must retain each list's data independently.

2. **NodeCache (evaluation cache):** The existing AST evaluation cache (Spec 004). When a `my:` leaf is evaluated, it reads from the list cache and produces a buffer. That result is interned in NodeCache like any other leaf. Parent nodes (AND, OR, NOT) are also interned. The NodeCache avoids redundant work during typing — e.g. `f:commander` stays cached while the user types `tarmog...`.

**On `list-update`:**
1. Overwrite the list cache entry for that `listId` with the incoming data.
2. Evict the entire NodeCache (`cache.clearAllComputed()`). Full eviction is correct because any cached `my:*` result may be stale, and we do not track which lists appear in the current query. List updates are rare; the cost of re-evaluating a handful of nodes on the next search is acceptable.

**On `search`:**
1. Evaluate the query. The evaluator uses the worker's list cache when evaluating `my:` leaves.
2. `my:` leaf results and their parent nodes are interned in NodeCache as usual.

**Initial state:** The list cache starts empty (no entries). The main thread sends a `list-update` for each persisted list during startup (see Startup Sequencing). Until that message arrives, `getListMask` returns `null` for all lists.

### Startup Sequencing

1. Worker posts `ready` with `DisplayColumns`.
2. Main thread receives `ready`, stores display data, builds `oracle_id` → canonical face index map from `display.oracle_ids` and `display.canonical_face`.
3. Main thread replays list log from IndexedDB, materializes view (Spec 075).
4. Main thread builds list data for every list: default list, trash list, and any other lists in `view.lists` (including empty lists).
5. Main thread sends `list-update` for each list to the worker.
6. Main thread begins forwarding user input as `search` messages.

The main thread MUST send `list-update` for both the default list and the trash list before any `search` message, even if either list is empty. Trash has no metadata in `view.lists` but must still receive updates. This ensures the worker can distinguish "known empty list" (empty `printingIndices` in cache) from "unknown list" (`getListMask` returns `null`) from the first query onward.

### Empty List Behavior

When a list is empty, send `list-update` with an empty `Uint32Array(0)` for `printingIndices` (when `printingCount > 0`). Omit `metadataIndex`. This keeps worker semantics consistent and avoids ambiguity between "no list cached" and "empty list." Do not omit the message.

## Acceptance Criteria

- [x] `ToWorker` includes `list-update` variant with `listId`, `printingIndices?`, and `metadataIndex?`
- [x] Worker maintains separate list cache `Map<listId, { printingIndices?, metadataIndex? }>`; overwrites entry on `list-update`
- [x] Worker evicts entire NodeCache on every `list-update`
- [x] Main thread builds printing indices from list entries via `buildMasksForList` and sends on load/change
- [x] Transferables used for zero-copy transfer of `Uint32Array` buffers
- [x] No list data sent with `search` messages
- [x] Worker starts with no data cached; handles first `list-update` before any `my:` query
- [x] Empty list sends `list-update` with empty `Uint32Array(0)` (not omitted)
- [x] Main thread builds `(scryfall_id, finish)` → printing index lookup from `PrintingDisplayColumns`; resolves oracle-only instances to canonical printing (Spec 121)
- [x] Metadata index (Spec 123) sent for default list with zone/tags/collection_status/variant

## Implementation Notes

- 2026-03-07: Extended to include trash. Main thread now sends list-update for `TRASH_LIST_ID` in addition to `view.lists.keys()`; trash is a system list without metadata.
- 2026-03-12: Mask building fix: when an Instance has `scryfall_id` but `finish` is null (e.g. `1 Reliquary Tower (TDC) 386` with no foil marker), treat as nonfoil so `printingMask` is set. Previously, `scryfall_id && finish` skipped these entries, causing printing-only lists to be treated as oracle-only; `my:list unique:prints` then expanded to all printings instead of the listed one. `list-mask-builder.buildMasksForList` now uses `encodeFinish(finish ?? 'nonfoil')`; `hasPrintingLevelEntries` and `getMatchingCount` updated for consistency.
- 2026-04-10: **Wire format update** — Original spec described `faceMask: Uint8Array` and `printingMask?: Uint8Array` (dense bitmasks). Implementation evolved to **sparse `printingIndices: Uint32Array`** (deduplicated printing row indices) per Spec 121, plus **`metadataIndex`** per Spec 123. Dense face-level masks were removed; `my:` evaluation now operates in the printing domain. Spec text updated to reflect the as-built protocol.
