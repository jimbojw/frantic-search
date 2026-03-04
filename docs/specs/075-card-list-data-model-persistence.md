# Spec 075: Card List Data Model and Persistence

**Status:** Draft

**Depends on:** Spec 003 (ETL Process), Spec 046 (Printing Data Model)

## Goal

Define the data model and persistence layer for client-side card lists. Each list stores cards (or printings) with counts. Data persists in IndexedDB, syncs across tabs via BroadcastChannel, and is cached in memory on the main thread.

## Background

The app (ADR-003) runs search in a WebWorker. Users want to maintain lists of cards (e.g., a cart, wishlist, or deck list) that persist across sessions and can be queried (e.g., `my:list`). The main thread must store list data and map stored identifiers to canonical face indices for mask building (card-list-02 worker protocol).

Spec 003 adds `oracle_ids: string[]` to `ColumnarData` — one entry per face row; all faces of a card share the same Scryfall oracle UUID. This column is available in the ETL output and enables the main thread to map a stored `oracle_id` to a canonical face index for mask building.

## Scope

- **MVP:** Single default list (e.g. `"default"` or `"cart"`). Schema supports multiple named lists for future use.
- **In scope:** Oracle-level and printing-level entries; counts per entry; IndexedDB; BroadcastChannel; main-thread cache.
- **Out of scope:** Server sync, user accounts, list sharing.

## Technical Details

### Identifiers

| Level | Identifier | Format | Stability | Notes |
|-------|------------|--------|-----------|-------|
| Oracle | `oracle_id` | Scryfall UUID string | Stable across ETL runs; assigned by Scryfall. | Available in the `oracle_ids` column of `ColumnarData` (Spec 003). |
| Printing | `printing_id` | `scryfall_id` `:` `finish` | Stable. `scryfall_id` is immutable per Scryfall; `finish` is an intrinsic property of the row. | Composite key uniquely identifies a purchasable SKU. Resolves to a printing row index by scanning `PrintingColumnarData.scryfall_ids` + `finish` columns (linear scan, cached once per list rebuild). |

### Schema

Types live in `shared/src/card-list.ts` so the worker protocol (card-list-02) and query engine (card-list-03) can import them.

```typescript
type CardListEntry =
  | { type: 'oracle'; oracleId: string; count: number }
  | { type: 'printing'; printingId: string; count: number };

interface CardList {
  version: 1;
  id: string;
  name: string;
  entries: CardListEntry[];
  createdAt: number;
  updatedAt: number;
}
```

The discriminated union enforces that each entry is either oracle-level or printing-level, never both. For MVP, only `'oracle'` entries are used.

The `version` field is a literal `1`. If the schema changes in the future, bump the literal and add a migration function that converts version N to N+1 on load. This avoids IndexedDB-level schema migrations entirely — the database stays a plain key-value store, and versioning lives in the serialized objects.

### Storage

- **IndexedDB (key-value store):** A single object store `card_lists` keyed by list `id`. Each value is a complete serialized `CardList` object — read and written wholesale, never queried by field. No indexes are needed. This keeps the IndexedDB usage minimal and avoids coupling to IndexedDB's structured-data features.
- **BroadcastChannel:** Channel name `frantic-search-card-lists`. On write, broadcast `{ type: 'list-updated', listId: string }`. Other tabs reload from IndexedDB.
- **Main thread:** In-memory `Map<string, CardList>` cache. Load all lists on startup; write-through on mutations.

### Data Flow

1. **Startup:** Main thread opens IndexedDB, reads all lists, populates cache.
2. **Read:** Return from cache (sync).
3. **Write:** Update cache, write to IndexedDB, broadcast. Worker is notified separately.
4. **Cross-tab:** On BroadcastChannel message, reload affected list(s) from IndexedDB, update cache.

### IndexedDB Details

- Database name: `frantic-search`
- Database version: `1`
- Object store: `card_lists`
- Key path: `id`
- Indexes: none (pure key-value usage)

Schema evolution is handled at the application level via the `CardList.version` field, not via IndexedDB's `onupgradeneeded` versioning. The database version only changes if the store structure itself changes (e.g., adding a new object store).

## Acceptance Criteria

- [ ] `CardList` and `CardListEntry` types defined in `shared/src/card-list.ts`
- [ ] IndexedDB read/write stores and retrieves whole `CardList` objects by `id`
- [ ] `CardList.version` is `1`; a version-check utility exists for future migration
- [ ] BroadcastChannel notifies other tabs on write
- [ ] Main-thread in-memory cache; load on startup, write-through on change
- [ ] Data persists across page reload
- [ ] Cross-tab: Tab B sees changes made in Tab A after broadcast
