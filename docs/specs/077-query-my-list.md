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

The evaluator (NodeCache / evaluator.ts) needs a way to obtain the mask for a given list. The worker constructs NodeCache with an optional `getListMask(listId: string): { faceMask: Uint8Array; printingMask?: Uint8Array } | null` callback. When evaluating a `my:` leaf, the evaluator maps the query value to the protocol listId (see List ID Mapping below), calls the getter, and uses the returned mask. If the getter returns `null` (list not known to the worker — e.g. unknown list name), produce an error node per Spec 039 (e.g. `unknown list "foo"`). This disambiguates known empty lists (zeroed mask) from non-existent lists (null).

**Invalidation:** Spec 076 requires full NodeCache eviction on every `list-update`. No per-node invalidation is needed — when the list changes, the worker clears the entire NodeCache before the next search.

### List ID Mapping

Spec 076 uses `listId: "default"` for the single MVP list. The query accepts `my:list` (canonical) or `my:default`; both map to protocol `listId: "default"`. The evaluator normalizes the query value to the listId before calling `getListMask`. For the default list, Spec 075's `short_name` (if set) should align with this mapping so the main thread sends `list-update` with the same `listId`.

### Leaf Evaluation

Handle `my` in `computeTree` as a special-case field, the same pattern as `unique`, `include`, `view`, and `sort`. The `my` field needs access to `getListMask` which is available on the `NodeCache` instance but not in `evalLeafField`.

- **Canonical:** `my`
- **Operators:** `:`, `=` (in list). Negation uses `-my:list` (NOT node), consistent with `is:` fields.
- **Value:** List name. MVP: `"list"` or `"default"` → `listId: "default"`. When `value` is empty (e.g. `my:`), normalize to `"list"` (the default list) before resolving the listId. This differs from other fields where empty value produces a universal set.
- **Logic:** Obtain masks via `getListMask(listId)`. The evaluation domain depends on which masks have bits set:

| `faceMask` has bits | `printingMask` present with bits | Eval domain | Strategy |
|---|---|---|---|
| Yes | No | Face | Copy `faceMask` into face-domain buffer |
| No | Yes | Printing | Copy `printingMask` into printing-domain buffer |
| Yes | Yes | Printing | Expand `faceMask` to printing domain via `promoteFaceToPrinting`, OR with `printingMask` |

- **Non-existent list:** `getListMask` returns `null` → produce error node (e.g. `unknown list "foo"`), per Spec 039. Transparent to filtering; error shown in breakdown.

### Domain

The evaluation domain of a `my:` node is determined at runtime by the list contents, not statically by the field name:

- **Face-only** (list has only oracle-level entries): `my:` is a face-domain node. For each canonical face `i`, `buf[i] = faceMask[i]`. Standard promotion at composite boundaries per ADR-017. No printing expansion needed.

- **Printing-only** (list has only printing-level entries, `faceMask` all zeros): `my:` is a printing-domain node. Copy `printingMask` directly into a printing-domain buffer. Promoted to face at composite boundaries. `printingIndices` emitted in results.

- **Mixed** (list has both oracle-level and printing-level entries): Expand face entries to all printings via `promoteFaceToPrinting` (generic "Lightning Bolt" expands to all Bolt printings), then OR with the explicit `printingMask`. Result is a printing-domain node. This means `my:list is:foil` filters to the foil printings of generically-listed cards plus any explicitly-listed foil printings. `printingIndices` emitted in results.

The mixed-mode expansion is the key semantic: a generic list entry means "all printings of this card are in the list." A specific list entry means "only this printing is in the list." Both coexist in the printing-domain buffer.

### `_hasPrintingLeaves`

Because the `my:` field's domain is runtime-determined, `_hasPrintingLeaves` must check the list mask cache when it encounters a `my:` field. Call `getListMask` for the resolved listId and check whether `printingMask` is present with any bits set. This mirrors the existing runtime check for face-fallback `is:` keywords (`this._printingIndex !== null`). When `printingMask` is present, the `my:` node is a printing-domain leaf and `hasPrintingConditions` is set to true. When the list is oracle-only (no `printingMask`), the `my:` node is face-domain and does not trigger `hasPrintingConditions`.

### nodeKey

The existing `nodeKey` for `FIELD` nodes already includes `field`, `operator`, and `value`, so `my:list` produces a stable key. The mask is external state and is not part of the key. When the list updates, Spec 076 requires the worker to evict the entire NodeCache on `list-update` — all cached results (including `my:` leaves) are cleared before the next search. No special handling needed.

### Error Handling

- Unknown list name: `getListMask` returns `null` → error node (e.g. `unknown list "foo"`). Per Spec 039, error nodes are transparent to filtering (match-all) and surface the error in the breakdown.

## Acceptance Criteria

- [ ] `FIELD_ALIASES` includes `my`; `my:list` parses as `FIELD` node
- [ ] NodeCache accepts optional `getListMask` callback; evaluator uses it when evaluating `my:` leaves
- [ ] `my:list` and `my:default` both map to listId `"default"` and return only cards in the user's list
- [ ] `my:` with empty value normalizes to `my:list` (default list)
- [ ] `-my:list` returns only cards not in the user's list
- [ ] `my:list t:creature` composes (AND)
- [ ] `my:list OR t:legendary` composes (OR)
- [ ] Empty list: `my:list` returns 0 results; `-my:list` returns all cards
- [ ] Query debugger shows correct match count for `my:list` node
- [ ] Unknown list: `my:foo` produces error node (`unknown list "foo"`); transparent to filtering; error visible in breakdown
- [ ] Oracle-only list: `my:list` produces face-domain result; `_hasPrintingLeaves` returns false
- [ ] Oracle-only list + `my:list is:foil`: matches (generic card has foil printings globally)
- [ ] Printing-only list (foil entry): `my:list` produces printing-domain result; `_hasPrintingLeaves` returns true
- [ ] Printing-only list (foil entry) + `my:list is:foil`: matches (specific printing is foil)
- [ ] Printing-only list (foil entry) + `my:list is:nonfoil`: no match (only foil printing listed)
- [ ] Mixed list: `my:list` produces printing-domain result (face entries expanded via `promoteFaceToPrinting`, OR with `printingMask`)
- [ ] Mixed list + `my:list is:nonfoil`: matches (generic entry expands to all printings including nonfoil)
