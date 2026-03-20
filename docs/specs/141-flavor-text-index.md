# Spec 141: Flavor Text Inverted Index (ETL + Data Model)

**Status:** Draft

**GitHub Issue:** [#138](https://github.com/jimbojw/frantic-search/issues/138)

**Depends on:** Spec 046 (Printing Data Model), Spec 092 (Tag Data Model — inverted index pattern)

## Goal

Add flavor text to the printing data model using an **inverted index**. Printings that share the same flavor text share one entry; printings with no flavor text are omitted. This enables future query support (`flavor:`, `ft:`, and bare regex desugaring) without storing redundant strings.

## Rationale

- **Sparse:** Many printings have no flavor text — omit entirely.
- **Deduplicated:** Many printings share identical flavor text (e.g. "Draw a card.") — one key, multiple indices.
- **Matches existing patterns:** `keywords_index`, `alternate_names_index`, `otags.json` all use inverted indices. The evaluator's query pattern is "given a flavor text (exact or regex), which printings match?"

## Domain

- **Printing-domain:** Flavor text is per-printing in Scryfall. Each printing row may have zero or one flavor text string. Multiface cards may have flavor text on the card or on individual `card_faces`; we concatenate per-face flavor text (e.g. with space) so a single key represents the full text for that printing.

## Data Source

Scryfall's `default_cards` bulk file (same as Spec 046). Per the [Scryfall Card Objects API](https://scryfall.com/docs/api/cards):

- **Card level:** `flavor_text` — "The flavor text, if any."
- **Card face:** `flavor_text` — "The flavor text printed on this face, if any." (multiface cards)

For single-face cards, use `card.flavor_text`. For multiface cards, concatenate `card_faces[].flavor_text` (non-empty only) with a separator (e.g. `" "` or `"\n"`) so searches can match text on any face.

## Spec Updates

| Spec | Update |
|------|--------|
| 046 | Add `flavor_text_index` to printings.json schema |
| 003 | Document flavor_text_index in ETL output |

## Technical Details

### 1. ETL: Build inverted index

**Module:** `etl/src/process-printings.ts`

**Extraction:** During the existing process-printings loop, for each default-card printing:

1. Compute flavor text for the printing:
   - Single-face: `card.flavor_text ?? ""`
   - Multiface: concatenate `card_faces[].flavor_text` (filter empty) with `" "`
2. If the result is non-empty:
   - Normalize: trim, collapse internal whitespace to single space, lowercase
   - For each finish row emitted, append the printing row index to `flavor_text_index[normalizedKey]`
3. If empty, omit (no entry)

**Key normalization:** Lowercase at write time so exact-match lookup is case-insensitive. Collapse runs of whitespace to a single space. Trim leading/trailing whitespace.

**Output:** `flavor_text_index: Record<string, number[]>` — normalized flavor text → sorted printing row indices. Add to the same `data` object written to `printings.json`.

### 2. Data model

**Module:** `shared/src/data.ts`

Add to `PrintingColumnarData`:

```ts
/** Flavor text inverted index: normalized text → sorted printing row indices. Spec 141. Omitted printings have no flavor text. */
flavor_text_index?: Record<string, number[]>;
```

**Module:** `shared/src/search/printing-index.ts`

- Accept `flavor_text_index` from `PrintingColumnarData`
- Expose for evaluator: either hold the raw `Record<string, number[]>` or build a `Map` at construction. Evaluator needs:
  - **Exact match:** lookup key → fill buffer from indices
  - **Regex match:** iterate keys, test regex, union indices → fill buffer

### 3. Wire format

```json
{
  "canonical_face_ref": [...],
  "scryfall_ids": [...],
  ...
  "flavor_text_index": {
    "draw a card.": [12, 45, 89, 234, ...],
    "when the horizon burns, the serpent stirs.": [3, 7, 102],
    ...
  }
}
```

- Keys: lowercase, trimmed, collapsed-whitespace flavor text
- Values: sorted printing row indices
- Printings with no flavor text: not present in any value array
- Same flavor text across printings: one key, one array of indices

## Size estimate

- Unique flavor texts: ~15–20k (many printings share text)
- Total (printing index × flavor text) pairs: ~50–80k
- Raw: ~4 bytes per index × 80k ≈ 320 KB; gzip compresses sorted arrays well
- Bundled with printings.json (no separate file)

## Files to Touch

| File | Changes |
|------|---------|
| `etl/src/process-printings.ts` | Add `flavor_text` to DefaultCard/DefaultCardFace; build `flavor_text_index` during emit loop |
| `shared/src/data.ts` | Add `flavor_text_index` to `PrintingColumnarData` |
| `shared/src/search/printing-index.ts` | Accept and hold `flavor_text_index` for evaluator |
| `docs/specs/046-printing-data-model.md` | Document `flavor_text_index` in schema |
| `docs/specs/003-etl-process.md` | Document flavor_text_index in ETL output |

## Follow-up

See **Spec 142** for query engine support (`flavor:`, `ft:`). A future `lore:` field (Scryfall undocumented) will provide an all-four search (flavor, oracle, name, type).

## Acceptance Criteria

1. `npm run etl -- process` produces `printings.json` with `flavor_text_index`
2. Keys are normalized (lowercase, trimmed, collapsed whitespace)
3. Values are sorted printing row indices
4. Printings with no flavor text are omitted
5. Printings that share identical flavor text share one key
6. `PrintingIndex` accepts and exposes the index for evaluator use
7. Typecheck and existing tests pass
