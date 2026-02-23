# Spec 028: Density Map Lens Orderings

**Status:** Implemented 

**Depends on:** Spec 003 (ETL Process), Spec 024 (Index-Based Result Protocol)

## Goal

Pre-compute four **lens orderings** in the ETL pipeline so the Density Map visualization (Spec 029) can map every card onto a 2D canvas without any client-side sorting. Each ordering is an array of canonical face indices sorted by a specific attribute. The client selects a lens and iterates the corresponding array — it never needs to know the underlying sort key.

## Background

The planned Density Map (Spec 029) maps every unique card in the dataset onto a 2D canvas via a space-filling curve. The user selects a **Lens** that determines the 1D sort order before the curve mapping. Four baseline lenses are planned:

| Lens | Sort key | Purpose |
|---|---|---|
| Alphabetical | Card name | Browse the full card pool A–Z; also the universal tiebreaker for other lenses |
| Chronology | Release date | Reveals patterns in color distribution and power across MTG's history |
| Mana Curve | Converted mana cost | Groups cards into distinct MV territories |
| Complexity | Mechanical text weight | Highlights vanilla cards versus mechanically complex ones |

Each lens is a **permutation array**: a `number[]` of canonical face indices, one entry per unique card, arranged so that `lens[0]` is the card that belongs at position 0 on the curve, `lens[1]` at position 1, and so on. The density map iterates the array positionally and writes pixels — no sorting, no key extraction, no date parsing.

### Why pre-compute in the ETL?

- **Zero client cost.** No sorting on the main thread, no mana cost parsing, no date handling. The orderings are ready to iterate.
- **Clean boundary.** The ETL is the data transformation layer. Release dates, CMC values, and text weights are intermediate concerns that the client never needs to see.
- **Adding a lens is an ETL-only change.** The client code is generic — it picks an ordering array by name.

## Design

### Unit of ordering: cards, not faces

Each pixel in the density map represents a **card**, not a card face. Multi-face cards (e.g., Bonecrusher Giant) occupy a single pixel. The ordering arrays therefore contain **canonical face indices** — the face-row index of a card's primary face, which serves as the card's identity in the existing data model.

The length of each lens array equals the number of unique cards (~30,000), which is less than the total face row count (~34,000). This is a structural difference from the other `ColumnarData` fields, which are all face-indexed.

### Data flow

```
ETL (process.ts)
  ├── Main face-row loop (existing)
  │     Collects per-card metadata: canonical face, name, release date, CMC,
  │     mechanical text weight
  ├── Lens computation (new, after main loop)
  │     Sorts cards by each key (tiebreaker: name) → four permutation arrays
  └── Writes to columns.json

Worker (worker.ts)
  ├── Loads columns.json → ColumnarData
  └── Extracts lens arrays into DisplayColumns → posts to main thread

Main Thread
  └── Density Map component reads lens arrays from DisplayColumns
```

### Scryfall fields used

Two new fields from the Scryfall card object, used only during ETL processing:

| Scryfall field | Type | Used by lens | Notes |
|---|---|---|---|
| `released_at` | `string` (ISO 8601 date) | Chronology | Available on every oracle card |
| `cmc` | `number` | Mana Curve | Top-level card field; no parsing needed |

Name and oracle text / mana cost / type line are derived from existing fields.

### Sort keys

#### Alphabetical

Sorted by the card's combined name (`card.name` in Scryfall, `combined_names` in ColumnarData), case-insensitive. This lens doubles as the **universal tiebreaker** for all other lenses — when two cards share the same primary sort key, they are sub-sorted alphabetically by name.

#### Chronology

Sorted by Scryfall's `released_at` date string. The ETL may encode this however it likes internally (e.g., days since epoch, raw string comparison); the spec only requires that the output array is in chronological order, earliest first. A missing or unparseable date sorts to the beginning. Tiebreaker: name.

#### Mana Curve

Sorted by Scryfall's `cmc` field (a number, e.g., `3` or `4.5`). A missing value defaults to `0`. Tiebreaker: name.

#### Complexity

A synthetic metric measuring the **mechanical weight** of a card. The sort key is the total byte length of the following text fields, summed across all faces of the card:

- `mana_cost` (e.g., `{1}{B/P}{B/P}` = 16 bytes vs `{1}{B}{B}` = 10 bytes)
- `type_line` (e.g., `Legendary Creature — Human Cleric` > `Creature — Bear`)
- `oracle_text` (the dominant contributor for most cards)

This composite metric captures several dimensions of complexity in a single, weight-free sum:

| Property | How it contributes |
|---|---|
| Long rules text | Dominates the sum — complex mechanics need more words |
| Double-faced / split cards | Two full sets of fields → roughly double the weight |
| Hybrid / Phyrexian mana | `{B/P}` is 5 bytes vs `{B}` is 3 bytes |
| Complex type lines | Supertypes, multiple creature types add length |
| Vanilla creatures | Short type line, empty oracle text → minimal weight |

A card with no mechanical text at all (e.g., a vanilla creature with a simple cost) has a low complexity score. Name is excluded because it reflects flavor, not mechanics. Power, toughness, loyalty, and defense are excluded because their string representations are too short to meaningfully differentiate. Tiebreaker: name.

## Changes

### 1. ETL: Card interface (`etl/src/process.ts`)

Add `released_at` and `cmc` to the `Card` interface:

```typescript
interface Card {
  // …existing fields…
  released_at?: string
  cmc?: number
}
```

These fields are read during the main loop but are not stored in per-face columns. They exist only to compute the lens orderings.

### 2. ETL: Collect per-card lens data

During the main card loop, after emitting face rows for each non-filtered card, record the card's lens data:

```typescript
interface CardLensEntry {
  canonicalFace: number
  name: string
  releasedAt: string
  cmc: number
  complexity: number
}
```

`name` is the card's combined name (lowercased for sorting). `complexity` is the sum of byte lengths of `mana_cost`, `type_line`, and `oracle_text` across all faces of the card.

### 3. ETL: Compute lens orderings (after main loop)

After the face-row loop completes, sort the collected entries by each key with name as the tiebreaker, and extract the `canonicalFace` values:

```typescript
const cmp = new Intl.Collator('en', { sensitivity: 'base' })

const byName = [...lensEntries]
  .sort((a, b) => cmp.compare(a.name, b.name))
  .map(e => e.canonicalFace)

const byChronology = [...lensEntries]
  .sort((a, b) => /* released_at ascending */ || cmp.compare(a.name, b.name))
  .map(e => e.canonicalFace)

const byManaCurve = [...lensEntries]
  .sort((a, b) => a.cmc - b.cmc || cmp.compare(a.name, b.name))
  .map(e => e.canonicalFace)

const byComplexity = [...lensEntries]
  .sort((a, b) => a.complexity - b.complexity || cmp.compare(a.name, b.name))
  .map(e => e.canonicalFace)
```

Assign these to the `ColumnarData` object before writing `columns.json`.

### 4. ColumnarData: New fields (`shared/src/data.ts`)

```typescript
export interface ColumnarData {
  // …existing face-indexed fields…

  lens_name: number[]
  lens_chronology: number[]
  lens_mana_curve: number[]
  lens_complexity: number[]
}
```

Unlike all other fields in `ColumnarData`, these are **card-indexed** — their length equals the number of unique cards, not the number of face rows. The `lens_` prefix signals this distinction.

### 5. DisplayColumns: New fields (`shared/src/worker-protocol.ts`)

```typescript
export type DisplayColumns = {
  // …existing fields…
  lens_name: number[]
  lens_chronology: number[]
  lens_mana_curve: number[]
  lens_complexity: number[]
}
```

### 6. Worker: Extract lens columns (`app/src/worker.ts`)

Add the four fields to `extractDisplayColumns`:

```typescript
function extractDisplayColumns(data: ColumnarData): DisplayColumns {
  return {
    // …existing fields…
    lens_name: data.lens_name,
    lens_chronology: data.lens_chronology,
    lens_mana_curve: data.lens_mana_curve,
    lens_complexity: data.lens_complexity,
  }
}
```

No signature change — the lens arrays come from `ColumnarData`, not `CardIndex`.

### 7. ColumnarData initialization (`etl/src/process.ts`)

Add the four fields to the `data` object initialization with empty arrays. They are populated after the main loop.

## Wire size impact

Each lens array contains ~30,000 entries. Each entry is a canonical face index (0–34,000), requiring 4–5 digits in JSON.

| Field | Entries | Per-entry (JSON) | Total |
|---|---|---|---|
| `lens_name` | ~30,000 | ~6 bytes | ~180 KB |
| `lens_chronology` | ~30,000 | ~6 bytes | ~180 KB |
| `lens_mana_curve` | ~30,000 | ~6 bytes | ~180 KB |
| `lens_complexity` | ~30,000 | ~6 bytes | ~180 KB |

Combined: ~720 KB added to `columns.json` (~9% increase over the current ~8 MB). The `DisplayColumns` init transfer grows by the same amount — small relative to the existing ~6 MB payload.

## Acceptance Criteria

1. Running `npm run etl -- process` produces a `columns.json` that includes `lens_name`, `lens_chronology`, `lens_mana_curve`, and `lens_complexity` arrays.
2. Each lens array contains exactly one entry per unique card (i.e., its length equals the number of distinct `canonical_face` values).
3. Every entry in a lens array is a valid canonical face index (i.e., `canonical_face[entry] === entry`).
4. `lens_name` is sorted alphabetically by card name (case-insensitive).
5. `lens_chronology` is sorted by release date (earliest first), with name as tiebreaker.
6. `lens_mana_curve` is sorted by CMC (lowest first), with name as tiebreaker.
7. `lens_complexity` is sorted by total byte length of `mana_cost` + `type_line` + `oracle_text` across all faces (lowest first), with name as tiebreaker.
8. The worker's `ready` message includes all four lens arrays in `DisplayColumns`.
9. Existing features (search, histograms, breakdown, card detail) continue to work unchanged.
