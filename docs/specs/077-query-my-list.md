# Spec 077: Query Engine — my:list

**Status:** Draft

**Depends on:** Spec 004 (Evaluation Cache), Spec 039 (Non-Destructive Error Handling), Spec 046 (Printing Data Model), Spec 075 (Card List Data Model and Persistence), Spec 076 (Worker Protocol and List Caching)

## Goal

Add a `my:` query field that filters to cards (or printings) in the user's stored list. `my:list` returns list contents; `-my:list` returns the complement. Composes with all other query terms.

## Background

Spec 076 extends the worker protocol with a dedicated `list-update` message and a separate list mask cache. The worker maintains `Map<listId, { faceMask, printingMask? }>` and evicts the entire NodeCache on each list-update. This spec defines how the evaluator uses those cached masks when evaluating `my:` leaves — the query engine reads from the list mask cache and interns results in NodeCache like any other leaf.

## Scope

- **In scope:** Parser support for `my:field`; evaluator leaf; face-domain and printing-domain evaluation (dual-domain from the start); integration with the worker's list mask cache and NodeCache.
- **Out of scope:** List name disambiguation (MVP: single list; canonical value is `list`); Scryfall parity (Frantic Search–exclusive).

## Technical Details

### Parser

Add `my` to `FIELD_ALIASES` in `shared/src/search/eval-leaves.ts`:

```typescript
my: "my",
```

The parser already produces `FIELD` nodes for `word:value` patterns. No parser changes needed; `my:list` parses as `{ type: "FIELD", field: "my", operator: ":", value: "list" }`.

### Evaluator Integration

Per Spec 076, the worker maintains a **separate** list mask cache (`Map<listId, { faceMask, printingMask? }>`). The evaluator reads from this cache when evaluating `my:` leaves; it does not hold masks in NodeCache.

The evaluator (NodeCache / evaluator.ts) needs a way to obtain the mask for a given list. The worker constructs NodeCache with an optional `getListMask(listId: string): { faceMask: Uint8Array; printingMask?: Uint8Array } | null` callback. When evaluating a `my:` leaf with value `"list"`, the evaluator maps the query value to the protocol listId (see List ID Mapping below), calls the getter, and uses the returned mask. If the getter returns `null` (list not known to the worker — e.g. unknown list name), produce an error node per Spec 039 (e.g. `unknown list "foo"`). This disambiguates known empty lists (zeroed mask) from non-existent lists (null).

**Invalidation:** Spec 076 requires full NodeCache eviction on every `list-update`. No per-node invalidation is needed — when the list changes, the worker clears the entire NodeCache before the next search.

### List ID Mapping

Spec 076 uses `listId: "default"` for the single MVP list. The query accepts `my:list` (canonical) or `my:default`; both map to protocol `listId: "default"`. The evaluator normalizes the query value to the listId before calling `getListMask`. For the default list, Spec 075's `short_name` (if set) should align with this mapping so the main thread sends `list-update` with the same `listId`.

### Leaf Evaluation

`my` is a **filtering** field (like `format`, `legal`, `type`) — it produces a real match buffer, not a match-all. Handle it in `computeTree` before the general `evalLeafField` path (since `getListMask` is available there), or add a dedicated path in `evalLeafField` with an optional list-mask parameter. Either way:

- **Canonical:** `my`
- **Operators:** `:`, `=` (in list); `!=` (not in list)
- **Value:** List name. MVP: `"list"` or `"default"` → `listId: "default"`.
- **Logic:** Obtain masks via `getListMask(listId)`. Produce a face-domain buffer:
  - **Face mask only:** For each canonical face `i`, `buf[i] = listFaceMask[i]` (for `:`) or `buf[i] = 1 - listFaceMask[i]` (for `!=`).
  - **Face + printing masks:** Compute face-domain result from `faceMask` as above. If `printingMask` is present and printing data is loaded, evaluate in printing domain (`buf[printingIndex] = printingMask[printingIndex]` or complement), promote to face per ADR-017, then OR with the face result. Semantics: "card is in list if it matches by oracle OR by any of its printings."
- **Non-existent list:** `getListMask` returns `null` → produce error node (e.g. `unknown list "foo"`), per Spec 039. Transparent to filtering; error shown in breakdown.

### Domain

- **Face domain:** Always computed from `faceMask`. `my:list` produces a face-domain buffer.
- **Printing domain:** When the list has printing-level entries and the worker has `printingMask`, evaluate in printing domain and promote to face per ADR-017, then OR with the face-domain result. This yields correct semantics for lists containing both oracle-level and printing-level entries (e.g. "Lightning Bolt" by oracle + "Lightning Bolt (MH2 foil)" by printing).

### nodeKey

The existing `nodeKey` for `FIELD` nodes already includes `field`, `operator`, and `value`, so `my:list` produces a stable key. The mask is external state and is not part of the key. When the list updates, Spec 076 requires the worker to evict the entire NodeCache on `list-update` — all cached results (including `my:` leaves) are cleared before the next search. No special handling needed.

### Error Handling

- `my:` with no value or empty value: treat as `my:list` (default list).
- Unknown list name: `getListMask` returns `null` → error node (e.g. `unknown list "foo"`). Per Spec 039, error nodes are transparent to filtering (match-all) and surface the error in the breakdown.

## Acceptance Criteria

- [ ] `FIELD_ALIASES` includes `my`; `my:list` parses as `FIELD` node
- [ ] NodeCache accepts optional `getListMask` callback; evaluator uses it when evaluating `my:` leaves
- [ ] `my:list` and `my:default` both map to listId `"default"` and return only cards in the user's list
- [ ] `-my:list` returns only cards not in the user's list
- [ ] `my:list t:creature` composes (AND)
- [ ] `my:list OR t:legendary` composes (OR)
- [ ] Empty list: `my:list` returns 0 results; `-my:list` returns all cards
- [ ] Query debugger shows correct match count for `my:list` node
- [ ] Unknown list: `my:foo` produces error node (`unknown list "foo"`); transparent to filtering; error visible in breakdown
- [ ] List with printing-level entries: `my:list` returns cards matching by oracle OR by printing; `my:list is:foil` composes correctly (cards in list that have a foil printing)
