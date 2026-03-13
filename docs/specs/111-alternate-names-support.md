# Spec 111: Alternate Names Support (printed_name, flavor_name)

**Status:** Draft

**GitHub Issue:** [#135](https://github.com/jimbojw/frantic-search/issues/135)

**Depends on:** Spec 002 (Query Engine), Spec 003 (ETL Process), Spec 046 (Printing Data Model), Spec 108 (List Import), Spec 097 (Name Autocomplete), Spec 024 (Index-Based Result Protocol)

## Goal

Support alternate card names so users can search, import, and autocomplete by names that differ from the Oracle name. Covers:

1. **`printed_name`** — Universes Beyond licensing names (e.g., Leyline Weaver → Spider Manifestation)
2. **`flavor_name`** — Godzilla-style crossover names (e.g., Bio-Quartz Spacegodzilla → Brokkos, Apex of Forever)

Both are print-level fields in Scryfall's default-cards. When present and different from `name`, they enable users to find cards by the name printed on specific products (Arena exports, Moxfield, etc.).

## Hybrid Index Model

Two indexes serve different purposes:

| Index | Location | Maps to | Purpose |
|-------|----------|---------|---------|
| Face-domain | columns.json | canonical face index | Search (BARE/EXACT), list validation "find the card", first-load |
| Printing-domain | printings.json | printing row indices | List-add default: prefer the printing that has that name on it |

**Rationale:** Search and validation must work as soon as columns loads. The face-domain index provides that. When adding "4 Leyline Weaver" to a list with no set specified, we default to the OM1 printing (the one with "Leyline Weaver" on it) via the printing-domain index.

## Spec Updates

| Spec | Update |
|------|--------|
| 003 | Add `alternate_names_index` to columns.json; document extraction from default-cards |
| 046 | Add `alternate_names_index` to printings.json; document extraction |
| 002 | Note that BARE/EXACT also consult alternate names |
| 108 | findCardByName fallback to alternate names; preferred printing when resolved via alternate name |
| 097 | Autocomplete candidate source includes alternate names |
| 024 | DisplayColumns gains `alternate_name_to_canonical_face`; PrintingDisplayColumns gains `alternate_name_to_printing_indices` |

## Technical Details

### 1. ETL: Face-domain index (columns.json)

**Source:** default-cards.json (same file used for UB detection in process.ts)

**Extraction:** For each printing in default-cards:
- Resolve `oracle_id` (top-level or `card_faces[0].oracle_id` for reversible_card)
- Collect `printed_name` and `flavor_name` when present and different from `name`
- For multi-face cards, also check `card_faces[].printed_name` and `card_faces[].flavor_name`
- Use raw alternate name as key (no normalization in ETL). Client builds normalized lookup at load time.

**Placement:** process.ts already reads default-cards for UB. After building columns, add a pass over default-cards to build `alternate_names_index`. We need `oracle_id` → canonical_face; build from `data.oracle_ids` and `data.canonical_face` (oracle_id → canonical_face for first occurrence of each oracle_id).

**Output:** `alternate_names_index: Record<string, number>` — raw alternate name → canonical face index. If multiple printings use the same alternate name for the same card, one entry suffices. Collisions (same alternate name, different cards) are unlikely; last write wins. CardIndex and extractDisplayColumns apply `normalizeAlphanumeric` when building the in-memory lookup.

### 2. ETL: Printing-domain index (printings.json)

**Source:** default-cards.json (same iteration as process-printings)

**Extraction:** During process-printings, when emitting printing rows:
- For each default-card with `printed_name` or `flavor_name` different from `name`, collect the raw alternate name(s)
- For each finish row emitted, the printing row index is known
- Add raw alternate name → [printing row indices] (one or more per physical printing due to finishes)

**Output:** `alternate_names_index: Record<string, number[]>` — raw alternate name → sorted printing row indices. extractPrintingDisplayColumns applies `normalizeAlphanumeric` when building the in-memory lookup. Used when adding to list with no set specified: pick first printing index, get `scryfall_id` from that row.

### 3. Search: BARE and EXACT

**Module:** `shared/src/search/eval-leaves.ts`

- `evalLeafBareWord`: After primary name check (combinedNamesLower, combinedNamesNormalized), if no match, look up normalized value in `alternate_names_index`; for each canonical face in the result, set `buf[cf] = 1`
- `evalLeafExact`: Same fallback — after primary name check, consult alternate names
- Face-domain index: `Record<string, number>` (single canonical face per alternate name)
- Worker loads index from columns.json; passes to evaluator via CardIndex or a ref

### 4. List validation: findCardByName

**Module:** `shared/src/list-validate.ts`

- If primary lookup (display.names, combinedNames) fails, check `alternate_name_to_canonical_face` (from DisplayColumns)
- Normalize input; look up; if found, resolve canonical face → face index and oracle_id
- Return same shape as primary match

### 5. List-add preferred printing

**Module:** `shared/src/list-validate.ts`

- When `scryfall_id` is null (no set/collector specified) and the card was resolved via alternate name, look up `alternate_name_to_printing_indices` (from PrintingDisplayColumns)
- If present, use first printing index to get `scryfall_id` from `printingDisplay.scryfall_ids[pi]`
- This defaults "4 Leyline Weaver" to the OM1 printing

### 6. Worker protocol

**DisplayColumns** (from columns.json):
- `alternate_name_to_canonical_face?: Record<string, number>` — optional for backward compatibility

**PrintingDisplayColumns** (from printings.json):
- `alternate_name_to_printing_indices?: Record<string, number[]>` — optional

**App worker:** Extract both from data; include in display/printingDisplay when posting ready.

### 7. Autocomplete

**Module:** `app/src/query-autocomplete.ts` (Spec 097)

- Add keys of `alternate_name_to_canonical_face` to the name candidate set for autocomplete
- Prefix match works as for primary names

## Data Format

### columns.json: `alternate_names_index`

```json
{
  "alternate_names_index": {
    "leylineweaver": 12345,
    "detectintrusion": 12346,
    "bioquartzspacegodzilla": 6789,
    ...
  }
}
```

- Keys: raw alternate names (as in Scryfall data; client normalizes at load)
- Values: canonical face indices
- Size: ~400–500 entries (UB + Godzilla + future); negligible

### printings.json: `alternate_names_index`

```json
{
  "alternate_names_index": {
    "Leyline Weaver": [45001, 45002],
    "Detect Intrusion": [45010, 45011],
    ...
  }
}
```

- Keys: raw alternate names (same as columns.json)
- Values: sorted printing row indices (one per finish variant of the physical printing)
- For list-add default: use first index

## Normalization

**Client-side only.** ETL emits raw names; `CardIndex`, `extractDisplayColumns`, and `extractPrintingDisplayColumns` build normalized lookups at load time via `normalizeAlphanumeric` (shared/src/normalize.ts): NFD decomposition, strip combining diacritics, lowercase, `[a-z0-9]` only. Same as primary names (Spec 018, Spec 096). List validation collapses whitespace before normalizing: `replace(/\s+/g, " ").trim()`.

## Files to Touch

| File | Changes |
|------|---------|
| `etl/src/process.ts` | Build `alternate_names_index` from default-cards; add to columns.json |
| `etl/src/process-printings.ts` | Add `printed_name`, `flavor_name` to DefaultCard; build `alternate_names_index`; add to printings output |
| `shared/src/data.ts` | Add `alternate_names_index` to ColumnarData, PrintingColumnarData |
| `shared/src/worker-protocol.ts` | Add optional fields to DisplayColumns, PrintingDisplayColumns |
| `shared/src/search/card-index.ts` | Accept/hold `alternate_names_index` for evaluator |
| `shared/src/search/eval-leaves.ts` | Consult alternate names in evalLeafBareWord, evalLeafExact |
| `shared/src/list-validate.ts` | findCardByName fallback; preferred printing when alternate name + no set |
| `app/src/worker.ts` | Extract alternate_name fields; pass to display/printingDisplay |
| `app/src/query-autocomplete.ts` | Include alternate names in autocomplete candidates |
| `docs/specs/003-etl-process.md` | Document alternate_names_index |
| `docs/specs/046-printing-data-model.md` | Document alternate_names_index |

## Testing (TDD)

1. **Search:** `Leyline Weaver` (bare) matches Spider Manifestation
2. **Search:** `!"Leyline Weaver"` (exact) matches Spider Manifestation
3. **Search:** `Bio-Quartz Spacegodzilla` matches Brokkos
4. **List validation:** "4 Leyline Weaver" → ok, not "Unknown card"
5. **List add:** "4 Leyline Weaver" with no set → defaults to OM1 printing (scryfall_id from that printing)
6. **Autocomplete:** Typing "Leyline" suggests Leyline Weaver
7. **Normalization:** "leyline weaver" and "Leyline Weaver" both resolve

## Acceptance Criteria

1. `alternate_names_index` present in columns.json after `npm run etl -- process`
2. `alternate_names_index` present in printings.json after process
3. Search "Leyline Weaver" returns Spider Manifestation
4. List import "4 Leyline Weaver" validates and adds with OM1 printing by default
5. Autocomplete suggests alternate names
6. Backward compatible: missing index yields no alternate-name matches
