# Spec 078: Ephemeral Selection

**Status:** Draft

**Depends on:** Spec 076 (Worker Protocol and List Caching), Spec 077 (Query Engine — my:list)

## Goal

Define an ephemeral, tab-local selection that reuses the `my:` query infrastructure from Specs 076 and 077. Users can select cards and/or printings from search results; the selection is queryable as `my:selection` (or `my:sel`). No persistence, no Instance identity, no cross-tab sync — just a pair of bitmasks on the main thread, sent to the worker via the existing `list-update` protocol.

## Background

Specs 075–077 define persistent named lists backed by IndexedDB with Instance-level identity and append-only logs. That machinery is necessary for durable collections (carts, decks, wishlists).

A complementary need exists for lightweight, throwaway selections. A user runs a query, selects some or all results, then refines with `my:sel t:creature` or passes the selection to a persistent list. The selection has no history, no undo, no cross-tab propagation — it is pure ephemeral state local to a single tab.

Because the worker's list mask cache (Spec 076) and the `my:` evaluator (Spec 077) operate on `{ faceMask, printingMask? }` keyed by `listId`, an ephemeral selection slots in with no protocol or evaluator changes. Only the main-thread source differs: masks are built from UI gestures against search results instead of from a persisted materialized view.

## Scope

- **In scope:** Reserved `listId` for the selection; `my:selection` / `my:sel` aliases; main-thread selection state as a pair of mutable masks; mask building from cards and printings; sending `list-update` on change; clearing the selection.
- **Out of scope:** UX gestures (select-all, checkbox toggle, lasso, keyboard shortcuts); visual treatment of selected rows; "add selection to list" bridge to Spec 075. These belong in future UI specs.

## Technical Details

### Reserved List ID

The selection uses `listId: "selection"` in the Spec 076 list mask cache. This is a reserved value — it cannot be used as a user-created list ID (alongside `"external"` and `"trash"` from Spec 075).

### List ID Mapping

Extend the Spec 077 List ID Mapping table:

| Query value | Protocol `listId` |
|---|---|
| `list`, `default` | `"default"` |
| `selection`, `sel` | `"selection"` |

`my:selection`, `my:sel`, `my:` with value `"selection"` or `"sel"` all resolve to `listId: "selection"`. The evaluator uses the same `getListMask` callback and three-case domain logic as any other `my:` value (Spec 077 § Leaf Evaluation).

### Main-Thread Selection State

The main thread holds a mutable selection:

```typescript
interface SelectionState {
  faceMask: Uint8Array;       // length = faceCount; mutable in place
  printingMask: Uint8Array;   // length = printingCount; mutable in place
  faceCount: number;          // popcount of faceMask
  printingCount: number;      // popcount of printingMask
}
```

Both masks are pre-allocated at their full lengths (`faceCount`, `printingCount` from display columns) and zeroed initially. Bits are toggled in place. The counts are maintained incrementally on each toggle to avoid full popcounts.

This state is **tab-local**. It is not written to IndexedDB and not broadcast via BroadcastChannel. Navigating away or closing the tab discards it.

### Selection Operations

All operations mutate the `SelectionState` in place, then send a `list-update` to the worker.

**Toggle card (face-level):** Flip `faceMask[canonicalFaceIndex]`. Update `faceCount`. Used when the user selects a card that is displayed as its canonical printing (the common card-level result row).

**Toggle printing:** Flip `printingMask[printingIndex]`. Update `printingCount`. Used when the user selects a specific printing (a printing-level result row, or a non-canonical printing in any view).

**Select all (card-level results):** Given `indices: Uint32Array` from the current search result, set `faceMask[i] = 1` for each `i` in `indices`. Recount `faceCount`. Does not touch `printingMask`.

**Select all (printing-level results):** Given `printingIndices: Uint32Array` from the current search result, set `printingMask[i] = 1` for each `i` in `printingIndices`. Recount `printingCount`. Does not touch `faceMask`.

**Clear:** Zero both masks. Set both counts to 0.

The distinction between card-level and printing-level "select all" follows from the search result shape: when `hasPrintingConditions` or `uniqueMode !== "cards"`, the result carries `printingIndices` and the selection targets printings; otherwise it targets cards.

### Sending to Worker

After any selection change, clone both masks into new `Uint8Array` buffers and send:

```typescript
worker.postMessage(
  { type: 'list-update', listId: 'selection', faceMask, printingMask },
  [faceMask.buffer, printingMask.buffer]
);
```

Cloning before transfer is necessary because `Transferable` detaches the buffer — the main thread's `SelectionState` must retain its own mutable copies. When both masks are all zeros (empty selection), still send the message (Spec 076 § Empty List Behavior).

Omit `printingMask` when it is all zeros and `faceMask` has bits set (pure card-level selection). This matches the Spec 076 convention and avoids the evaluator treating it as a printing-domain node unnecessarily.

### Evaluation

No evaluator changes. Spec 077's three-case domain logic applies directly:

| Selection contents | `faceMask` has bits | `printingMask` has bits | Eval domain |
|---|---|---|---|
| Cards only | Yes | No | Face |
| Printings only | No | Yes | Printing |
| Mixed | Yes | Yes | Printing (face expanded via `promoteFaceToPrinting`, OR with `printingMask`) |

`my:sel t:creature` composes as AND. `-my:sel` returns the complement. `my:sel is:foil` filters selected cards/printings to those with foil printings. All standard Spec 077 behavior.

### Startup

No startup sequencing needed. The selection starts empty (both masks zeroed). The main thread does **not** send a `list-update` for `"selection"` during the Spec 076 startup sequence. Instead, the first `list-update` for `"selection"` is sent when the user makes their first selection gesture.

Before any `list-update` for `"selection"` has been sent, `getListMask("selection")` returns `null`. Per Spec 077, `my:sel` with `null` produces an error node (`unknown list "sel"`). This is acceptable — querying a selection before selecting anything is a user error. The error message should read `no active selection` rather than `unknown list "sel"` to distinguish it from a truly unknown list name. The evaluator special-cases `listId: "selection"` to produce this friendlier error.

### Interaction with Persistent Lists

This spec does not define "add selection to list" — that is a future UI spec concern. Conceptually, the bridge is: iterate the selection masks, resolve face indices to `oracle_id` via `display.oracle_ids` and printing indices to `(scryfall_id, finish)` via `PrintingDisplayColumns`, then create Instances in Spec 075's persistence layer. The selection masks provide the "what"; Spec 075 provides the "where."

## Acceptance Criteria

- [ ] `listId: "selection"` is reserved; cannot be used as a user list ID
- [ ] `my:selection` and `my:sel` both resolve to `listId: "selection"` via List ID Mapping
- [ ] Main-thread `SelectionState` holds two pre-allocated masks; bits toggle in place
- [ ] Toggle card sets `faceMask[canonicalFaceIndex]`; toggle printing sets `printingMask[printingIndex]`
- [ ] Select-all (card-level) sets face bits from `indices`; select-all (printing-level) sets printing bits from `printingIndices`
- [ ] Clear zeros both masks
- [ ] Every selection change sends `list-update` with `listId: "selection"` to the worker (cloned buffers, transferred)
- [ ] Empty selection sends `list-update` with zeroed masks (not omitted)
- [ ] `my:sel` with no prior selection produces error node (`no active selection`); transparent to filtering
- [ ] `my:sel` after selection returns only selected cards/printings
- [ ] `-my:sel` returns complement of selection
- [ ] `my:sel t:creature` composes (AND)
- [ ] Card-only selection: `my:sel` produces face-domain result
- [ ] Printing-only selection: `my:sel` produces printing-domain result
- [ ] Mixed selection: `my:sel` produces printing-domain result (face entries expanded)
- [ ] Selection is tab-local; not persisted to IndexedDB; not broadcast via BroadcastChannel
- [ ] Closing the tab discards the selection; no cleanup required
