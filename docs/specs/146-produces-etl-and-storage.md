# Spec 146: Produces Mana — ETL, Storage, and Load-Time Materialization

**Status:** Draft

**GitHub Issue:** [#123](https://github.com/jimbojw/frantic-search/issues/123)

**Depends on:** Spec 001 (ETL Download), Spec 003 (ETL Process), Spec 005 (App Data Loading), Spec 002 (Query Engine — for CardIndex)

## Goal

Add the data foundation for `produces` queries (cards that can produce specified mana types, e.g. lands, mana rocks, rituals). This spec covers the first half: ETL extraction, inverted index storage format, and Worker materialization into a single Uint8Array bitmask. The evaluator integration (`produces:wu` query support) is deferred to a follow-up spec.

## Background

Scryfall supports `produces:` and `produces=` to find cards that produce specific types of mana — distinct from `mana:` which matches mana cost. Example: `produces:wu` finds cards capable of producing white and blue mana (834 cards per Scryfall).

Scryfall's Oracle Cards bulk data includes `produced_mana` per card: an array of color strings (`["W","U"]`, `["C"]`, etc.) or `null` when the card does not produce mana. Per the [Scryfall Card Objects API](https://scryfall.com/docs/api/cards):

> **`produced_mana`** | [Colors](https://scryfall.com/docs/api/colors) | Nullable | Colors of mana that this card could produce.

The design uses a dynamic keyed object: `produces: Record<string, number[]>` with one inverted-index array per symbol discovered in the data. The worker expands this into a single `Uint8Array(faceCount)` where each element is a bitmask: bit N indicates whether that face produces the symbol at canonical position N. Symbols use canonical (alphabetical) ordering for stable bit assignment. This affords organic discovery of symbols like `T` (Sole Performer) without special-casing, while keeping eval to a single linear scan and ~34 KB memory.

## Scope

| In scope | Out of scope |
|----------|--------------|
| ETL: read `produced_mana`, build dynamic `produces` object | Evaluator: `produces` field handling |
| Storage: add `produces` to columns.json | Parser: `produces` field alias |
| Worker: materialize `produces` into Uint8Array bitmask in CardIndex | Reference docs, syntax help, compliance tests |

## Data Model

### Dynamic key discovery

ETL does **not** hardcode a fixed set of symbols. Instead, it iterates over `produced_mana` and builds `produces[key]` for each letter that appears. Keys use uppercase single-letter form (W, U, B, R, G, C) as in Scryfall; non-standard symbols like `T` are discovered organically.

Cards that produce "any color" have `["W","U","B","R","G"]`. Cards that produce no mana have `null` or `[]` and do not appear in any array.

### Research spike: Observed values

Analysis of `data/raw/oracle-cards.json` (post-download):

| Metric | Count |
|--------|-------|
| Cards with `produced_mana` | 2,608 |
| Cards with `null`/`undefined` | 34,315 |
| Cards with `[]` | 0 |

**Unique letters in `produced_mana` arrays:** `B`, `C`, `G`, `R`, `T`, `U`, `W`.

Beyond WUBRG+C, only **`T`** appears — in 1 card: **Sole Performer** (`produced_mana: ["T"]`). Its oracle text adds `{T}{T}` (tap symbols), not mana. Scryfall's [Colors](https://scryfall.com/docs/api/colors) spec lists only W/U/B/R/G/C; `T` is undocumented. With the dynamic structure, we **support** T organically — no special-casing. `produces:t` will match Sole Performer. This is a principled divergence from Scryfall (which returns "Unknown color t" for `produces:t`).

### Multi-face cards

`produced_mana` is **card-level** in Scryfall, not face-level. For multi-face cards (e.g. Glasspool Mimic // Glasspool Shore, where the land face produces mana), Scryfall reports the aggregated set of mana the card can produce when that face is in play.

We store **canonical face indices** in the data file — one per card per symbol. A two-face card that produces W contributes a single index (its canonical face) to `produces["W"]`; we do not duplicate for each face. The worker then **fans out** when building the bitmask: for each canonical face in the inverted index, it sets the bit for all face rows of that card (via `facesOf`). The resulting `producesData` therefore has the bitmask set for every face row of a producing card — both faces of a DFC land get the bit. The evaluator checks `(producesData[i] & queryMask) === queryMask` for "produces at least" semantics.

## ETL Changes

### Input

No new download. `produced_mana` is already present in `data/raw/oracle-cards.json` from the existing `download` command (Spec 001).

### Process logic

1. **Add `produced_mana?: string[]`** to the `Card` interface in `etl/src/process.ts`.
2. **Initialize** `produces: Record<string, number[]>` (empty object).
3. **During face expansion** (before pushing faces, once per card):
   - Read `card.produced_mana ?? []`
   - Let `canonicalFace = data.names.length` (the index of the first face we are about to push)
   - For each letter in the array:
     - Let `key = letter.toUpperCase()` (for consistent keys)
     - Ensure `produces[key]` exists (or create as `[]`)
     - Append `canonicalFace` to `produces[key]` (one entry per card per symbol, not per face)
4. **After all cards processed**: sort each array in `produces` for gzip compression.
5. **Add `produces`** to the `ColumnarData` output.

### Field sourcing

| Field | Source | Notes |
|-------|--------|-------|
| `produced_mana` | Card top-level | Same value for all faces of a multi-face card |

## Storage Format

### Columnar data (`columns.json`)

Add a required `produces` object to `ColumnarData` in `shared/src/data.ts`. Required is intentional: the app and data are built together in CI/CD with co-dependent file names; there is no case where the app loads legacy `columns.json` without this field.

```ts
/** Produced-symbol inverted index. Keys are uppercase letters (W, U, B, R, G, C, T, etc.) discovered from data. */
produces: Record<string, number[]>;
```

Each value is a sorted list of **canonical face indices** (one per card per symbol). A card that produces W and U appears in both `produces["W"]` and `produces["U"]`; a multi-face card contributes one canonical index per symbol, not one per face. Cards that produce no mana appear in none. Key order in the file is irrelevant; the worker derives canonical ordering via `Object.keys(data.produces).sort()`.

## Worker: Load-Time Materialization (Bitmask)

### Bit assignment

Keys from `data.produces` are sorted alphabetically to form a canonical order. Each symbol gets a bit: first symbol `1 << 0`, second `1 << 1`, etc. The worker builds `producesMasks: Record<string, number>` accordingly. Example for B, C, G, R, T, U, W: `{ B: 1, C: 2, G: 4, R: 8, T: 16, U: 32, W: 64 }`.

### CardIndex construction

When building `CardIndex` from `ColumnarData`, after other fields are initialized:

1. Derive `producesMasks` from canonical (alphabetical) key order: `Object.keys(data.produces).sort()` → assign `1 << 0` to first, `1 << 1` to second, etc.
2. Allocate `producesData = new Uint8Array(faceCount)` (zeros).
3. For each `[key, indices]` in `data.produces`:
   - For each canonical face `cf` in `indices`:
     - For each face row `f` in `facesOf(cf)`:
       - `producesData[f] |= producesMasks[key]`
   - This fans out from canonical to all face rows so that both faces of a DFC have the bit set.
4. Attach `producesData` and `producesMasks` to CardIndex for use by the evaluator (in the follow-up spec).

```ts
// Pseudocode (facesOf = canonical face → face rows of that card)
const keys = Object.keys(data.produces).sort();
const producesMasks: Record<string, number> = {};
keys.forEach((k, i) => { producesMasks[k] = 1 << i; });

const producesData = new Uint8Array(faceCount);
for (const [key, indices] of Object.entries(data.produces)) {
  const mask = producesMasks[key];
  for (const cf of indices) {
    for (const f of facesOf(cf)) producesData[f] |= mask;
  }
}
```

### Evaluation semantics (follow-up spec)

For a query like `produces:wu`, the evaluator computes `queryMask = producesMasks["W"] | producesMasks["U"]` and fills the result buffer: `buf[i] = (producesData[i] & queryMask) === queryMask ? 1 : 0`. This implements "produces at least W and U" (superset semantics).

### Index semantics

- **Length:** `producesData` has length `faceCount` (number of face rows).
- **Indexing:** The evaluator iterates over face row index `i` and checks `(producesData[i] & queryMask) === queryMask`. One read, one AND, one compare per face — cache-friendly sequential scan.
- **Missing keys:** If the user queries `produces:x` and `producesMasks["X"]` is not present, treat as 0 matches (all zeros).
- **Capacity:** Uint8Array supports up to 8 bits (8 symbols). If more appear in future data, switch to Uint16Array.
- **Memory:** faceCount × 1 byte ≈ 34 KB for ~34k faces.

## File Changes Summary

| File | Changes |
|------|---------|
| `shared/src/data.ts` | Add `produces: Record<string, number[]>` (required) to `ColumnarData` |
| `etl/src/process.ts` | Add `produced_mana` to Card interface; build dynamic `produces` object during face expansion; add to output |
| `shared/src/search/card-index.ts` | Add `producesData: Uint8Array` and `producesMasks: Record<string, number>`; expand inverted index to bitmask in constructor |

## Acceptance Criteria

1. Running `npm run etl -- process` after `download` adds `produces` to `columns.json` with keys for each symbol present in `produced_mana` (W, U, B, R, G, C, and T per current data).
2. Each value array contains sorted canonical face indices (one per card per symbol); a card producing W and U appears in both `produces["W"]` and `produces["U"]`; multi-face cards contribute one canonical index per symbol.
3. Cards with `produced_mana: null` or `[]` do not appear in any array.
4. CardIndex materializes `producesData` (Uint8Array bitmask) and `producesMasks` correctly from the inverted index.
5. `produces:t` (follow-up spec) matches Sole Performer.
6. `npm run typecheck` passes across all workspaces.

## Spec Updates

| Spec | Update |
|------|--------|
| 003 | Add produces inverted-index object to column encoding section |
| 002 | (Follow-up) Add `produces` to Supported Fields |

## Implementation Notes

*(To be added as implementation proceeds.)*
