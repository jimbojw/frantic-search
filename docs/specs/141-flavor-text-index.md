# Spec 141: Flavor Text Inverted Index (ETL + Data Model)

**Status:** Implemented 

**GitHub Issue:** [#138](https://github.com/jimbojw/frantic-search/issues/138)

**Depends on:** Spec 046 (Printing Data Model), Spec 092 (Tag Data Model — strided inverted index pattern)

## Goal

Add flavor text to the printing data model using a **strided inverted index** of `(face_index_within_card, printing_row_index)` pairs. The face index is the position within the card's `card_faces` array (0 for front, 1 for back, etc.; single-face cards use 0). Flavor text is both face- and printing-aware: a DFC with two printings has four slots for flavor text (two faces × two printings). The strided format correctly models Scryfall's per-face flavor text and disambiguates which face has which text (e.g. DFC front vs back).

## Rationale

- **Sparse:** Many printings have no flavor text — omit entirely.
- **Deduplicated:** Many printings share identical flavor text (e.g. Divination's many printings with `“The key to unlocking this puzzle is within you.”\n—Doriel, mentor of Mistral Isle`) — one key, multiple `(face, printing)` pairs.
- **Face-aware:** Multiface cards have flavor text per face in Scryfall. A strided `(face_index_within_card, printing)` representation preserves which face has which text. Using face index within the card (0, 1, …) — not canonical face index — correctly distinguishes DFC front vs back, which share the same canonical face.
- **Matches existing patterns:** `atags.json` uses strided `(face, illustration_id_index)` pairs (Spec 092). Flavor uses `(face, printing_row_index)` — no load-time resolution needed since we store printing rows directly.
- **Separate file:** Like `atags.json` and `otags.json`, the flavor index is a supplemental file loaded progressively. Most users never query flavor text; deferring load keeps `printings.json` smaller and speeds initial printing-ready.
- **Raw keys (no ETL normalization):** Store flavor text exactly as Scryfall provides it. A later spec can build forward structures (face, printing) → flavor text for the card detail page. Search normalization happens at load time (worker builds normalized index from raw keys).

## Domain

- **Face + printing:** Flavor text is per-face, per-printing in Scryfall. Each face of a printing may have zero or one flavor text string. A DFC with two printings has four independent slots. The evaluator produces a printing-domain buffer (set `buf[printing_row_index] = 1` for each matching pair), then promotes to face at AND/OR boundaries.

## Data Source

Scryfall's `default_cards` bulk file (same as Spec 046). Per the [Scryfall Card Objects API](https://scryfall.com/docs/api/cards):

- **Card level:** `flavor_text` — "The flavor text, if any." (single-face cards)
- **Card face:** `flavor_text` — "The flavor text printed on this face, if any." (multiface cards)

**Extraction by layout:**

| Layout type | Source of `flavor_text` | Face index |
|-------------|-------------------------|------------|
| Single-face | `card.flavor_text` | 0 |
| Multiface (including reversible_card) | `card_faces[i].flavor_text` | `i` |

## Spec Updates

| Spec | Update |
|------|--------|
| 003 | Document `flavor-index.json` in ETL output |
| 024 | Add `flavor-ready` status (worker posts when flavor-index.json loaded) |
| 045 | Add `flavor-index.json` to supplemental files list (same pattern as atags.json) |

## Technical Details

### 1. ETL: Build strided inverted index

**Module:** `etl/src/process-printings.ts`

**Extraction:** During the existing process-printings loop, for each default-card printing:

1. Determine faces to process:
   - Single-face: one "face" (index 0) with `card.flavor_text`
   - Multiface: iterate `card_faces[i]`; face index = `i` (0 for front, 1 for back, etc.)
2. For each face with non-empty `flavor_text`:
   - Use the face index within the card (`i` when iterating `card_faces`, or 0 for single-face)
   - Use the raw flavor text as the key (no normalization — preserve Scryfall's exact string for display use)
   - For each finish row emitted for this printing, append `(face_index_within_card, printing_row_index)` to the strided array for that key
3. If a face has no flavor text, omit (no entry for that face)

**Rationale for face index within card:** From a printing row we can derive `canonical_face_ref` (the card's primary face), but not which of the card's faces (0 vs 1) has the attribute. For DFCs, front and back share the same canonical face, so `(canonical_face, printing)` would collapse — we must use face index within the card to preserve the front/back distinction.

**Output:** Write to `data/dist/flavor-index.json` — a separate file, not bundled in `printings.json`. Same `process` command; `processPrintings()` writes both `printings.json` and `flavor-index.json`. With `--verbose`, log flavor index stats (unique keys, total pairs, file size).

### 2. Data model

**Module:** `shared/src/data.ts`

Add type (same pattern as `OracleTagData`, `IllustrationTagData` in Spec 092):

```ts
/**
 * Flavor text inverted index: raw flavor text → strided (face, printing) pairs.
 * Even indices = face index within the card (0=front, 1=back, etc.);
 * odd indices = printing_row_index. Loaded from flavor-index.json. Keys are raw
 * (no ETL normalization): preserves display formatting. Worker builds normalized
 * search index at load time. Spec 141.
 */
export type FlavorTagData = Record<string, number[]>;
```

The evaluator receives flavor data via `TagDataRef.flavor` — the worker builds a normalized index (lowercase, trim, collapse whitespace) from raw keys at load time for case-insensitive substring/regex search. Raw data in the file enables a future spec to build (face, printing) → flavor text for card detail display.

### 3. Output file and wire format

**Path:** `data/dist/flavor-index.json`

Pairs are `(face_index_within_card, printing_row_index)` — no resolution needed:

```json
{
  "Draw a card.": [0, 12, 0, 13, 1, 204],
  "City air is a constant drizzle of private thoughts.": [0, 6789],
  ...
}
```

- Keys: raw flavor text from Scryfall (no ETL normalization; preserves display formatting)
- Values: strided arrays — `[face0, printing0, face1, printing1, ...]`. Even indices = face index within the card (0=front, 1=back); odd indices = printing row index.
- Pairs sorted by `(face, printing)` for gzip efficiency
- Faces/printings with no flavor text: not present in any value array
- Same flavor text across faces/printings: one key, one strided array of pairs

### 4. App data loading (Spec 045 pattern)

1. **Vite plugin:** Extend `serveData` to serve and copy `flavor-index.json` (dev middleware + `closeBundle` build hook + `__FLAVOR_INDEX_FILENAME__` define).
2. **Worker:** Fetch `flavor-index.json` after `printings.json` is ready (flavor depends on printing row indices). Build normalized search index from raw keys: lowercase, trim, collapse internal whitespace to single space. When multiple raw keys normalize to the same string, merge their strided arrays (deduplicate pairs, sort by `(face, printing)`). Store normalized index in `tagDataRef.flavor` for evaluator. Post `flavor-ready` when loaded. Raw data remains available for a future spec to build (face, printing) → flavor text for card detail display.
3. **PWA cache:** Add runtime cache rule for `flavor-index.[hash].json`.

**Loading sequence:** Same as `atags.json` — flavor loads after printings. Users who never search flavor avoid the ~1 MB transfer; `flavor:` queries become available when the file arrives.

**Graceful degradation:** When `processPrintings` skips (e.g. missing `default-cards.json`), no `flavor-index.json` is produced. When the file is missing or fetch fails, the worker leaves `tagDataRef.flavor` null; the evaluator flags `flavorUnavailable` for `flavor:` queries (Spec 142).

### 5. Comparison with atags.json

| Aspect | atags.json (Spec 092) | flavor-index.json |
|-------|------------------------|-------------------|
| File | Separate supplemental file | Separate supplemental file |
| Pair format | `(face, illustration_id_index)` — face semantics differ | `(face_index_within_card, printing_row_index)` — 0=front, 1=back |
| Resolution | Worker resolves illustration→printing at load time | None — pairs are already printing-domain |
| Load after | printings.json | printings.json |
| Rationale | One illustration → many printing rows; avoid fan-out in wire format | One (face, printing) → one printing row; direct storage |

## Size estimate

- Unique flavor texts: ~15–20k (many printings share text)
- Total (face, printing) pairs: ~80–120k (more than printing-only due to per-face granularity; DFCs contribute 2× per printing)
- Raw: ~8 bytes per pair × 120k ≈ 960 KB; gzip compresses sorted strided arrays well
- Separate file: `data/dist/flavor-index.json` (~960 KB raw; ~300–400 KB gzipped)

## Paths

**Module:** `etl/src/paths.ts`

```ts
export const FLAVOR_INDEX_PATH = path.join(DIST_DIR, "flavor-index.json");
```

## Files to Touch

| File | Changes |
|------|---------|
| `etl/src/process-printings.ts` | Add `flavor_text` to DefaultCard/DefaultCardFace; build `flavor_text_index` during emit loop; write to `FLAVOR_INDEX_PATH` |
| `etl/src/paths.ts` | Add `FLAVOR_INDEX_PATH` |
| `shared/src/data.ts` | Add `FlavorTagData` type |
| `app/src/vite-env.d.ts` | Add `__FLAVOR_INDEX_FILENAME__` define (if used) |
| Vite `serveData` plugin | Serve and copy flavor-index.json; add `__FLAVOR_INDEX_FILENAME__` |
| `app/src/worker.ts` | Fetch flavor-index.json after printings; store in tagDataRef; post `flavor-ready` |
| `app/src/sw.ts` | Add PWA cache rule for flavor-index.[hash].json |
| `docs/specs/003-etl-process.md` | Document flavor-index.json in ETL output |
| `docs/specs/045-split-data-files.md` | Add flavor-index.json to supplemental files list |

## Follow-up

See **Spec 142** for query engine support (`flavor:`, `ft:`). The evaluator iterates strided pairs and sets `buf[printing_row_index] = 1`; promotion to face is unchanged. Flavor data is passed via `tagDataRef.flavor` (normalized index built at load). A future spec can build (face, printing) → raw flavor text from this file for the card detail page. A future `lore:` field (Scryfall undocumented) will provide an all-four search (flavor, oracle, name, type).

## Acceptance Criteria

1. `npm run etl -- process` produces `data/dist/flavor-index.json` alongside `printings.json`
2. Keys are raw flavor text from Scryfall (no ETL normalization)
3. Values are strided `(face, printing)` pairs; even indices = face index within card (0=front, 1=back), odd = printing row
4. Pairs are sorted by `(face, printing)` for compression
5. Faces/printings with no flavor text are omitted
6. Faces/printings that share identical flavor text share one key
7. Vite plugin serves and copies flavor-index.json in dev and build
8. Worker fetches flavor-index.json after printings, stores in tagDataRef, posts `flavor-ready`
9. PWA cache includes flavor-index.json
10. When `default-cards.json` is missing, `processPrintings` skips and no flavor-index.json is produced
11. `--verbose` logs flavor index stats (unique keys, total pairs, file size)
12. Typecheck and existing tests pass

## Implementation Notes

- 2026-03-22: Corrected face semantics. The original spec used canonical face index (from `oracle_id` → `columns.canonical_face`), but for DFCs front and back share the same canonical face, causing `(7, p)` pairs to collapse. Switched to **face index within the card** (0=front, 1=back), which correctly disambiguates which face has which flavor text. ETL now uses the loop index `i` when iterating `card_faces`; no `oracleIdToFaceMap` needed.
