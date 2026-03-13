# Spec 128: TCGPlayer Export Resolution

**Status:** Draft

**Depends on:** Spec 127 (TCGCSV ETL Download), Spec 046 (Printing Data Model), Spec 110 (Hybrid Deck Editor)

## Goal

Resolve Scryfall printings to TCGPlayer Mass Entry format (`[SET] collector`) so deck lists exported for TCGPlayer paste correctly into TCGPlayer's bulk entry. Currently, serialization uses Scryfall's set codes (with a small mapping for promo sets) and Scryfall's collector numbers. TCGPlayer uses a different product hierarchy: variant prints (e.g., Showcase Scrolls) often appear as separate products with different set codes or numbers. Cards like `Banquet Guests [LTC] 450` fail at TCGPlayer because 450 is Scryfall's number; TCGPlayer expects `[LTC] 47` for the regular printing or a different identifier for the Showcase variant.

## Background

Scryfall's `default_cards` bulk data includes `tcgplayer_id` (and optionally `tcgplayer_etched_id`) per printing. This is the TCGPlayer product ID. TCGCSV (Spec 127) provides a mapping from productId to TCGPlayer's Mass Entry format: `(groupId.abbreviation, product.extendedData.Number)`.

The join path: Scryfall printing → `tcgplayer_id` → TCGCSV product → group abbreviation + Number → `[SET] collector` for Mass Entry.

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
Scryfall default_cards     TCGCSV (Spec 127)
       │                         │
       │ tcgplayer_id             │ productId → (abbrev, number)
       │                         │
       └──────────┬───────────────┘
                  │
                  ▼
         process-printings
         (join, emit resolved)
                  │
                  ▼
    PrintingColumnarData
    tcgplayer_set_codes?
    tcgplayer_collector_numbers?
                  │
                  ▼
    extractPrintingDisplayColumns
    (pass through to worker)
                  │
                  ▼
    serializeTcgplayer
    (prefer TCGPlayer when present)
```

## PrintingColumnarData Extension

Add optional columns to `PrintingColumnarData` in `shared/src/data.ts`:

| Column | Type | Description |
|--------|------|-------------|
| `tcgplayer_set_codes` | `string[]` | TCGPlayer Mass Entry set code for this printing row. Present only when resolved via `tcgplayer_id` + TCGCSV. |
| `tcgplayer_collector_numbers` | `string[]` | TCGPlayer collector number for this printing row. Present only when resolved. |

Both arrays are aligned with existing printing rows. When absent for a row (or when the column is omitted entirely), the printing has no TCGPlayer resolution; serializeTcgplayer falls back to Scryfall-derived values.

Legacy `printings.json` without these columns: `extractPrintingDisplayColumns` produces no `tcgplayer_set_codes` / `tcgplayer_collector_numbers` in `PrintingDisplayColumns`. Serialization uses fallback.

## PrintingDisplayColumns Extension

Add optional fields to `PrintingDisplayColumns` in `shared/src/worker-protocol.ts`:

| Field | Type | Description |
|-------|------|-------------|
| `tcgplayer_set_codes` | `string[]` | Pass-through from PrintingColumnarData. |
| `tcgplayer_collector_numbers` | `string[]` | Pass-through from PrintingColumnarData. |

`extractPrintingDisplayColumns` in `shared/src/display-columns.ts` copies these when present.

## ETL: process-printings Changes

In `etl/src/process-printings.ts`:

1. **Load TCGCSV mapping** — If `data/raw/tcgcsv-products.json` exists (Spec 127 output), load it. Else, skip TCGPlayer resolution.
2. **Extract tcgplayer_id** — When iterating each entry in `default-cards.json`, read `tcgplayer_id` (and for etched rows, `tcgplayer_etched_id` if the finish is etched). Scryfall documents these as optional integers.
3. **Resolve per row** — For each emitted printing row (including finish explosion):
   - Nonfoil: use `tcgplayer_id`.
   - Etched: use `tcgplayer_etched_id` when present; else `tcgplayer_id`.
   - Foil: use `tcgplayer_id` (TCGPlayer may have separate foil products; Scryfall links the primary one; foil Mass Entry behavior is undefined and may need future work).
4. **Look up in TCGCSV map** — If we have a productId and it exists in the TCGCSV map, push `tcgplayer_set_codes.push(entry.setAbbrev)` and `tcgplayer_collector_numbers.push(entry.number)`. Else push empty string (or omit the row from the optional columns if using a sparse representation — see below).

**Sparse vs dense:** For simplicity, use dense arrays. Rows without resolution get `""` for both `tcgplayer_set_code` and `tcgplayer_collector_number`. At serialize time, empty string means "no resolution, use fallback."

## Serialization Changes

In `serializeTcgplayer` (`shared/src/list-serialize.ts`):

For each aggregated entry, when looking up `setCode` and `collectorNumber` from the printing row:

1. If `printingDisplay.tcgplayer_set_codes` and `printingDisplay.tcgplayer_collector_numbers` exist and the row has non-empty values: use `tcgplayer_set_codes[row]` and `tcgplayer_collector_numbers[row]`.
2. Else: use current logic — `tcgplayerSetCode(printingDisplay.set_codes[row])` and `printingDisplay.collector_numbers[row]`.
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
| 046 | Document `tcgplayer_set_codes` and `tcgplayer_collector_numbers` as optional columns in PrintingColumnarData |
| 007 | Document optional `tcgplayer_set_codes` and `tcgplayer_collector_numbers` on PrintingDisplayColumns in the printings-ready message |

## Acceptance Criteria

1. With TCGCSV data present (`npm run etl -- download-tcgcsv` then `npm run etl -- process`), `printings.json` includes `tcgplayer_set_codes` and `tcgplayer_collector_numbers` for rows where Scryfall provides `tcgplayer_id` and TCGCSV has the product.
2. Without TCGCSV data, `printings.json` omits these columns (or they are empty); serialization uses Scryfall-derived values.
3. `serializeTcgplayer` prefers TCGPlayer values when present and non-empty.
4. Deck lists exported for TCGPlayer that previously failed (e.g., Banquet Guests LTC 450, Frodo LTC 461, basic lands from TMT) produce lines that TCGPlayer accepts when resolution exists.
5. Legacy `printings.json` (without TCGPlayer columns) continues to work; serialization falls back to current behavior.
6. `extractPrintingDisplayColumns` and the worker protocol pass through TCGPlayer columns when present.

## Implementation Notes

*(None yet — this spec is draft.)*
