# Spec 003: ETL Process Command

**Status:** Implemented

## Goal

Transform the raw Scryfall `oracle-cards.json` into a compact columnar JSON file optimized for the query engine. Each row in the output represents a card face, enabling per-face evaluation that matches Scryfall's search semantics (ADR-012).

## Background

The `download` command (Spec 001) fetches `oracle-cards.json` — a JSON array of ~37,000 card objects. Each object uses Scryfall's card schema, where some fields live at the top level and others live on `card_faces` depending on the card's `layout`.

The `process` command reads this raw data and produces `columns.json`, the columnar format consumed by the query engine (Spec 002). The transformation involves three concerns: filtering non-searchable cards, expanding multi-face cards into separate rows, and encoding fields into compact columnar arrays.

## CLI Interface

```
npm run etl -- process [options]
```

| Flag        | Default | Description                     |
|-------------|---------|---------------------------------|
| `--verbose` | `false` | Print processing statistics     |

## Input

| Path                         | Contents                          |
|------------------------------|-----------------------------------|
| `data/raw/oracle-cards.json` | Scryfall Oracle Cards JSON array  |

## Layout Filtering

Cards with layouts that are not meaningful to search are dropped entirely:

| Filtered layout      | Reason                                    |
|----------------------|-------------------------------------------|
| `art_series`         | Art cards, type line is `"Card"`, no oracle text |
| `token`              | Token cards, not part of a deck           |
| `double_faced_token` | Double-faced tokens                       |
| `emblem`             | Emblem cards                              |
| `planar`             | Planechase plane cards                    |
| `scheme`             | Archenemy scheme cards                    |
| `vanguard`           | Vanguard avatar cards                     |
| `augment`            | Unstable augment cards (half-cards)       |
| `host`               | Unstable host cards (half-cards)          |

Cards that pass the layout filter are included regardless of legality status, digital-only status, or set type. See ADR-013 for the rationale.

## Face Expansion

Cards with multi-face layouts emit one row per face. The face data comes from the card's `card_faces` array:

| Multi-face layout | Faces | Example                                   |
|-------------------|-------|-------------------------------------------|
| `transform`       | 2     | Ayara, Widow of the Realm (front + back)  |
| `modal_dfc`       | 2     | Valki, God of Lies (front + back)         |
| `adventure`       | 2     | Bonecrusher Giant (creature + adventure)  |
| `split`           | 2–5   | Fire // Ice (left + right)                |
| `flip`            | 2     | Akki Lavarunner (top + bottom)            |

All other layouts (`normal`, `saga`, `class`, `mutate`, `leveler`, `meld`, `prototype`, `case`) emit a single row using top-level card fields.

### Field sourcing for multi-face rows

| Field            | Source                                              |
|------------------|-----------------------------------------------------|
| `name`           | Face (e.g., `"Ayara, Widow of the Realm"`)          |
| `mana_cost`      | Face                                                |
| `oracle_text`    | Face                                                |
| `type_line`      | Face                                                |
| `colors`         | Face, falling back to card top-level if absent       |
| `power`          | Face                                                |
| `toughness`      | Face                                                |
| `loyalty`        | Face                                                |
| `defense`        | Face                                                |
| `color_identity` | Card (duplicated across all faces of the same card) |
| `legalities`     | Card (duplicated across all faces of the same card) |

## Column Encoding

### String columns

`names`, `mana_costs`, `oracle_texts`, and `type_lines` are stored as raw `string[]` arrays. Missing values default to `""`.

### Color bitmasks

`colors` and `color_identity` are encoded as integers using the bitmask constants in `shared/src/bits.ts`:

| Color | Bit   |
|-------|-------|
| White | `1 << 0` |
| Blue  | `1 << 1` |
| Black | `1 << 2` |
| Red   | `1 << 3` |
| Green | `1 << 4` |

A white-blue card has `colors = 0b00011 = 3`.

### Legality bitmasks

Three `number[]` columns — `legalities_legal`, `legalities_banned`, `legalities_restricted` — each use the 21-bit format bitmask from `shared/src/bits.ts`. The Scryfall status `"not_legal"` is the implicit default (no bit set in any column). See Spec 002 for the full format list.

### Dictionary-encoded numeric fields

`powers`, `toughnesses`, `loyalties`, and `defenses` are dictionary-encoded: each unique string value (e.g., `"3"`, `"*"`, `"1+*"`) is assigned a `uint8` index. The per-face column stores the index; a separate lookup table stores the string-to-index mapping. Index 0 is reserved for missing values (the `""` sentinel). The dictionary is limited to 255 entries; exceeding this is a fatal error.

### ThumbHash columns

| Column              | Type       | Description                                         |
|---------------------|------------|-----------------------------------------------------|
| `art_crop_thumb_hashes` | `string[]` | Base64-encoded art crop ThumbHash, or `""` if unavailable |
| `card_thumb_hashes`     | `string[]` | Base64-encoded card image ThumbHash, or `""` if unavailable |

Both columns are aligned with `scryfall_ids`. Values are populated from the ThumbHash manifests produced by the `thumbhash` command (Spec 017). Cards not yet in a manifest get an empty string.

### Metadata columns

| Column           | Type       | Description                                         |
|------------------|------------|-----------------------------------------------------|
| `card_index`     | `number[]` | Position of this face's card in the original `oracle-cards.json` array |
| `canonical_face` | `number[]` | Face-row index of this card's primary (front) face  |

For single-face cards, both equal the row's own index. For multi-face cards, `canonical_face` points all faces to the first-emitted face row. `card_index` is shared across all faces of the same card.

## Output

| Path                                | Contents                        |
|-------------------------------------|---------------------------------|
| `data/dist/columns.json`            | Columnar JSON (`ColumnarData`)  |

The output conforms to the `ColumnarData` interface defined in `shared/src/data.ts`.

With the current Scryfall dataset (~37,000 raw cards), the process filters ~3,500 non-searchable cards, expands ~800 multi-face cards into ~1,600 face rows, and emits ~34,000 total face rows.

## Error Handling

- **Missing input file:** Log error with path, exit non-zero. The error message suggests running `npm run etl -- download` first.
- **Dictionary overflow:** Fatal error if any numeric field exceeds 255 unique values.

## Acceptance Criteria

1. Running `npm run etl -- process` after `download` produces `data/dist/columns.json`.
2. Non-searchable layouts (art_series, tokens, etc.) are absent from the output.
3. Multi-face cards (transform, modal_dfc, adventure, split, flip) produce one row per face with face-level field values.
4. Card-level fields (color_identity, legalities) are duplicated identically across all faces of the same card.
5. `canonical_face` for all faces of a multi-face card points to the same row (the first-emitted face).
6. `card_index` correctly maps back to the card's position in the original `oracle-cards.json`.
7. All output goes to `stderr` (logs); `stdout` remains clean.

## Implementation Notes

- 2026-02-20: Renamed output directory from `data/intermediate/` to `data/dist/`.
  The file is the final artifact consumed by the app and CLI, not an intermediate
  step. This aligns with the original directory layout in Spec 001.
- 2026-02-25: Added `card_thumb_hashes` column for card image ThumbHashes
  and renamed `thumb_hashes` to `art_crop_thumb_hashes` (Spec 017). The
  process command now reads two manifests and populates both
  `art_crop_thumb_hashes` (art crops) and `card_thumb_hashes` (card images).
- 2026-02-27: Split ThumbHash columns into a separate file (Spec 045). The
  process command now writes `data/dist/columns.json` (without thumb hashes)
  and `data/dist/thumb-hashes.json` (two arrays: `art_crop` and `card`).
  The `ColumnarData` type's thumb hash fields are now optional.
