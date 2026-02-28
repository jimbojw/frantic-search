# Spec 046: Printing Data Model and ETL

**Status:** Implemented

**Depends on:** Spec 003 (ETL Process), Spec 045 (Split Data Files), ADR-017 (Dual-Domain Query Evaluation)

## Goal

Introduce a printing-level columnar dataset alongside the existing card/face-level dataset. The ETL pipeline downloads Scryfall's `default_cards` bulk file, transforms it into a compact `printings.json`, and maps each printing back to the face-level model via a `canonical_face_ref` join key. Each finish variant (nonfoil, foil, etched) becomes its own row, so every row represents a single purchasable item with an unambiguous price.

## Background

Frantic Search currently operates exclusively on oracle-level card data. The ETL downloads `oracle-cards.json` (~27k unique cards) and produces `columns.json` (~34k face rows). All queryable fields — name, type, mana cost, color, legality — live at the card/face level.

Players also want to search by printing-level attributes: which set a card was printed in, its rarity, whether a foil variant exists, what frame it uses, and what it costs. These properties vary per printing. A single oracle card can appear in 1–100+ printings across different sets, each with different characteristics.

Scryfall's `default_cards` bulk file contains one entry per English-language printing (~80–90k entries). Each entry includes a `finishes` array listing the available finish variants (nonfoil, foil, etched) and a `prices` object with per-finish USD prices.

## Data Source

The `default_cards` bulk type from Scryfall's `/bulk-data` API. This is the same API endpoint already used for `oracle_cards` (Spec 001).

| Bulk type | Entries | Raw size | Contents |
|---|---|---|---|
| `oracle_cards` | ~27k | ~160 MB | One entry per unique oracle text (current) |
| `default_cards` | ~80–90k | ~350 MB | One entry per English-language printing |

The model is designed so that `all_cards` (~300k+ entries, all languages/variants) can replace `default_cards` in the future without schema changes.

## One-Finish-Per-Row Model

Each Scryfall printing entry is exploded into N rows, one per element in its `finishes` array:

| Scryfall entry | `finishes` | Rows emitted |
|---|---|---|
| Lightning Bolt (MH2) | `["nonfoil", "foil"]` | 2 (one nonfoil, one foil) |
| Clear (USG) | `["nonfoil"]` | 1 (nonfoil only; pre-foil era) |
| Kroxa, Titan of Death's Hunger (SLD, etched) | `["nonfoil", "foil", "etched"]` | 3 |

This yields ~120–150k total printing rows.

Each row has exactly one finish and exactly one price. This makes queries like `is:foil price<1` natural — both conditions match the same row with no cross-column logic.

The `scryfall_id` is duplicated across finish rows of the same physical printing. This is intentional — the duplication is adjacent in the columnar layout and compresses to near-zero overhead under gzip.

## Oracle-to-Printing Mapping

Each Scryfall printing entry has an `oracle_id` field that identifies the oracle card it belongs to. During processing:

1. Build a `Map<string, number>` from `oracle_id` → canonical face index by iterating the existing `columns.json` (or the oracle cards used to build it).
2. For each printing in `default-cards.json`, look up its `oracle_id` to get the `canonical_face_ref`.
3. Printings whose `oracle_id` doesn't appear in the map (tokens, art series, etc. that were filtered during face-level processing) are dropped.

## Columnar Schema: `PrintingColumnarData`

All arrays are aligned by printing-row index. Defined in `shared/src/data.ts`.

### Join key

- `canonical_face_ref: number[]` — uint32. Maps each printing row to the canonical face index in the face-domain `ColumnarData`. This is the primary join key between the two domains.

### String columns

- `scryfall_ids: string[]` — Scryfall UUID for the printing. Used to construct image URLs. Shared across finish variants of the same physical printing.
- `collector_numbers: string[]` — Collector number string (e.g., `"1"`, `"1a"`, `"★3"`).

### Dictionary-encoded columns

- `set_indices: number[]` — uint16 index into `set_lookup`. There are ~700+ sets, exceeding uint8 range.
- `set_lookup: { code: string, name: string }[]` — Dictionary mapping set index to set code and display name.

### Bitmask columns

- `rarity: number[]` — uint8 bitmask. `common=1, uncommon=2, rare=4, mythic=8`. One bit set per row. Bitmask encoding (rather than enum) enables fast bitwise evaluation for comparisons like `r>=rare` (test against `rare | mythic = 0b1100`).
- `printing_flags: number[]` — uint8 bitmask for boolean printing attributes:

| Bit | Flag |
|---|---|
| 0 | `full_art` |
| 1 | `textless` |
| 2 | `reprint` |
| 3 | `promo` |
| 4 | `digital` |
| 5 | `highres_image` |
| 6 | `borderless` (from `border_color === "borderless"`) |
| 7 | `extended_art` (from `frame_effects` containing `"extendedart"`) |

- `frame: number[]` — uint8 bitmask. `1993=1, 1997=2, 2003=4, 2015=8, future=16`. One bit set per row.

### Enum column

- `finish: number[]` — uint8 enum. `0=nonfoil, 1=foil, 2=etched`. One value per row (not a bitmask — each row has exactly one finish).

### Price column

- `price_usd: number[]` — uint32 in cents. `0` = no price data available (sentinel; no real card costs $0.00). Maximum representable: $42,949,672.95.

### Date column

- `released_at: number[]` — uint32 in YYYYMMDD format (e.g., `20210618` for 2021-06-18). `0` = unknown. Enables numeric comparison for `date:` and `year:` queries. Year is derivable as `Math.floor(released_at / 10000)`.

### Set lookup

The `set_lookup` table also carries `released_at` per set (the release date of the first printing seen), enabling the `date>setcode` proxy syntax where a set code resolves to its release date at query time.

## ETL Pipeline Changes

### Download (`etl/src/scryfall.ts`, `etl/src/download.ts`, `etl/src/index.ts`)

The `fetchMetadata()` function is generalized to accept a bulk type parameter (currently hardcoded to `"oracle_cards"`). A new `fetchDefaultCardsMetadata()` (or a parameterized call) finds the `default_cards` entry.

The `download` command fetches both files sequentially:

1. `oracle-cards.json` (existing)
2. `default-cards.json` (new, ~350 MB)

Both downloads respect the existing freshness check (compare `updated_at` against local metadata). The `--force` flag bypasses both checks.

### Paths (`etl/src/paths.ts`)

New constants:

```typescript
export const DEFAULT_CARDS_PATH = path.join(RAW_DIR, "default-cards.json");
export const PRINTINGS_PATH = path.join(DIST_DIR, "printings.json");
```

### Processing (`etl/src/process-printings.ts`)

New module. The `processPrintings()` function:

1. Reads `data/raw/default-cards.json` and `data/dist/columns.json`.
2. Builds the `oracle_id → canonical_face_ref` map from `columns.json` (iterating `scryfall_ids` and using the existing oracle card data to extract `oracle_id`s — or reading oracle-cards.json directly for the mapping).
3. Iterates each printing entry in `default-cards.json`:
   a. Looks up `canonical_face_ref` via `oracle_id`. Drops unmapped printings.
   b. Encodes `rarity`, `printing_flags`, `frame` as bitmasks.
   c. Dictionary-encodes the set via a `SetEncoder` (analogous to `DictEncoder` but for uint16 indices).
   d. For each finish in `entry.finishes`:
      - Emits a row with `finish` set to the enum value.
      - Picks the price from `entry.prices.usd` (nonfoil), `entry.prices.usd_foil` (foil), or `entry.prices.usd_etched` (etched). Parses the string to cents; null/missing → 0.
4. Writes `data/dist/printings.json`.

Rows are emitted in iteration order (grouped by printing, finishes adjacent), which maximizes gzip compression of the duplicated `scryfall_ids` column.

### CLI (`etl/src/index.ts`)

The `process` command calls both `processCards()` (existing) and `processPrintings()` (new). Both can run sequentially since `processPrintings()` depends on `columns.json` output.

## Output

| Path | Contents | Approximate size (gzip) |
|---|---|---|
| `data/dist/printings.json` | `PrintingColumnarData` | ~1.5–2 MB |

## Loading Sequence

`printings.json` follows the Spec 045 supplemental-file pattern:

1. The worker fetches and processes `columns.json` as today. Search becomes available.
2. The main thread (or worker) fetches `printings.json` after receiving `ready`.
3. Printing-domain queries are unavailable until `printings.json` arrives. The evaluator returns a "printings loading" status (or treats printing conditions as matching nothing) until the data is ready.

## Acceptance Criteria

1. `npm run etl -- download` fetches both `oracle-cards.json` and `default-cards.json`, respecting freshness checks for each.
2. `npm run etl -- process` produces `data/dist/printings.json` alongside `columns.json` and `thumb-hashes.json`.
3. Every printing row's `canonical_face_ref` points to a valid canonical face index in `columns.json`.
4. Each Scryfall printing with N finishes produces exactly N rows in the output.
5. `price_usd` correctly maps to `prices.usd` for nonfoil rows, `prices.usd_foil` for foil rows, and `prices.usd_etched` for etched rows.
6. Printings for filtered layouts (tokens, art series, etc.) are absent from the output.
7. `set_lookup` contains an entry for every set referenced by `set_indices`.
8. The `--verbose` flag prints processing statistics (total printings, total rows after finish explosion, dropped printings, set count).
