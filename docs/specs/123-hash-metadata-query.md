# Spec 123: Query Engine — # Metadata Tag Search

**Status:** Implemented

**Depends on:** Spec 076 (Worker Protocol and List Caching), Spec 077 (Query Engine — my:list), Spec 109 (Deck Instance Model), Spec 121 (My List Printing-Domain Only), Spec 120 (CLI list-diff)

**Updates:** Spec 120 — relax query requirement so list-diff accepts `#` metadata queries without `my:list` (see § Spec 120 Update below).

## Goal

Add `#value` query syntax to search card-in-list metadata: zone, tags, collection_status, and variant. `my:list #combo` returns only cards/printings with the `combo` tag (or zone, or collector status, or variant). Matching is case-insensitive, substring-based — same semantics as bare word matching in card names. `#` queries are **pan-list** (all non-trash lists); trash is excluded by default so `#combo` means "my combo pieces" not "including removed cards."

## Background

Spec 109 extends Instances with `zone`, `tags`, `collection_status`, and `variant`. Spec 076/077/121 send list membership to the worker for `my:` evaluation. This spec adds a **pan-list metadata index** across all non-trash lists (`#combo`). Trash excluded from metadata index matches user expectation: "show my combo pieces" = active list(s), not former. Currently only the default list exists; structure scales to future multi-list.

## Scope

- **In scope:** Pan-list metadata index (non-trash only); parser/evaluator handling of `#value`; substring matching across zone, tags, collection_status, variant; CLI `list-diff` support for `#` queries when a list is provided.
- **Out of scope:** Implementing `printingIndices` for list membership (Spec 121 — already done); `include:trash` (opt-in to include trash in `#` results); `#:list` syntax; autocomplete for metadata values; Spec 109 §8's `##37d67a` (color-only match).

## Technical Details

### Query Syntax

- `#value` — bare word prefixed with `#`. Lexed as `WORD "#value"` → `BARE` with `value: "#value"`. Evaluator branches: when `value.startsWith('#')`, strip `#` and evaluate as metadata search instead of name search.
- **Naked `#`:** `#` alone (empty post-strip) matches all metadata — the union of all indexed keys. Every listed Instance has a zone (or implicit zone); zones appear in the metadata index. So `#` yields the same set as `my:list`: all Instances in non-trash lists.
- Negation: `-#combo` works via `NOT(BARE("#combo"))`; evaluator handles `#` in both positive and negated cases.
- Examples: `#combo` (tag), `#commander` (zone or tag), `#com` (matches both combo and commander), `#donth` (Archidekt `^Don't Have,#334455^`), `#ramp` (Moxfield `#!Ramp`).

### Matching Semantics

- **Sources:** `zone`, each entry in `tags[]`, `collection_status`, `variant`. All treated uniformly.
- **Normalization:** Same as bare words: `value.toLowerCase().replace(/[^a-z0-9]/g, "")`. So `"Don't Have,#334455"` → `"donthave334455"`.
- **Substring:** Query `#com` normalized to `"com"`. For each indexed metadata string, if `normalizedString.includes(queryNorm)` then that string's indices contribute. Allocate `Uint8Array(printingCount)`, set `buf[idx] = 1` for each index across all contributing keys; return combined mask.
- **List scope:** Pan-list, trash excluded. `#combo` matches metadata across all non-trash lists. Currently that's the default list only; future multi-list will span all. `my:list #combo` ANDs list membership with metadata → default-list cards with combo tag.

### Metadata Inverted Index Structure (Pan-List, Trash Excluded)

Per normalized metadata string, store the **printing indices** that match — across all non-trash lists. Sparse representation: tens of indices per key vs. `printingCount` bytes per key.

- **Index:** `Map<normalizedString, Uint32Array>`. Keys are the normalized forms of zone, each tag, collection_status, variant. Values are arrays of printing row indices from **non-trash lists only**.
- **Build:** Iterate Instances in all non-trash lists (currently default; future: all user lists). For each Instance, resolve to printing index(es) (same logic as list-mask-builder). For each metadata string (zone, each tag, collection_status, variant), normalize and add this Instance's printing index(es) to that key's set. Treat `zone: null` as `"Deck"` so every Instance contributes to at least one key (ensures naked `#` = `my:list`). Dedupe per key. Convert each set to `Uint32Array` for transfer.

### Protocol Extension

Extend `list-update` in `shared/src/worker-protocol.ts` to add `metadataIndex`. The full shape (Spec 121 + this spec):

```typescript
| {
    type: 'list-update';
    listId: string;
    /** Inverted: printing indices in list (Spec 121). Omit when empty. Transfer. */
    printingIndices?: Uint32Array;
    /** Inverted index for # queries. keys[i] → indexArrays[i] (printing indices). Transfer indexArrays. */
    metadataIndex?: { keys: string[]; indexArrays: Uint32Array[] };
  };
```

- `printingIndices`: From Spec 121 (implemented). Sparse list membership per list (`my:list`, `my:trash`). Same inverted-index pattern as `metadataIndex`.
- `metadataIndex`: Pan-list (non-trash). `keys[i]` = normalized metadata string; `indexArrays[i]` = printing indices. Sent with default list-update (rebuilt when any non-trash list changes; when a non-default list changes, rebuild and send default's list-update to deliver updated metadata). Omit when no metadata.
- All `Uint32Array`s transferable.

### Main Thread Responsibilities

1. On list load or change: build `metadataIndex` from Instances in **non-trash lists only** (default + future user lists); treat `zone: null` as `"Deck"` so every Instance contributes. (Spec 121 already handles `printingIndices` per list.)
2. Use same Instance → printing mapping as `list-mask-builder` (oracle_id, scryfall_id, finish, canonicalPrintingPerFace).
3. Include `metadataIndex` with default list-update (rebuilt when any non-trash list changes). Transfer all `Uint32Array` buffers.

### Worker Responsibilities

1. List mask cache: `Map<listId, { printingIndices?: Uint32Array; metadataIndex? }>`. Spec 121 already stores `printingIndices` per list; extend to store `metadataIndex` when present.
2. On `list-update`: overwrite cache entry; evict NodeCache (unchanged).
3. **`#` leaf:** Call `getMetadataIndex()` → `{ keys: string[]; indexArrays: Uint32Array[] } | null` (pan-list, trash excluded). Allocate `Uint8Array(printingCount)`; for each key where `key.includes(queryNorm)` (or all keys when `queryNorm` is empty), iterate `indexArrays[i]` and set `buf[idx] = 1`; return buffer.

### Evaluator Integration

- **`my:` leaf:** Already expands `printingIndices` to mask (Spec 121). Same expansion pattern for `#` leaf below.
- **BARE handler:** If `ast.value.startsWith('#')`, strip `#`, normalize query, call `evalLeafMetadataTag(value, getMetadataIndex)` instead of `evalLeafBareWord`.
- **Domain:** `#` produces printing-domain result (same as `my:list`). Composes with `my:list` via AND. Pan-list (trash excluded) so `#combo` alone = combo pieces in active list(s).
- **No metadata:** If `getMetadataIndex()` returns null or empty, `#value` returns zeroed mask.

### Empty / No Metadata

- **Naked `#`:** When `queryNorm` is empty (e.g. `#` alone), `key.includes("")` is true for all keys; all indexed printing indices contribute. Result = union of all non-trash list Instances (same as `my:list`).
- No metadata: omit `metadataIndex` from `list-update`. Worker: `getMetadataIndex()` returns null or empty; `#value` returns zeroed mask.

### Spec 120 Update

Spec 120 currently requires the query to contain `my:list` (or `my:default`) and rejects queries without `my:`. As part of implementing this spec, **update Spec 120** so list-diff accepts queries that use list context in either way:

- `my:list` / `my:default` (list membership), or
- `#` metadata queries (pan-list metadata index built from the list)

Thus `list-diff "#combo" --list ./deck.txt` is valid: expected = parsed list entries whose metadata matches `#combo`; actual = search results for `#combo`. The list is provided via `--list`; the query need not include `my:list`. Reject only when the query uses neither `my:` nor `#` (no list context).

### Quoted `#` Handling

`"#combo"` produces `BARE` with `value: "#combo"` and `quoted: true`. Treat identically to unquoted `#combo`: strip `#`, normalize, evaluate as metadata search. The `quoted` flag is irrelevant for `#` semantics.

### getMetadataIndex Placement

`metadataIndex` is sent only with the default list's `list-update`. The worker stores it in the default list's cache entry. `getMetadataIndex()` returns that `metadataIndex` (pan-list, trash excluded).

## Acceptance Criteria

### Metadata (#) queries

- [x] `#combo` matches Instances with "combo" in zone, any tag, collection_status, or variant (substring, case-insensitive)
- [x] `#com` matches both "combo" and "commander"
- [x] `#donth` matches Archidekt `^Don't Have,#334455^`
- [x] `my:list #combo` composes (AND)
- [x] `-#combo` negates metadata match
- [x] Main thread builds pan-list metadata index (non-trash lists only); sends with default list-update
- [x] Metadata index uses inverted indices (Uint32Array of printing indices per key); evaluator expands to Uint8Array for NodeCache
- [x] `#combo` excludes trash (matches only non-trash lists; currently default)
- [x] No metadata in list: `#value` returns empty result
- [x] Naked `#` returns union of all non-trash list Instances (same as `my:list`)
- [x] CLI `list-diff` resolves `#` queries when a list is provided (Spec 120)
- [x] Spec 120 updated: list-diff accepts `#` queries without `my:list`; reject only when query has neither `my:` nor `#`

## Implementation Notes

- Metadata index uses the same inverted-index pattern as list membership (Spec 121): `Uint32Array` of printing indices per key instead of full masks. Smaller transfer, cheaper query evaluation. Final result allocates Uint8Array(printingCount) for NodeCache interning.
- Pan-list metadata + trash excluded: user expectation "my combo pieces" = active list(s), not discarded. Build metadata index from `view.instancesByList` for all listIds except `TRASH_LIST_ID`. Rebuild when any non-trash list changes; send with default list-update.
- Metadata index builder: add `buildMetadataIndex(view, options)` in `shared/src/list-mask-builder.ts` reusing Instance→printing resolution from `buildMasksForList`.
- **CLI list-diff metadata:** `ParsedEntry` has only `oracle_id`, `scryfall_id`, `finish`, `variant` — not `zone`, `tags`, or `collection_status`. To build the metadata index for `#` queries, run the import procedure (or a non-persisting variant) on the list text to obtain `InstanceState[]` with full metadata, then call `buildMetadataIndex` on that. Alternatively extend validation to return metadata per line; either approach is acceptable.
