# Spec 024: Index-Based Result Protocol

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 005 (App Data Loading), Spec 007 (Worker Protocol)

## Goal

Eliminate the postMessage serialization bottleneck by switching the worker→main result payload from fully-constructed card objects to a sorted array of integer indices. The main thread holds its own copy of the display-relevant columnar data and resolves indices to card fields locally.

## Background

Profiling reveals that 56% of worker-thread time is spent in `postMessage` serializing `CardResult[]` objects, and another 14% is spent constructing those objects. A broad query (e.g., a single letter) can match 15,000+ cards, producing ~15,000 structured-clone operations — yet the UI only renders the top 200.

The root cause is the current row-based protocol: the worker assembles a full `CardResult` object per match, including all face fields, and sends the entire array to the main thread. This is wasteful because:

1. The main thread discards everything beyond the first 200 results.
2. Structured clone of complex objects is expensive — each `CardResult` has nested `CardFace` arrays with strings.
3. The worker spends time on field lookups and object allocation for results the user never sees.

The fix is an **index-based columnar** protocol. The worker sends only a sorted `Uint32Array` of card indices, transferred zero-copy via `Transferable`. The main thread owns a copy of the columns needed for display and performs field lookups directly, only for the cards it actually renders.

## Design

### Data flow overview

```
Worker                                  Main Thread
──────                                  ───────────
1. Fetch columns.json
2. Build CardIndex + NodeCache
3. Post { type: 'ready', display }  ──►  Store display columns
                                         Build facesOf map
                                         Build scryfallId → index map
4. Receive search message
5. Evaluate → Uint8Array
6. Extract matching indices
7. Deduplicate (face → canonical)
8. seededSort the canonical indices
9. Post { type: 'result',          ──►  For each visible index:
     indices (Uint32Array,                 look up columns locally
       transferred),
     totalMatches, breakdown }
```

### Display columns

Not all columns are needed on the main thread. The worker needs the full `ColumnarData` for evaluation (lowercased strings, tilde oracle text, colors, card_index, etc.). The main thread only needs columns used for **rendering**.

The display column set:

| Column | Used for |
|---|---|
| `names` | Face name |
| `mana_costs` | Mana cost symbols |
| `type_lines` | Type line text |
| `oracle_texts` | Oracle text body |
| `powers` | Power (encoded index) |
| `toughnesses` | Toughness (encoded index) |
| `loyalties` | Loyalty (encoded index) |
| `defenses` | Defense (encoded index) |
| `color_identity` | Art crop gradient, card detail |
| `scryfall_ids` | Image URLs, Scryfall links |
| `thumb_hashes` | ThumbHash placeholders |
| `layouts` | Card detail front/back toggle |
| `legalities_legal` | Legality grid |
| `legalities_banned` | Legality grid |
| `legalities_restricted` | Legality grid |
| `power_lookup` | Decode power index → display string |
| `toughness_lookup` | Decode toughness index → display string |
| `loyalty_lookup` | Decode loyalty index → display string |
| `defense_lookup` | Decode defense index → display string |
| `canonical_face` | Build facesOf map on main thread |

Columns **not** sent to the main thread (evaluation-only):

- `combined_names` — used for combined-name matching during evaluation (Spec 018). The UI does not need this column; it constructs the display name by joining individual face names with ` // ` via `facesOf`.
- `oracle_texts_tilde` — tilde self-reference matching during evaluation (Spec 020)
- `colors` — color filtering (distinct from `color_identity` used for display)
- `card_index` — internal evaluation index

### Wire protocol changes

#### `FromWorker` messages

The `ready` status message gains a `display` payload containing the display column subset:

```typescript
export type DisplayColumns = {
  names: string[]
  mana_costs: string[]
  type_lines: string[]
  oracle_texts: string[]
  powers: number[]
  toughnesses: number[]
  loyalties: number[]
  defenses: number[]
  color_identity: number[]
  scryfall_ids: string[]
  thumb_hashes: string[]
  layouts: string[]
  legalities_legal: number[]
  legalities_banned: number[]
  legalities_restricted: number[]
  power_lookup: string[]
  toughness_lookup: string[]
  loyalty_lookup: string[]
  defense_lookup: string[]
  canonical_face: number[]
}
```

The `result` message replaces `cards: CardResult[]` with `indices: Uint32Array`:

```typescript
export type FromWorker =
  | { type: 'status'; status: 'loading' }
  | { type: 'status'; status: 'ready'; display: DisplayColumns }
  | { type: 'status'; status: 'error'; error: string }
  | {
      type: 'result'
      queryId: number
      indices: Uint32Array
      totalMatches: number
      breakdown: BreakdownNode
    }
```

The `indices` array contains **all** deduplicated canonical card indices, sorted by `seededSort`. Using a `Uint32Array` (backed by an `ArrayBuffer`) enables zero-copy transfer via the `Transferable` argument to `postMessage` — the worker detaches the buffer and the main thread receives it instantly regardless of size. Sending all ~33K indices as a `Uint32Array` costs ~132 KB of buffer but zero serialization time.

`totalMatches` continues to report the total face-level match count (root node `matchCount`). The total deduplicated card count is `indices.length`.

#### Removed types

`CardResult` and `CardFace` are removed from `worker-protocol.ts` and `shared/src/index.ts`. They are dead code in the new protocol — the main thread performs direct column lookups instead of consuming pre-built objects.

### Main-thread data ownership

On receiving the `ready` message, the main thread:

1. Stores the `DisplayColumns` object.
2. Builds a `facesOf` map from `canonical_face` — the same logic as `CardIndex._facesOf`, mapping each canonical index to its ordered list of face indices.
3. Builds a reverse map from `scryfall_ids` → canonical index, for `CardDetail` navigation (see below).

When rendering a card at canonical index `ci`:

- Card-level fields: `display.scryfall_ids[ci]`, `display.color_identity[ci]`, etc.
- Face indices: `facesOf.get(ci)` → `[fi0, fi1, ...]`
- Face-level fields: `display.names[fi]`, `display.mana_costs[fi]`, etc.
- Stat decoding: `display.power_lookup[display.powers[fi]]` (empty string → no stat)

### Worker changes

The worker's `onmessage` handler changes:

1. **Drop the mapping loop.** The current loop at `worker.ts:77–108` that builds `CardResult[]` is removed entirely.
2. **Pack indices into a `Uint32Array`.** After `seededSort`, copy the deduplicated index array into a `Uint32Array`.
3. **Post with transfer.** Call `postMessage(msg, [msg.indices.buffer])` so the `ArrayBuffer` is transferred zero-copy. The worker loses access to the buffer after posting, which is fine — it is done with the result.

The `init()` function changes:

1. After building `CardIndex` and `NodeCache`, extract the display column subset from `ColumnarData`.
2. Post `{ type: 'status', status: 'ready', display }`.

### Counts

- `totalMatches` = face-level matches (root node `matchCount`, used by breakdown summary)
- `indices.length` = deduplicated card count (used by "…and N more")

No separate `totalCards` field is needed since `indices` carries the full sorted array.

### CardDetail navigation

Currently `CardDetail` receives a `CardResult` found by scanning the results array: `results().find(c => c.scryfallId === cardId())`. With the index-based model, the main thread holds a reverse map (`scryfallId → canonical index`), built once when display columns arrive. `CardDetail` receives the canonical index (looked up from the scryfallId) and resolves all fields via column lookups, same as the result list.

## Implementation Plan

### 1. Update wire types (`shared/src/worker-protocol.ts`)

- Add the `DisplayColumns` type.
- Update `FromWorker`: add `display` to the `ready` status variant, replace `cards: CardResult[]` with `indices: Uint32Array` on the result variant.
- Remove `CardResult` and `CardFace`.
- Update `shared/src/index.ts` exports accordingly.

### 2. Update worker init (`app/src/worker.ts`)

After building `CardIndex`, extract display columns from `ColumnarData` and include them in the `ready` post.

### 3. Update worker search handler (`app/src/worker.ts`)

Remove the `CardResult[]` mapping loop. After `seededSort`, pack the deduplicated indices into a `Uint32Array` and post with `Transferable`.

### 4. Main-thread data store (`app/src/App.tsx`)

On receiving the `ready` message, store `DisplayColumns`. Build the `facesOf` map and the `scryfallId → canonical index` reverse map.

### 5. Update result rendering (`app/src/App.tsx`)

Replace `results()` (which was `CardResult[]`) with the `Uint32Array` index array. For each visible canonical index (first 200), resolve card-level and face-level fields via column lookups against the stored `DisplayColumns`.

### 6. Update `CardDetail`

Change from receiving a `CardResult` prop to receiving a canonical index (resolved from scryfallId via the reverse map). Perform column lookups locally.

### 7. Update `ArtCrop`

Change from receiving `scryfallId`, `colorIdentity`, and `thumbHash` props to receiving a canonical index and looking up those fields from `DisplayColumns`.

## Memory Impact

The display columns duplicate a subset of the ~8 MB `ColumnarData` across two threads. The evaluation-only columns (`combined_names`, `oracle_texts_tilde`, `colors`, `card_index`) are not duplicated. Rough estimate: the display subset is ~6 MB, bringing total memory from ~8 MB to ~14 MB. This is acceptable for desktop and modern mobile devices.

The one-time `postMessage` to transfer display columns at startup is a single structured clone of ~6 MB. This happens once during loading (before the user can search) and is not on the hot path.

Per-query overhead is minimal. The `Uint32Array` for indices (~132 KB at 33K cards) is transferred, not cloned, so the only serialization cost is the `breakdown` tree (small) and two numbers.

## Acceptance Criteria

1. The worker posts `{ type: 'status', status: 'ready', display: DisplayColumns }` after initialization, containing only the columns needed for rendering.
2. Search result messages carry `indices: Uint32Array` (all sorted, deduplicated canonical card indices) and `totalMatches` (face count) — no `CardResult` objects.
3. The `indices` buffer is transferred via `Transferable` (zero-copy), not cloned.
4. The main thread builds a `facesOf` map and a `scryfallId → canonical index` reverse map from display columns at init time.
5. Card rendering performs column lookups (`display.names[fi]`, etc.) rather than reading pre-built objects. The UI renders the first 200 entries from the index array.
6. `CardDetail` resolves a scryfallId to a canonical index via the reverse map and performs column lookups locally.
7. The "…and N more" indicator uses `indices.length` as the total card count.
8. `CardResult` and `CardFace` are removed from the wire protocol types.
9. Existing features (breakdown, bug report, oracle text toggle, copy button) continue to work unchanged.
