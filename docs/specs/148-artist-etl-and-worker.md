# Spec 148: Artist Index — ETL and Worker (Illustration Domain)

**Status:** Implemented 

**GitHub Issue:** [#128](https://github.com/jimbojw/frantic-search/issues/128)

**Depends on:** Spec 046 (Printing Data Model)

## Goal

Add an artist index to support eventual `a:` and `artist:` queries (e.g. `a:proce`). The design uses a **strided inverted index** of `(face_index_within_card, printing_row_index)` pairs, matching the flavor index (Spec 141). The face index is the position within the card's `card_faces` array (0 for front, 1 for back, etc.; single-face cards use 0). No illustration IDs or intermediate structures are persisted. This spec covers ETL extraction, storage format, and worker load. Evaluator, autocomplete, and reference docs are implemented in Spec 149.

## Data Model

### Strided inverted index

```ts
Record<string, number[]>  // artist name → strided (face, printing) pairs
```

- **Artist → (face, printing) pairs:** One-to-many. One artist maps to all `(face_index_within_card, printing_row_index)` pairs where that face displays their art.
- **Per-face:** ETL iterates all faces of default-cards. Split cards (e.g. Life // Death) contribute distinct face indices to each artist — `a:Scott Murphy` matches face 0 (Life); `a:Anthony S. Waters` matches face 1 (Death). The strided format preserves *which* face was illustrated by whom, enabling card-detail display and future face-scoped queries.
- **Strided layout:** Same as `flavor-index.json` (Spec 141): even indices = face index within the card (0=front, 1=back); odd indices = printing row index. Pairs sorted by `(face, printing)` for gzip efficiency. Using face index within the card — not canonical face index — correctly distinguishes DFC front vs back, which share the same canonical face.

### Query path

```
user query (e.g. a:proce)
  → substring match → artist names
  → for each matching artist: get strided (face, printing) pairs
  → iterate pairs, set buf[printing_row_index] = 1
  → union → printing-domain result buffer
```

## Rationale

- **Per-face indexing:** ETL iterates all faces; split cards with different artists per half are correctly indexed. `a:Scott Murphy` finds Life's art; `a:Anthony S. Waters` finds Death's.
- **Face-preserving:** Strided format disambiguates which face was done by which artist. Enables future card-detail "artist per face" display and face-scoped artist queries without re-ETL.
- **Matches flavor pattern:** Same strided layout as `flavor-index.json` (Spec 141). Consistent implementation and evaluator handling.
- **Direct lookup:** Worker does no resolution — data is pre-materialized. Evaluator iterates strided pairs (same as flavor).
- **Composes with `unique:art`:** Printing buffer → existing dedup yields one row per distinct artwork.

## Scope

| In scope                                               | Out of scope                                      |
|--------------------------------------------------------|---------------------------------------------------|
| ETL: artist→(face, printing) pairs (materialized)      | Evaluator: `a:` / `artist:` field handling        |
| Storage: `artist-index.json` (single mapping)          | Parser: `a:` / `artist:` field alias              |
| Worker: load, build normalized index, store; CLI loads the same `artist-index.json` next to `columns.json` (Spec 069) | Reference docs, syntax help, compliance tests    |
| Key normalization for substring search                  | Watermark (`wm:`), flavor text (`ft:`), `new:art` |

## Data Source

Scryfall's `default_cards` bulk file (Spec 001). Per the [Scryfall Card Objects API](https://scryfall.com/docs/api/cards):

- **Card level:** `artist`, `illustration_id`
- **Card face:** `artist`, `illustration_id` (multiface cards)

| Layout type              | Source of `artist`       | Source of `illustration_id`   |
|--------------------------|--------------------------|-------------------------------|
| Single-face              | `card.artist`            | `card.illustration_id`        |
| Multiface (split, transform, reversible, modal_dfc, etc.) | `card_faces[i].artist` | `card_faces[i].illustration_id` |

**All faces** are iterated — not just the front face. This enables correct artist matching for split cards with different artists per half.

**Face index:** Use the face's position within the card (`i` when iterating `card_faces`, or 0 for single-face). No `oracle_id` or `columns.json` lookup needed — the loop index is the face index within the card.

## Storage Format

### Output file: `artist-index.json`

Path: `data/dist/artist-index.json`

Same strided layout as `flavor-index.json` (Spec 141): `[face0, printing0, face1, printing1, ...]`.

```json
{
  "Vincent Proce": [0, 12, 0, 13, 0, 204, 0, 205],
  "Scott Murphy": [0, 103, 0, 104],
  "Anthony S. Waters": [1, 103, 1, 104]
}
```

- **Keys:** Raw artist names from Scryfall (no ETL normalization).
- **Values:** Strided arrays — even indices = face index within the card (0=front, 1=back); odd indices = printing row index. Pairs sorted by `(face, printing)` for gzip efficiency.
- **Split cards:** Same printing can appear in multiple artists (different face indices). E.g. Life // Death: Scott Murphy → face 0 (Life), Anthony S. Waters → face 1 (Death); both point to the same printing rows.

### Type definition

**Module:** `shared/src/data.ts`

```ts
/**
 * Artist index: raw artist name → strided (face, printing) pairs.
 * Same strided layout as FlavorTagData (Spec 141): even indices = face_index_within_card (0=front, 1=back),
 * odd indices = printing_row_index. Materialized at ETL; worker does direct lookup. Spec 148.
 */
export type ArtistIndexData = Record<string, number[]>;
```

## ETL Processing

**Module:** `etl/src/process-printings.ts` (inline with flavor index — same single pass over default-cards)

Artist index is built during the existing card loop in `processPrintings()`, alongside the flavor index (Spec 141). Same iteration, same `printingRowStart`..`totalEntries` range per card. No `oracleIdToFaceMap` needed — use face index within the card directly. No separate module or second pass.

### Build artist → strided (face, printing) pairs (in process-printings loop)

1. Add `artist?: string` to `DefaultCardFace` and `DefaultCard` (card-level for single-face).
2. Initialize `artist_to_pairs: Record<string, Array<[number, number]>>` before the card loop.
3. Determine faces to process (same pattern as flavor):
   - Single-face: one "face" (index 0) with `card.artist`
   - Multiface: iterate `card_faces[i]`; face index = `i` (0 for front, 1 for back, etc.)
4. For each face with non-empty `artist`:
   - Use face index within the card (`i` when iterating `card_faces`, or 0 for single-face).
   - For each printing row in `printingRowStart`..`totalEntries`, append `(face_index_within_card, printing_row_index)` to `artist_to_pairs[artist]`.
5. After the loop (alongside flavor index write): for each artist key, dedupe pairs, sort by `(face, printing)`, convert to strided `number[]`, write `artist-index.json`.

### Key normalization (ETL)

Store **raw artist names** from Scryfall. Worker builds a normalized index (lowercase, trim, collapse whitespace) for case-insensitive substring search. Artists with empty or missing names are omitted.

## Worker Resolution

### Load sequence

1. Fetch `artist-index.json` after `printings.json` is ready.
2. Parse into `ArtistIndexData` (direct `Record<string, number[]>` with strided values).
3. Build normalized index (same pattern as flavor): for each raw key, add normalized form (lowercase, trim, collapse whitespace) → strided array. When multiple raw keys normalize to same string, merge their strided arrays (deduplicate pairs, sort by `(face, printing)`).
4. Store in `tagDataRef.artist`: `Record<string, number[]>` (normalized key → strided pairs). Same structure as `TagDataRef.flavor`. Post `artist-ready`. This spec omits `tagLabels` from the status payload; autocomplete is planned and a follow-up spec will extend `artist-ready` to include `tagLabels` (and `artistTagLabels` in resolution context) for categorical completion.

### Query resolution (evaluator, future spec)

For `a:proce`:
1. Substring match: find all normalized artist keys where `key.includes("proce")`.
2. For each matching artist: get strided array; iterate pairs (even index = face, odd index = printing).
3. Set `buf[printing_row_index] = 1` for each pair (same as flavor).
4. Union all matching artists.
5. Promote to face at AND/OR boundaries (existing logic).

## Paths

**Module:** `etl/src/paths.ts`

```ts
export const ARTIST_INDEX_PATH = path.join(DIST_DIR, "artist-index.json");
```

## CLI Integration

No changes to `etl/src/index.ts` — artist index is produced by `processPrintings()` alongside `printings.json` and `flavor-index.json`.

### Graceful degradation

Same as `processPrintings` — when `default-cards.json` or `columns.json` is missing, printing processing is skipped and no artist index is produced.

## App Data Loading

1. **Vite plugin:** Serve and copy `artist-index.json`. Add to preload list (alongside otags, atags, flavor).
2. **Worker:** Fetch `artist-index.json` in parallel with atags and flavor (all depend on printings). Parse; build normalized index; store in `tagDataRef.artist`; post `artist-ready`.
3. **PWA cache:** Add rule for `artist-index.[hash].json`.

## Size estimate

- ~2k artists.
- ~300k total (face, printing) pairs (artist × avg printings per artist; split cards contribute multiple faces per printing).
- Strided format: 2 numbers per pair (face + printing) — same as flavor. Sorted pairs compress well with gzip.
- **Estimate:** ~2.5–3 MB raw, ~500–700 KB gzipped.

### Comparison with flavor-index.json

| Aspect | flavor-index.json (Spec 141) | artist-index.json |
|--------|------------------------------|-------------------|
| Pair format | `(face_index_within_card, printing_row_index)` — 0=front, 1=back | `(face_index_within_card, printing_row_index)` — 0=front, 1=back |
| Keys | Raw flavor text | Raw artist name |
| Key count | ~15–20k | ~2k |
| Total pairs | ~80–120k | ~300k |
| Resolution | None — direct | None — direct |

Artist has more pairs because flavor text is often shared across many printings; artist names vary per printing and split cards contribute multiple faces per printing.

## File Changes Summary

| File                      | Changes                                                                 |
|---------------------------|-------------------------------------------------------------------------|
| `etl/src/process-printings.ts` | Add `artist` to DefaultCard/DefaultCardFace; build artist index during card loop (same pattern as flavor index); write artist-index.json after loop |
| `etl/src/paths.ts`        | Add `ARTIST_INDEX_PATH`                                                 |
| `shared/src/data.ts`      | Add `ArtistIndexData` type (`Record<string, number[]>`)                 |
| `shared/src/search/evaluator.ts` | Add `artist: Record<string, number[]> \| null` to `TagDataRef` (strided values, same shape as flavor) |
| `shared/src/worker-protocol.ts` | Add `artist-ready` to `FromWorker` status union                        |
| Vite `serveData` plugin   | Serve and copy artist-index.json; add to preload list                  |
| `app/src/worker.ts`       | Fetch artist-index.json after printings (parallel with atags/flavor); build normalized index; store in tagDataRef; post `artist-ready` |
| `app/src/worker-search.ts` | Add `artist` to `tagData` passed to evaluator                         |
| `app/src/App.tsx`         | Add handler for `artist-ready` status (mirror `flavor-ready`)          |
| `app/src/sw.ts`           | Add PWA cache rule for `artist-index.[hash].json`                       |
| `docs/specs/003-etl-process.md` | Document artist-index.json in output table                         |
| `docs/specs/045-split-data-files.md` | Add artist-index.json to supplemental files                    |

## Spec Updates

| Spec | Update                                    |
|------|-------------------------------------------|
| 003  | Document `artist-index.json` in ETL output table |
| 045  | Add `artist-index.json` to supplemental files |

Note: `artist-ready` status is added to `FromWorker` in `shared/src/worker-protocol.ts`. No separate spec documents worker status types.

## Follow-up

- **Evaluator spec:** Add `a:` / `artist:` field; substring match over normalized artist keys; iterate strided pairs (same as flavor), set `buf[printing_row_index] = 1`; produce printing-domain buffer; promote to face at boundaries. Add `artistUnavailable` (analogous to `flavorUnavailable`) when artist index not yet loaded.
- **Artist autocomplete:** A follow-up spec (evaluator or soon after) will add autocomplete for `a:` queries. That will extend `artist-ready` to include `tagLabels` (normalized artist names) and add `artistTagLabels` to `_getResolutionContext` for categorical completion, matching the atags/otags pattern.
- **Related Scryfall fields:** `wm:` (watermark), `ft:` (flavor text), `new:art`, `artists>1` — separate specs.

## Acceptance Criteria

1. `npm run etl -- process` produces `data/dist/artist-index.json` when `processPrintings()` runs (default-cards and columns present).
2. Schema is `Record<string, number[]>` — raw artist name → strided `(face, printing)` pairs. Even indices = face index within card (0=front, 1=back); odd = printing row. No illustration_ids or intermediate structures.
3. ETL iterates all faces of default-cards; split cards (e.g. Life // Death) have both artists indexed with distinct face indices to the shared printing rows.
4. Pairs are sorted by `(face, printing)` for compression.
5. Vite plugin serves and copies artist-index.json.
6. Worker fetches, parses, builds normalized index (strided values), stores in tagDataRef; posts `artist-ready`.
7. PWA cache includes artist-index.json.
8. When `processPrintings` is skipped (missing default-cards or columns), no artist-index.json is produced.
9. `--verbose` logs stats: artist count, total pairs, file size (e.g. `Artist index: 2047 artists, 298432 pairs, 2.1 MB`).
10. `npm run typecheck` passes.
