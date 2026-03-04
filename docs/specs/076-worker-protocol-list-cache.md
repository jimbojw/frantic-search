# Spec 076: Worker Protocol and List Caching

**Status:** Draft

**Depends on:** Spec 004 (Evaluation Cache), Spec 075 (Card List Data Model and Persistence), Spec 024 (Index-Based Result Protocol)

## Goal

Extend the worker protocol so the search worker caches one or more named card lists. The worker receives list updates via a dedicated message and uses the cached data when evaluating `my:` queries (e.g. `my:list` for MVP; future variants such as `my:deck:user-deck-name` or `my:collection`). List data is not sent with every search request.

## Background

The app runs search in a WebWorker (ADR-003). Spec 075 defines the main-thread storage for card lists (IndexedDB, BroadcastChannel, in-memory cache). To support `my:` queries (e.g. `my:list` for MVP; later `my:deck:name`, `my:collection`, etc.), the worker must know which cards are in each named list. Sending full list data with every `search` message would be wasteful — the user may type many keystrokes without changing any list, and structured-cloning list data on each request adds latency.

The solution: the worker caches up to two compact bitmasks per named list. Since a list may contain oracle-level entries, printing-level entries, or both, `my:` evaluation is a hybrid card-and-printings check — each list has at least one of a card-level mask (`faceMask`) and a printings-level mask (`printingMask`), or both. The main thread sends a dedicated `list-update` message only when a list changes. Each mask is a `Uint8Array` transferred zero-copy via `Transferable`, avoiding serialization overhead. The worker starts with empty masks until the first `list-update` for each list arrives.

## Scope

- **In scope:** `list-update` message type with `listId`; worker-side list mask cache (separate from NodeCache); full NodeCache eviction on list-update; transferable `Uint8Array` masks; main-thread mask building and send logic.
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
- **faceMask:** `Uint8Array(faceCount)`. `faceMask[canonicalFaceIndex] = 1` if that card is in the list.
- **printingMask:** `Uint8Array(printingCount)`. `printingMask[printingIndex] = 1` if that printing is in the list. Optional for MVP (oracle-level only).

### Main Thread Responsibilities

1. On list load or change: build `faceMask` from list entries.
2. Map `oracle_id` → canonical face index using the `oracle_ids` column (see Mask Building below).
3. Map `printing_id` → printing row index if printing-level entries exist.
4. Send `{ type: 'list-update', listId, faceMask }` to worker with transfer. For MVP, a single default list (e.g. `listId: "default"`) is sufficient; the protocol supports multiple lists from the start.

### Worker Responsibilities

The worker maintains **two distinct caches**:

1. **List mask cache (separate):** `Map<listId, { faceMask, printingMask? }>`. Holds the raw masks sent via `list-update`. Each list's masks persist until overwritten by a new `list-update` for that `listId`. Multiple lists (e.g. `my:list`, `my:cart`) can coexist — a query like `-my:list my:cart` requires masks for both, so the worker must retain each list's masks independently.

2. **NodeCache (evaluation cache):** The existing AST evaluation cache (Spec 004). When a `my:` leaf is evaluated, it reads masks from the list mask cache and produces a buffer (OR of face mask and promoted printing mask). That result is interned in NodeCache like any other leaf. Parent nodes (AND, OR, NOT) are also interned. The NodeCache avoids redundant work during typing — e.g. `f:commander` stays cached while the user types `tarmog...`.

**On `list-update`:**
1. Overwrite the list mask cache entry for that `listId` with the incoming mask(s).
2. Evict the entire NodeCache (clear all `computed` on interned nodes). Full eviction is correct because any cached `my:*` result may be stale, and we do not track which lists appear in the current query. List updates are rare; the cost of re-evaluating a handful of nodes on the next search is acceptable for MVP.

**On `search`:**
1. Evaluate the query. The evaluator (future spec) uses the worker's list mask cache when evaluating `my:` leaves.
2. `my:` leaf results and their parent nodes are interned in NodeCache as usual.

**Initial state:** No masks in the list cache; each list starts empty (all zeros) until its first `list-update`.

### Mask Building

The main thread needs a mapping from `oracle_id` to canonical face index. `ColumnarData` already includes `oracle_ids` (Spec 003). However, the main thread receives `DisplayColumns` from the worker's `ready` message (Spec 024), and `DisplayColumns` does not currently include `oracle_ids`.

**Add `oracle_ids: string[]` to `DisplayColumns`** so the main thread receives it when the worker posts `ready`. The worker's `extractDisplayColumns` (in `app/src/worker.ts`) should include `oracle_ids` from `ColumnarData` when present. The main thread then builds `Map<oracle_id, canonicalFaceIndex>` at startup (or when display columns arrive) by iterating `display.oracle_ids` — index in the array is the face row index; `canonical_face` maps face → canonical for multi-face cards.

**Alternative:** Load `oracle-cards.json` in the app and build the map at startup. This avoids protocol changes but adds a separate fetch and duplicates data the worker already has. The DisplayColumns approach is preferred.

### Empty List Behavior

When a list is empty, send `list-update` with a zeroed mask (same length as faceCount) for that `listId`. This keeps worker semantics consistent and avoids ambiguity between "no list cached" and "empty list." Do not omit the message.

## Acceptance Criteria

- [ ] `ToWorker` includes `list-update` variant with `listId`
- [ ] Worker maintains separate list mask cache `Map<listId, { faceMask, printingMask? }>`; overwrites entry on `list-update`
- [ ] Worker evicts entire NodeCache on every `list-update`
- [ ] `my:` leaves read from list mask cache when evaluated; results interned in NodeCache (future spec)
- [ ] Main thread builds mask from list entries and sends on load/change
- [ ] Transferables used for zero-copy transfer
- [ ] No list data sent with `search` messages
- [ ] Worker starts with no masks cached; handles first `list-update` before any `my:` query
- [ ] Empty list sends `list-update` with zeroed mask (not omitted)
- [ ] `DisplayColumns` includes `oracle_ids`; main thread can build oracle_id → canonical face index map
