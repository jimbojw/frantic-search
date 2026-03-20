# Spec 141: Flavor Text Inverted Index (ETL + Data Model)

**Status:** Draft

**GitHub Issue:** [#138](https://github.com/jimbojw/frantic-search/issues/138)

**Depends on:** Spec 046 (Printing Data Model), Spec 092 (Tag Data Model — strided inverted index pattern)

## Goal

Add flavor text to the printing data model using a **strided inverted index** of `(canonical_face_index, printing_row_index)` pairs. Flavor text is both face- and printing-aware: a DFC with two printings has four slots for flavor text (two faces × two printings). The strided format matches `atags.json` (Spec 092) and correctly models Scryfall's per-face flavor text.

## Rationale

- **Sparse:** Many printings have no flavor text — omit entirely.
- **Deduplicated:** Many printings share identical flavor text (e.g. Divination's many printings with `“The key to unlocking this puzzle is within you.”\n—Doriel, mentor of Mistral Isle`) — one key, multiple `(face, printing)` pairs.
- **Face-aware:** Multiface cards have flavor text per face in Scryfall. A strided `(face, printing)` representation preserves this; concatenation would lose per-face granularity.
- **Matches existing patterns:** `atags.json` uses strided `(face, illustration_id_index)` pairs (Spec 092). Flavor uses `(face, printing_row_index)` — no load-time resolution needed since we store printing rows directly.

## Domain

- **Face + printing:** Flavor text is per-face, per-printing in Scryfall. Each face of a printing may have zero or one flavor text string. A DFC with two printings has four independent slots. The evaluator produces a printing-domain buffer (set `buf[printing_row_index] = 1` for each matching pair), then promotes to face at AND/OR boundaries.

## Data Source

Scryfall's `default_cards` bulk file (same as Spec 046). Per the [Scryfall Card Objects API](https://scryfall.com/docs/api/cards):

- **Card level:** `flavor_text` — "The flavor text, if any." (single-face cards)
- **Card face:** `flavor_text` — "The flavor text printed on this face, if any." (multiface cards)

For single-face cards, use `card.flavor_text` and `card.oracle_id` → canonical face index. For multiface cards, iterate `card_faces[]`; each face has `flavor_text` and `oracle_id` → canonical face index for that face.

## Spec Updates

| Spec | Update |
|------|--------|
| 046 | Add `flavor_text_index` to printings.json schema |
| 003 | Document flavor_text_index in ETL output |

## Technical Details

### 1. ETL: Build strided inverted index

**Module:** `etl/src/process-printings.ts`

**Extraction:** During the existing process-printings loop, for each default-card printing:

1. Determine faces to process:
   - Single-face: one "face" with `card.flavor_text` and `card.oracle_id` (or `card_faces[0]` if present)
   - Multiface: iterate `card_faces[]`; each face has `flavor_text` and `oracle_id`
2. For each face with non-empty `flavor_text`:
   - Resolve `oracle_id` → canonical face index. The existing `oracle_id → canonical_face_ref` map (from `buildOracleIdMap` or equivalent) must include per-face `oracle_id`s for DFCs — Scryfall puts `oracle_id` on each `card_face`. Extend the map if it currently only covers the primary face.
   - Normalize: trim, collapse internal whitespace to single space, lowercase
   - For each finish row emitted for this printing, append `(canonical_face_index, printing_row_index)` to the strided array for that key
3. If a face has no flavor text, omit (no entry for that face)

**Key normalization:** Lowercase at write time so substring/regex lookup is case-insensitive. Collapse runs of whitespace to a single space. Trim leading/trailing whitespace.

**Output:** `flavor_text_index: Record<string, number[]>` — normalized flavor text → strided `[face0, printing0, face1, printing1, ...]`. Add to the same `data` object written to `printings.json`.

### 2. Data model

**Module:** `shared/src/data.ts`

Add to `PrintingColumnarData`:

```ts
/**
 * Flavor text inverted index: normalized text → strided (face, printing) pairs.
 * Same strided layout as atags.json (Spec 092): even indices = canonical_face_index,
 * odd indices = printing_row_index. Spec 141. Faces/printings with no flavor text omitted.
 */
flavor_text_index?: Record<string, number[]>;
```

**Module:** `shared/src/search/printing-index.ts`

- Accept `flavor_text_index` from `PrintingColumnarData`
- Expose raw `Record<string, number[]>` for evaluator. Evaluator iterates pairs (stride 2), sets `buf[printing_row_index] = 1` for each match. No load-time resolution (unlike atags) — pairs are already printing-domain.

### 3. Wire format

Same strided layout as `atags.json` (Spec 092 § "atags.json — Illustration tags"), but pairs are `(canonical_face_index, printing_row_index)` — no resolution needed:

```json
{
  "canonical_face_ref": [...],
  "scryfall_ids": [...],
  ...
  "flavor_text_index": {
    "draw a card.": [45, 12, 45, 13, 89, 204],
    "city air is a constant drizzle of private thoughts.": [123, 6789],
    ...
  }
}
```

- Keys: lowercase, trimmed, collapsed-whitespace flavor text
- Values: strided arrays — `[face0, printing0, face1, printing1, ...]`. Even indices = canonical face index; odd indices = printing row index.
- Pairs sorted by `(face, printing)` for gzip efficiency
- Faces/printings with no flavor text: not present in any value array
- Same flavor text across faces/printings: one key, one strided array of pairs

### 4. Comparison with atags.json

| Aspect | atags.json (Spec 092) | flavor_text_index |
|-------|------------------------|-------------------|
| Pair format | `(face, illustration_id_index)` | `(face, printing_row_index)` |
| Resolution | Worker resolves illustration→printing at load time | None — pairs are already printing-domain |
| Rationale | One illustration → many printing rows; avoid fan-out in wire format | One (face, printing) → one printing row; direct storage |

## Size estimate

- Unique flavor texts: ~15–20k (many printings share text)
- Total (face, printing) pairs: ~80–120k (more than printing-only due to per-face granularity; DFCs contribute 2× per printing)
- Raw: ~8 bytes per pair × 120k ≈ 960 KB; gzip compresses sorted strided arrays well
- Bundled with printings.json (no separate file)

## Files to Touch

| File | Changes |
|------|---------|
| `etl/src/process-printings.ts` | Add `flavor_text` to DefaultCard/DefaultCardFace; build `flavor_text_index` during emit loop (per-face iteration, strided pairs) |
| `shared/src/data.ts` | Add `flavor_text_index` to `PrintingColumnarData` |
| `shared/src/search/printing-index.ts` | Accept and hold `flavor_text_index` for evaluator |
| `docs/specs/046-printing-data-model.md` | Document `flavor_text_index` in schema |
| `docs/specs/003-etl-process.md` | Document flavor_text_index in ETL output |

## Follow-up

See **Spec 142** for query engine support (`flavor:`, `ft:`). The evaluator iterates strided pairs and sets `buf[printing_row_index] = 1`; promotion to face is unchanged. A future `lore:` field (Scryfall undocumented) will provide an all-four search (flavor, oracle, name, type).

## Acceptance Criteria

1. `npm run etl -- process` produces `printings.json` with `flavor_text_index`
2. Keys are normalized (lowercase, trimmed, collapsed whitespace)
3. Values are strided `(face, printing)` pairs; even indices = canonical face, odd = printing row
4. Pairs are sorted by `(face, printing)` for compression
5. Faces/printings with no flavor text are omitted
6. Faces/printings that share identical flavor text share one key
7. `PrintingIndex` accepts and exposes the index for evaluator use
8. Typecheck and existing tests pass
