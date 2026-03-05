# Spec 076: Worker Protocol and List Caching

**Status:** Implemented

**Depends on:** Spec 004 (Evaluation Cache), Spec 075 (Card List Data Model and Persistence), Spec 024 (Index-Based Result Protocol)

## Goal

Extend the worker protocol so the search worker caches one or more named card lists. The worker receives list updates via a dedicated message and uses the cached data when evaluating `my:` queries (e.g. `my:cart`, `my:trash` for MVP; future variants such as `my:deck:user-deck-name` or `my:collection`). List data is not sent with every search request.

## Background

The app runs search in a WebWorker (ADR-003). Spec 075 defines the main-thread storage for card lists (IndexedDB, BroadcastChannel, main thread materialized view). To support `my:` queries (e.g. `my:list` for MVP; later `my:deck:name`, `my:collection`, etc.), the worker must know which cards are in each named list. Sending full list data with every `search` message would be wasteful — the user may type many keystrokes without changing any list, and structured-cloning list data on each request adds latency.

The solution: the worker caches up to two compact bitmasks per named list. Since list Instances are either oracle-level or printing-level entries, `my:` evaluation is a hybrid card-and-printings check — each list has at a card-level mask (`faceMask`) and optionally a printings-level mask (`printingMask`). The main thread sends a dedicated `list-update` message only when a list changes. Each mask is a `Uint8Array` transferred zero-copy via `Transferable`, avoiding serialization overhead. The worker starts with empty masks until the first `list-update` for each list arrives.

## Scope

- **In scope:** `list-update` message type with `listId`; worker-side list mask cache (separate from NodeCache); full NodeCache eviction on every list-update; transferable `Uint8Array` masks; main-thread mask building and send logic.
- **Out of scope:** Query evaluation for `my:list` (future spec); list management UI (future spec).

## Technical Details

### Protocol Extension

Extend `ToWorker` in `shared/src/worker-protocol.ts`:

```typescript
export type ToWorker =
  | { type: 'search'; queryId: number; query: string; pinnedQuery?: string }
  | { type: 'list-update'; listId: string; faceMask: Uint8Array; printingMask?: Uint8Array };
```

For `list-update`, pass `faceMask` (and optionally `printingMask`) as a [transferable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) so the buffer is moved, not copied. The `listId` identifies which named list the mask belongs to (e.g. `"default"` for MVP `my:list`; future values like `"deck:user-deck-name"` or `"collection"`).

### Mask Semantics

- **listId:** Identifies the named list. MVP uses a single list (e.g. `"default"`); future variants support multiple lists.
- **faceMask:** `Uint8Array(faceCount)`. `faceMask[canonicalFaceIndex] = 1` if that card (oracle) is in the list. Always sent.
- **printingMask:** `Uint8Array(printingCount)`. `printingMask[printingIndex] = 1` if that printing is in the list. Sent when the list has printing-level entries and printing data is loaded; otherwise omitted (worker treats as all zeros).

### Main Thread Responsibilities

1. On list load or change: build `faceMask` from oracle-level Instances; build `printingMask` from printing-level Instances when printing data is available (`scryfall_id` and `finish`).
2. Map `oracle_id` → canonical face index using `display.oracle_ids` — index in the array is the face row index; `canonical_face` maps face → canonical for multi-face cards.
3. Map Instance entries `(scryfall_id, finish)` to printing row indices using `PrintingDisplayColumns`. Build a lookup when `printings-ready` arrives; reuse for all lists. Encode `InstanceState.finish` (string) to match the numeric finish in the printing columns (0=nonfoil, 1=foil, 2=etched) for the lookup.
4. Send `{ type: 'list-update', listId, faceMask, printingMask? }` to worker with transfer. Include `printingMask` when the list has printing-level entries and printing data is loaded.
5. When `printings-ready` arrives: if any list has printing-level entries, rebuild that list's masks and send `list-update` again (so the worker receives `printingMask` once printing data exists).
6. On BroadcastChannel receipt (cross-tab): after updating the materialized view, rebuild masks for the affected list and send `list-update` to this tab's worker. Each tab has its own dedicated worker (ADR-003); cross-tab list changes must propagate to each tab's worker independently.

### Worker Responsibilities

The worker maintains **two distinct caches**:

1. **List mask cache (separate):** `Map<listId, { faceMask, printingMask? }>`. Holds the raw masks sent via `list-update`. Each list's masks persist until overwritten by a new `list-update` for that `listId`. Multiple lists (e.g. `my:list`, `my:cart`) can coexist — a query like `-my:list my:cart` requires masks for both, so the worker must retain each list's masks independently.

2. **NodeCache (evaluation cache):** The existing AST evaluation cache (Spec 004). When a `my:` leaf is evaluated, it reads masks from the list mask cache and produces a buffer (OR of face mask and promoted printing mask). That result is interned in NodeCache like any other leaf. Parent nodes (AND, OR, NOT) are also interned. The NodeCache avoids redundant work during typing — e.g. `f:commander` stays cached while the user types `tarmog...`.

**On `list-update`:**
1. Overwrite the list mask cache entry for that `listId` with the incoming mask(s).
2. Evict the entire NodeCache (clear all `computed` on interned nodes). The eviction loop mirrors the existing pattern in `NodeCache.setPrintingIndex()`; consider extracting a shared `clearComputed()` method. Full eviction is correct because any cached `my:*` result may be stale, and we do not track which lists appear in the current query. List updates are rare; the cost of re-evaluating a handful of nodes on the next search is acceptable.

**On `search`:**
1. Evaluate the query. The evaluator (future spec) uses the worker's list mask cache when evaluating `my:` leaves.
2. `my:` leaf results and their parent nodes are interned in NodeCache as usual.

**Initial state:** The list mask cache starts empty (no entries). The main thread sends a `list-update` for each persisted list during startup (see Startup Sequencing). Until that message arrives, `getListMask` returns `null` for all lists. The startup contract guarantees this window closes before the first `search` message.

### Startup Sequencing

1. Worker posts `ready` with `DisplayColumns`.
2. Main thread receives `ready`, stores display data, builds `oracle_id` → canonical face index map from `display.oracle_ids` and `display.canonical_face`.
3. Main thread replays list log from IndexedDB, materializes view (Spec 075).
4. Main thread builds masks for every persisted list (including the default list, even if empty).
5. Main thread sends `list-update` for each list to the worker.
6. Main thread begins forwarding user input as `search` messages.

The main thread MUST send `list-update` for the default list before any `search` message, even if the list is empty. This ensures the worker can distinguish "known empty list" (zeroed mask in cache) from "unknown list" (`getListMask` returns `null`) from the first query onward.

### Empty List Behavior

When a list is empty, send `list-update` with a zeroed `faceMask` (same length as faceCount). Omit `printingMask` (worker treats as zeros). This keeps worker semantics consistent and avoids ambiguity between "no list cached" and "empty list." Do not omit the message.

## Acceptance Criteria

- [x] `ToWorker` includes `list-update` variant with `listId`
- [x] Worker maintains separate list mask cache `Map<listId, { faceMask, printingMask? }>`; overwrites entry on `list-update`
- [x] Worker evicts entire NodeCache on every `list-update`
- [x] Main thread builds mask from list entries and sends on load/change
- [x] Transferables used for zero-copy transfer
- [x] No list data sent with `search` messages
- [x] Worker starts with no masks cached; handles first `list-update` before any `my:` query
- [x] Empty list sends `list-update` with zeroed mask (not omitted)
- [x] Main thread builds `(scryfall_id, finish)` → printing index lookup from `PrintingDisplayColumns`; sends `printingMask` when list has printing-level entries and printings are loaded
