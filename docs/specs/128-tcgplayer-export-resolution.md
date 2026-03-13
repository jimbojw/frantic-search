# Spec 128: TCGPlayer Export Resolution

**Status:** Implemented

**Depends on:** Spec 127 (TCGCSV ETL Download), Spec 046 (Printing Data Model), Spec 110 (Hybrid Deck Editor)

Spec 110 provides the deck editor UI; this spec affects the TCGPlayer export format produced when the user exports a deck list.

## Goal

Resolve Scryfall printings to TCGPlayer Mass Entry format (`[SET] collector`) so deck lists exported for TCGPlayer paste correctly into TCGPlayer's bulk entry. Currently, serialization uses Scryfall's set codes (with a small mapping for promo sets) and Scryfall's collector numbers. TCGPlayer uses a different product hierarchy: variant prints (e.g., Showcase Scrolls) often appear as separate products with different set codes or numbers. Cards like `Banquet Guests [LTC] 450` fail at TCGPlayer because 450 is Scryfall's number; TCGPlayer expects `[LTC] 47` for the regular printing or a different identifier for the Showcase variant.

## Background

Scryfall's `default_cards` bulk data includes `tcgplayer_id` (and optionally `tcgplayer_etched_id`) per printing. This is the TCGPlayer product ID. The TCGCSV process step (Spec 127) reads raw TCGCSV data and produces a mapping from productId to TCGPlayer's Mass Entry format: `(groupId.abbreviation, product.extendedData.Number)`.

The join path: Scryfall printing → `tcgplayer_id` → TCGCSV product map → `[SET] collector` for Mass Entry.

### Current Serialization (Pre-128)

`serializeTcgplayer` in `shared/src/list-serialize.ts`:

1. Gets `setCode` and `collectorNumber` from `PrintingDisplayColumns` (Scryfall set + collector).
2. Applies `tcgplayerSetCode(setCode)` — only maps ~10 promo sets (UMP, LIST, PPTHB, etc.); others pass through uppercased.
3. Emits `quantity name [SET] collector`.

This fails when TCGPlayer structures variants differently (separate products, different numbering).

### After Spec 128

When a printing has a resolved TCGPlayer mapping, use `tcgplayer_set_code` and `tcgplayer_collector_number` instead of deriving from Scryfall. Fall back to the current logic when no mapping exists.

## Data Flow

```
Scryfall default_cards     TCGCSV process step (Spec 127)
       │                         │
       │ tcgplayer_id             │ data/dist/tcgcsv-product-map.json
       │                         │ productId → (abbrev, number)
       │                         │
       └──────────┬───────────────┘
                  │
                  ▼
         process-printings
         (join, emit dictionary-encoded)
                  │
                  ▼
    PrintingColumnarData
    tcgplayer_set_lookup, tcgplayer_number_lookup
    tcgplayer_set_indices, tcgplayer_number_indices
                  │
                  ▼
    extractPrintingDisplayColumns
    (resolve indices → strings for worker)
                  │
                  ▼
    serializeTcgplayer
    (prefer TCGPlayer when present)
```

## PrintingColumnarData Extension

Add optional columns to `PrintingColumnarData` in `shared/src/data.ts`. Use dictionary encoding (lookup tables + indices) to reduce payload size and improve gzip compression, matching the `set_indices` / `set_lookup` pattern.

| Column | Type | Description |
|--------|------|-------------|
| `tcgplayer_set_lookup` | `string[]` | Lookup table. Index 0 = `""` (no resolution). |
| `tcgplayer_number_lookup` | `string[]` | Lookup table. Index 0 = `""` (no resolution). |
| `tcgplayer_set_indices` | `number[]` | uint16 index into `tcgplayer_set_lookup`. 0 = no resolution. |
| `tcgplayer_number_indices` | `number[]` | uint16 index into `tcgplayer_number_lookup`. 0 = no resolution. |

All four arrays are aligned with existing printing rows. When the columns are omitted entirely (legacy `printings.json`), the printing has no TCGPlayer resolution; serializeTcgplayer falls back to Scryfall-derived values.

## PrintingDisplayColumns Extension

Add optional fields to `PrintingDisplayColumns` in `shared/src/worker-protocol.ts`:

| Field | Type | Description |
|-------|------|-------------|
| `tcgplayer_set_codes` | `string[]` | Resolved set codes for display. |
| `tcgplayer_collector_numbers` | `string[]` | Resolved collector numbers for display. |

`extractPrintingDisplayColumns` in `shared/src/display-columns.ts` resolves indices to strings when TCGPlayer columns exist: for each row, if `tcgplayer_set_indices[row] > 0`, use `tcgplayer_set_lookup[tcgplayer_set_indices[row]]` and `tcgplayer_number_lookup[tcgplayer_number_indices[row]]`; otherwise use `""`. The worker receives resolved strings in `tcgplayer_set_codes` and `tcgplayer_collector_numbers`; `serializeTcgplayer` uses these when present (see Serialization Changes).

## ETL: process-printings Changes

In `etl/src/process-printings.ts`:

1. **Load TCGCSV mapping** — If `data/dist/tcgcsv-product-map.json` exists (Spec 127 process step output), load it. Else, skip TCGPlayer resolution.
2. **Extract tcgplayer_id** — When iterating each entry in `default-cards.json`, read `tcgplayer_id` (and for etched rows, `tcgplayer_etched_id` if the finish is etched). Scryfall documents these as optional integers.
3. **Resolve per row** — For each emitted printing row (including finish explosion):
   - Nonfoil: use `tcgplayer_id`.
   - Etched: use `tcgplayer_etched_id` when present; else `tcgplayer_id`.
   - Foil: use `tcgplayer_id` (TCGPlayer may have separate foil products; Scryfall links the primary one; foil Mass Entry behavior is undefined and may need future work).
4. **Look up in TCGCSV map** — If we have a productId and it exists in the TCGCSV map, encode `entry.setAbbrev` and `entry.number` via dictionary encoders. Else push 0 for both.

**Dictionary encoding:** Use two separate string-to-index encoders (one for set codes, one for collector numbers). Each reserves index 0 for `""` (no resolution). Rows without resolution get index 0. Matches the `set_indices` / `set_lookup` pattern for smaller payloads and better gzip compression.

## Serialization Changes

Resolution happens in `aggregateInstances` when building entries for the TCGPlayer export path. Pass `preferTcgplayerForSetAndNumber: true` when calling `groupByZone` from `serializeTcgplayer` so that only the TCGPlayer format uses resolved values; other formats (Moxfield, Archidekt, etc.) continue to use Scryfall set codes and collector numbers.

For each aggregated entry, when looking up `setCode` and `collectorNumber` from the printing row:

1. If `preferTcgplayerForSetAndNumber` is true and `printingDisplay.tcgplayer_set_codes` and `printingDisplay.tcgplayer_collector_numbers` exist and the row has non-empty values: use `tcgplayer_set_codes[row]` and `tcgplayer_collector_numbers[row]` directly (already in TCGPlayer format; no `tcgplayerSetCode` transform).
2. Else: use `tcgplayerSetCode(printingDisplay.set_codes[row])` and `printingDisplay.collector_numbers[row]`.
3. If the chosen setCode and collectorNumber are both non-empty: emit `quantity name [SET] collector`.
4. Else: emit `quantity name` only (name-only fallback; TCGPlayer accepts this with best-effort matching).

## Finish Handling

TCGPlayer Mass Entry does not support foil/etched markers. `serializeTcgplayer` already outputs lines without finish markers (Spec 109). The primary use case is nonfoil; `tcgplayer_id` in Scryfall typically refers to the default (nonfoil) product. Etched variants may have `tcgplayer_etched_id`; when emitting an etched instance, we resolve via that ID if present. Foil instances: use `tcgplayer_id` as a best-effort fallback; TCGPlayer may or may not match them correctly.

## Fallback Semantics

| Scenario | Behavior |
|----------|----------|
| Printing has TCGPlayer resolution | Use `tcgplayer_set_code` + `tcgplayer_collector_number` |
| No resolution (empty or missing) | Use `tcgplayerSetCode(Scryfall set)` + Scryfall collector number |
| Scryfall set has no TCGPlayer mapping | Uppercase Scryfall code (existing behavior) |
| Both set and number empty after resolution | Emit `quantity name` only |

## Spec Updates

| Spec | Update |
|------|--------|
| 046 | Document `tcgplayer_set_lookup`, `tcgplayer_number_lookup`, `tcgplayer_set_indices`, and `tcgplayer_number_indices` as optional columns in PrintingColumnarData |
| 024 | Document optional `tcgplayer_set_codes` and `tcgplayer_collector_numbers` on PrintingDisplayColumns in the printings-ready message (resolved strings; indices are internal) |

## Acceptance Criteria

1. With TCGCSV data present (`npm run etl -- download-tcgcsv` then `npm run etl -- process`), the process step produces `data/dist/tcgcsv-product-map.json`, and `printings.json` includes `tcgplayer_set_lookup`, `tcgplayer_number_lookup`, `tcgplayer_set_indices`, and `tcgplayer_number_indices`. Rows where Scryfall provides `tcgplayer_id` and the product map has the product have non-zero indices; others have 0.
2. Without TCGCSV data (or when the product map is absent), `printings.json` omits these columns; serialization uses Scryfall-derived values.
3. `serializeTcgplayer` prefers TCGPlayer values when present and non-empty (via resolved display columns).
4. Deck lists exported for TCGPlayer that previously failed (e.g., Banquet Guests LTC 450, Frodo LTC 461, basic lands from TMT) produce lines that TCGPlayer accepts when resolution exists. See Implementation Notes for expected output examples.
5. Legacy `printings.json` (without TCGPlayer columns) continues to work; serialization falls back to current behavior.
6. `extractPrintingDisplayColumns` resolves indices to strings and passes `tcgplayer_set_codes` and `tcgplayer_collector_numbers` to the worker.

## Implementation Notes

- **DefaultCard interface:** Extend the `DefaultCard` interface in `etl/src/process-printings.ts` with `tcgplayer_id?: number` and `tcgplayer_etched_id?: number` to read Scryfall's optional TCGPlayer product IDs.
- **Test deck for criterion 4:** A minimal regression test deck could include Banquet Guests (LTC regular), Frodo, Adventurous Hobbit (LTC), and basic lands from TMT. With resolution, expected output includes e.g. `1 Banquet Guests [LTC] 47` (not `450`). Manual paste into TCGPlayer Mass Entry remains the authoritative acceptance test.
