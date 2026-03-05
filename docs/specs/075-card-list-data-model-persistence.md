# Spec 075: Card List Data Model and Persistence

**Status:** Implemented

**Depends on:** Spec 003 (ETL Process), Spec 046 (Printing Data Model)

## Goal

Define the data model and persistence layer for client-side card lists using **append-only state logs** and a **materialized view**. Instance identity (card and printing) is immutable at creation; only location (`list_id`) changes. Every log entry is a full snapshot: `{ uuid, oracle_id, scryfall_id, finish, list_id, timestamp }`. The latest entry per `uuid` yields current state. List metadata uses the same pattern.

Data persists in IndexedDB, syncs across tabs via BroadcastChannel (with previous state in each message so receivers can update without IndexedDB lookup), and is derived into an in-memory materialized view on the main thread. The design supports undo, a recoverable trash list, and temporal queries.

## Background

The app (ADR-003) runs search in a WebWorker. Users want to maintain lists of cards (e.g., a cart, wishlist, or deck lists) that persist across sessions and can be queried (e.g., `my:list`). The main thread must store materialized list data for query evaluation and display.

**Why append-only full snapshots:** An _Instance_ is a fully-specified object at creation: a specific card object + optional printing and finish (foil/nonfoil). You cannot change what it is — only where it is. Every log entry stores the full state; the latest log entry per `uuid` wins. Immutable fields are repeated on each location change (redundancy is acceptable). The same pattern applies to list metadata.

## Scope

- **MVP:** Single default list (e.g. `"default"` or `"cart"`). Schema supports multiple named lists for future use.
- **In scope:** Oracle-level and printing-level entries; Instance-level provenance; immutable Instance identity; append-only logs (full state per entry for Instances and list metadata); trash list; undo; IndexedDB; BroadcastChannel with prev/current; main-thread materialized view.
- **Out of scope:** Server sync, user accounts, list sharing, list deletion (MVP has a single permanent default list).

## Technical Details

### Reserved List IDs

| List ID | Meaning |
|---------|---------|
| `external` | Source/sink for cards not in any list. New Instances are created from external; permanent delete sends to external. Reserved — cannot be used as a user list ID. |
| `trash` | Recoverable destination. Cards removed from lists go here. Restore = append new entry with `list_id` set to the Instance's previous list (from history). Reserved — cannot be used as a user list ID. |

User lists use UUIDs for `list_id`.

### Instance Identity (Immutable)

When an Instance is created (pulled from external), all of these are locked in:

| Field | Type | Notes |
|-------|------|-------|
| `uuid` | string | Instance identity. UUID v4 via `crypto.randomUUID()`. Assigned at creation. |
| `oracle_id` | string | Scryfall oracle UUID. |
| `scryfall_id` | string \| null | `null` = generic (oracle only). Specific printing when set. |
| `finish` | string \| null | Tied to `scryfall_id`; `null` when generic. Valid values: `"nonfoil"`, `"foil"`, `"etched"` (matching Scryfall's `finishes` vocabulary). Spec 076 encodes these to numeric `0/1/2` when building printing masks. |

**Only `list_id` mutates** — where the Instance lives. Records of location are in the append-only log.

**Swapping a card** (e.g., change printing, or replace with a different card) = remove one Instance to trash/external, add another from external. Two operations, two Instances.

### Instance Log Entries

Every Instance log entry is a full snapshot. One shape, no modal types:

| Field | Type | Notes |
|-------|------|-------|
| `uuid` | string | Instance identity. |
| `oracle_id` | string | Scryfall oracle UUID. |
| `scryfall_id` | string \| null | `null` = generic. |
| `finish` | string \| null | Tied to `scryfall_id`; `null` when generic. |
| `list_id` | string | Where the Instance lives. |
| `timestamp` | number | When this state was recorded. |

The latest entry per `uuid` yields current state. Immutable fields are repeated on each append (add, transfer, restore, undo).

**Operations:**
- **Add to list:** Append full entry with `list_id` = target list.
- **Transfer (move, remove to trash, restore):** Append full entry with new `list_id`; other fields unchanged from current state.
- **Permanent delete:** Append full entry with `list_id` = `external`.
- **Undo:** Append full entry that reverts to the previous `list_id` (from history).
- **Swap:** Remove one Instance (append with `list_id` = trash/external), add another (append new Instance from external).

Validation (e.g., `oracle_id` matches `scryfall_id`, valid `finish`) is application-level. The persistence layer stores what it is given.

### List Metadata

List metadata uses the same append-only pattern. The latest entry per `list_id` is the current metadata. Each entry is a full snapshot.

| Field | Type | Notes |
|-------|------|-------|
| `list_id` | string | `external`, `trash`, or a list UUID. |
| `name` | string | Display name. |
| `description` | string? | Optional. |
| `short_name` | string? | For `my:` queries (e.g., `my:cart`, `my:trash`). |

Each log entry adds `timestamp: number` (when this metadata was recorded).

**List creation:** No separate create event. The first metadata row for a `list_id` defines the list. Generate a UUID for `list_id` and append the first row.

Reserved lists (`external`, `trash`) may have fixed metadata (no rows) or a row each for consistency. Their `short_name` is reserved (`my:trash`).

### Schema (TypeScript)

Types live in `shared/src/card-list.ts` so downstream consumers (worker, query engine) can import them.

```typescript
/** Instance state in the materialized view (log entry minus timestamp). */
interface InstanceState {
  uuid: string;
  oracle_id: string;
  scryfall_id: string | null;
  finish: string | null;
  list_id: string;
}

/** Instance log entry. Every entry is a full snapshot. Latest per uuid = current state. */
interface InstanceStateEntry extends InstanceState {
  timestamp: number;
}

/** List metadata in the materialized view (log entry minus timestamp). */
interface ListMetadata {
  list_id: string;
  name: string;
  description?: string;
  short_name?: string;
}

/** List metadata log entry. Every entry is a full snapshot. Latest per list_id = current metadata. */
interface ListMetadataEntry extends ListMetadata {
  timestamp: number;
}

/** Materialized view: current state derived from replaying the log. */
interface MaterializedView {
  instances: Map<string, InstanceState>;  // uuid → current state
  lists: Map<string, ListMetadata>;       // list_id → current metadata
  instancesByList: Map<string, Set<string>>;  // list_id → Set<uuid>
}
```

### Storage

- **IndexedDB:** Two object stores:
  - `instance_log` — append-only. Full state per entry. Key = auto-increment. Index on `uuid` for temporal queries.
  - `list_metadata_log` — append-only log of `ListMetadataEntry` rows. Key = auto-increment. Index on `list_id`.
- **BroadcastChannel:** Channel name `frantic-search-card-lists`. Each message includes **previous state** so receiving tabs can update their materialized view without an IndexedDB lookup.
- **Main thread:** In-memory materialized view. Rebuild on startup by replaying; apply incrementally on write.

### BroadcastChannel Messages

```typescript
/** Instance state changed. Receiver: remove uuid from previous.list_id, add to instance.list_id, overwrite instance. */
interface InstanceUpdatedMessage {
  type: 'instance-updated';
  instance: InstanceState;
  previous: Pick<InstanceState, 'list_id'> | null;  // null = new instance
}

/** List metadata changed. Receiver: overwrite metadata for list_id. */
interface ListMetadataUpdatedMessage {
  type: 'list-metadata-updated';
  metadata: ListMetadata;
  previous: ListMetadata | null;  // null = new list
}

type CardListBroadcastMessage = InstanceUpdatedMessage | ListMetadataUpdatedMessage;
```

Every message includes full `instance` and `previous`; receivers apply the delta without IndexedDB lookup.

### Data Flow

1. **Startup:** Main thread opens IndexedDB, reads `instance_log` and `list_metadata_log` in **reverse** key order (newest first). Replay: for each instance entry, if `uuid` not yet seen, add to `instances` and `instancesByList[list_id]`; otherwise skip. First occurrence wins (definitive). For list metadata, same pattern — reverse order, latest per `list_id` wins.
2. **Read:** Return from materialized view (sync). Aggregate instances by `oracle_id`; when `scryfall_id` and `finish` are set, also by that pair.
3. **Write:** Append full entry to IndexedDB, update materialized view, broadcast with `instance` and `previous`. Downstream consumers are notified separately.
4. **Cross-tab:** On BroadcastChannel message, apply delta — no IndexedDB read. After applying the delta to the materialized view, the receiving tab must also rebuild and send `list-update` to its own worker (see Spec 076) so that `my:` queries in that tab reflect the change.
5. **Restore from trash:** Find the previous `list_id` for the instance (from log). Append full entry with that `list_id`.
6. **Undo:** Append full entry that reverts to the prior `list_id`.

### IndexedDB Details

- Database name: `frantic-search`
- Database version: `1`
- Object stores:
  - `instance_log`: Key = auto-increment. Entries are `InstanceStateEntry` (full state). Index on `uuid` for "all entries for this instance" and temporal queries.
  - `list_metadata_log`: Key = auto-increment. Index on `list_id`.
- Derivation: Iterate `instance_log` in reverse key order (newest first). For each entry, if `uuid` not in `instances`, add it and add to `instancesByList[list_id]`; skip repeats. Iterate `list_metadata_log` in reverse; latest per `list_id` overwrites.

Schema evolution: Add new fields to the entry type as needed. Old rows omit them; the application treats missing fields as default. No IndexedDB migration required for additive changes.

## Acceptance Criteria

- [x] `InstanceStateEntry`, `InstanceState`, `ListMetadata`, and `ListMetadataEntry` types defined in `shared/src/card-list.ts`
- [x] `MaterializedView` type defined; view derived by replaying logs
- [x] Instance identity (uuid, oracle_id, scryfall_id, finish) immutable at creation; only `list_id` mutates
- [x] Every instance log entry carries full state (uuid, oracle_id, scryfall_id, finish, list_id, timestamp)
- [x] IndexedDB stores `instance_log` and `list_metadata_log`; both persist append-only entries
- [x] Instance UUIDs (UUID v4 via `crypto.randomUUID()`) assigned at creation
- [x] Trash is a reserved list ID; restore appends full entry with previous `list_id`
- [x] BroadcastChannel messages include `previous` state; receivers update view without IndexedDB lookup
- [x] Main-thread materialized view; replay on startup, incremental apply on write
- [x] Data persists across page reload
- [x] Cross-tab: Tab B sees changes made in Tab A after broadcast
- [x] Materialized view supports aggregation by `oracle_id` and by `(scryfall_id, finish)` when both are set
- [x] Swap (change printing or card) = remove instance + add new instance from external
