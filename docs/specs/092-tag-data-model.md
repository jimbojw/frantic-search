# Spec 092: Tag Data Model and Processing

**Status:** Implemented

**Depends on:** Spec 091 (ETL Tag Download), Spec 003 (ETL Process), Spec 046 (Printing Data Model), ADR-017 (Dual-Domain Query Evaluation), Issue #99 (Epic: otag/atag Support)

## Goal

Transform the raw Scryfall tag JSON files (Spec 091) into two compact data files — `otags.json` (oracle tags) and `atags.json` (illustration tags). Oracle tags map tag labels to sorted canonical face indices (face domain). Illustration tags map tag labels to sorted `(canonical_face_index, illustration_id_index)` pairs — an illustration-level representation that the worker resolves to printing row indices at load time. Both files are supplemental data loaded progressively by the WebWorker to enable `otag:` and `atag:` queries.

## Background

Spec 091 downloads two raw files into `data/raw/`:

| File | Tags | ID references | Join key |
|---|---|---|---|
| `oracle-tags.json` | ~5,100 | ~500K | `oracle_id` (face-domain) |
| `illustration-tags.json` | ~11,500 | ~1.2M | `illustration_id` (printing-domain) |

These raw files are large (~20 MB and ~46 MB) because they store full Scryfall UUIDs. The processing step replaces UUIDs with integer indices, dramatically reducing size.

### Evaluation domains

Oracle tags and illustration tags evaluate in **different domains**, matching the dual-domain architecture (ADR-017):

- **Oracle tags → face domain.** An oracle tag like `otag:ramp` categorizes a card's mechanics. The tag maps to `oracle_id`, which joins directly to canonical face indices. The evaluator produces a `Uint8Array(faceCount)` — same as `color:`, `type:`, `name:`.

- **Illustration tags → printing domain.** An illustration tag like `atag:foot` categorizes a specific artwork. The same card can have multiple artworks across printings, and only some may match the tag. Printing-domain evaluation preserves this granularity.

  Example: `!"Meek Attack"` has 3 printings with distinct art (visible via `unique:art`). Only 2 of those artworks are tagged `foot`. With face-domain evaluation, `!"Meek Attack" unique:art atag:foot` would incorrectly show all 3 art variants. With printing-domain evaluation, it correctly shows only the 2 matching variants.

  The evaluator produces a `Uint8Array(printingCount)` and promotes to face domain at AND/OR boundaries — same as `set:`, `is:foil`, `r:mythic`. This is the natural domain for illustration data and composes correctly with `unique:art` and other printing-level modifiers.

### Two files, not one

Oracle tags and illustration tags are separate files rather than a combined `tags.json`:

1. **Different domains.** `otags.json` contains face indices; `atags.json` contains illustration-level data that the worker expands to printing indices. Combining them would require the consumer to know which section is which domain — cleaner to separate at the file level.
2. **Progressive loading.** `otags.json` (~1.1 MB gzipped) loads quickly and enables `otag:` queries. `atags.json` (~3.0 MB gzipped) loads after printings. Users searching by card mechanics (`otag:ramp`) don't wait for illustration data.
3. **Independent failure modes.** If illustration tag processing fails (e.g., `default-cards.json` missing), oracle tags still work.

## Output Format

### `otags.json` — Oracle tags (face domain)

```json
{
  "ramp": [12, 45, 89, 102, ...],
  "removal": [3, 17, 201, ...],
  ...
}
```

A flat JSON object mapping tag labels to sorted arrays of **canonical face indices**. Each integer is a valid index into the face-domain columnar arrays (`columns.json`).

### `atags.json` — Illustration tags (illustration-level, resolved to printing domain at load time)

```json
{
  "chair": [500, 0, 500, 2, 1023, 0, 4501, 0, ...],
  "foot": [88, 1, 302, 0, ...],
  ...
}
```

A flat JSON object mapping tag labels to **strided arrays** of `(canonical_face_index, illustration_id_index)` pairs. Elements at even indices are canonical face indices; elements at odd indices are the corresponding `illustration_id_index` values. Each pair uniquely identifies an artwork: the card (via its canonical face index in `columns.json`) and which of that card's illustrations (via the per-card `illustration_id_index` from `printings.json`, where 0 is the canonical printing's art, 1 is the next distinct artwork, etc.).

The strided layout avoids allocating millions of short-lived 2-element arrays during `JSON.parse()`. With ~1.15M pairs across all tags, the pairs-of-arrays format would create ~1.15M tiny JS objects — significant GC pressure, especially on mobile. The strided format produces one flat array per tag (~11.5K allocations total). It also saves ~20% raw size by eliminating inner bracket overhead.

This is an **illustration-level** representation, not a printing-level one. The wire format avoids the costly illustration-to-printing fan-out (one artwork → many printings across sets and finishes). At load time, the worker resolves each pair to the corresponding printing row indices using the `PrintingIndex` it has already built — the same `illustration_id_index` column that powers `unique:art` deduplication (Spec 046). The resolved result is a printing-domain `Uint8Array(printingCount)` for use by the evaluator.

### Common design properties

- **Inverted index (tag → indices), not forward index.** The evaluator's query pattern is "given a tag label, which entries match?" An inverted index supports this in O(1) lookup + O(k) buffer fill.
- **Sorted arrays.** Sorted integers compress well under gzip and enable efficient buffer population.
- **Compact JSON.** Written with minimal whitespace to reduce raw size.
- **Tags with zero resolved indices are omitted.** Tags referencing only cards/illustrations absent from our dataset are dropped.

### Size estimates (as of March 2026)

| File | Tags | References | Raw | Gzipped |
|---|---|---|---|---|
| `otags.json` | 5,103 | ~500K face indices | 3.0 MB | 1.1 MB |
| `atags.json` | 11,462 | ~1.15M illustration pairs (strided) | 9.2 MB | 2.9 MB |

The illustration-level representation avoids the costly fan-out from illustrations to printing rows. Shipping pre-expanded printing row indices would produce ~3.9M references (25 MB raw / 9.4 MB gzipped) — over 3× larger. Since the worker already has the `illustration_id_index` column in `PrintingIndex`, resolving pairs to printing rows at load time is cheap.

Both files are comparable in size to existing supplemental files (`thumb-hashes.json` ~1 MB, `printings.json` ~1.5–2 MB, `columns.json` ~3.8 MB). Total tag data transfer: ~4.0 MB gzipped.

## Processing Pipeline

### Inputs

| File | Used by | Read for |
|---|---|---|
| `data/dist/columns.json` | Oracle tags, Illustration tags | `oracle_ids` and `canonical_face` → build `oracle_id → face_index` map |
| `data/raw/oracle-tags.json` | Oracle tags | Tag definitions (Spec 091) |
| `data/raw/default-cards.json` | Illustration tags | `illustration_id`, `id`, and `oracle_id` per printing → build `illustration_id → (face_index, illust_idx)` map |
| `data/dist/printings.json` | Illustration tags | `scryfall_ids`, `canonical_face_ref`, and `illustration_id_index` → build `scryfall_id → (face_index, illust_idx)` lookup |
| `data/raw/illustration-tags.json` | Illustration tags | Tag definitions (Spec 091) |

### Oracle tag processing

```
1. Read columns.json
   Build: oracle_id → canonical_face_index
   (first occurrence per oracle_id)

2. For each tag in oracle-tags.json:
   a. Resolve oracle_ids → face indices (skip unmatched)
   b. Deduplicate and sort
   c. Store: label → sorted int[]

3. Write data/dist/otags.json
```

Straightforward single-hop join. Oracle IDs not found in `columns.json` are skipped (digital-only or otherwise absent cards).

### Illustration tag processing

```
1. Read default-cards.json and printings.json
   Build: illustration_id → (canonical_face_index, illustration_id_index)

   For each entry in default-cards.json:
     a. Extract illustration_id (top-level, or card_faces[0]
        for multi-face layouts)
     b. Extract scryfall_id (entry.id)
     c. Look up scryfall_id in printings.json to get the
        canonical_face_ref and illustration_id_index for that
        printing row
     d. Store: illustration_id → (canonical_face_ref, illustration_id_index)

2. For each tag in illustration-tags.json:
   a. Resolve illustration_ids → (face, illust_idx) pairs
   b. Deduplicate and sort (by face index, then illust_idx)
   c. Flatten into strided array: [face, idx, face, idx, ...]
   d. Store: label → strided int[]

3. Write data/dist/atags.json
```

Two-hop join: `illustration_id` → `scryfall_id` (from `default-cards.json`) → `(canonical_face_ref, illustration_id_index)` (from `printings.json`). The output contains illustration-level pairs, not printing row indices — the worker expands these to printing rows at load time using the same `illustration_id_index` column already present in `PrintingIndex`.

A small number of illustration IDs (~385) map to multiple oracle cards (shared art across functional reprints). The join handles this naturally: a single `illustration_id` can produce multiple `(face, illust_idx)` pairs.

Illustration IDs not found in `default-cards.json` (~900, ~1.8% of tagged IDs) are skipped. These are typically digital-only or non-English printings absent from the `default_cards` bulk file.

### Why `default-cards.json` is required for illustration tags

`oracle-cards.json` only carries the default printing's `illustration_id`, covering just 68% of tagged illustration IDs. `default-cards.json` reaches 98% coverage, rescuing 855 tags that would otherwise have zero matches and improving coverage for 8,474 more.

## Output Files

| Path | Domain | Contents | Approx. size (gzip) |
|---|---|---|---|
| `data/dist/otags.json` | Face | `Record<string, number[]>` — label → sorted face indices | ~1.1 MB |
| `data/dist/atags.json` | Printing (via illustration) | `Record<string, number[]>` — label → strided `face, illust_idx, face, illust_idx, ...` | ~2.9 MB |

## CLI Integration

The `process` command in `etl/src/index.ts` calls `processTags()` after `processCards()` and `processPrintings()`:

```typescript
cli
  .command("process", "Extract searchable fields into columnar JSON files")
  .option("--verbose", "Print detailed progress", { default: false })
  .action((options: { verbose: boolean }) => {
    try {
      processCards(options.verbose);
      processPrintings(options.verbose);
      processTags(options.verbose);
    } catch (err) {
      // ...
    }
  });
```

Ordering matters: `processTags()` depends on `columns.json` (from `processCards`) and `printings.json` (from `processPrintings`).

### Graceful degradation

| Missing input | Behavior |
|---|---|
| `oracle-tags.json` | Skip oracle tags; no `otags.json` produced. Illustration tags processed if available. |
| `illustration-tags.json` | Skip illustration tags; no `atags.json` produced. Oracle tags processed if available. |
| Both tag files | Skip entirely; neither file produced. |
| `default-cards.json` | Skip illustration tags (log warning); oracle tags still processed. |
| `printings.json` | Skip illustration tags (log warning); oracle tags still processed. |
| `columns.json` | Fatal error (same as existing `processPrintings` behavior). |

## File Organization

```
etl/src/
├── process-tags.ts           New: tag processing logic (processTags function)
├── index.ts                  Updated: call processTags() in process command
└── paths.ts                  Updated: OTAGS_PATH, ATAGS_PATH constants
```

## Paths

New constants in `etl/src/paths.ts`:

```typescript
export const OTAGS_PATH = path.join(DIST_DIR, "otags.json");
export const ATAGS_PATH = path.join(DIST_DIR, "atags.json");
```

## Type Definitions

New types in `shared/src/data.ts`:

```typescript
/** Oracle tag inverted index: tag label → sorted canonical face indices. */
export type OracleTagData = Record<string, number[]>;

/**
 * Illustration tag inverted index: tag label → strided (face, illust_idx) pairs.
 *
 * Each array has even length. Elements at even indices are canonical face indices;
 * elements at odd indices are the corresponding illustration_id_index values.
 * The worker resolves these to printing row indices at load time via PrintingIndex.
 */
export type IllustrationTagData = Record<string, number[]>;
```

## App Data Loading

Both files follow the supplemental-file pattern (Spec 045):

1. The Vite `serveData` plugin is extended to serve and copy both files (dev middleware + `closeBundle` build hook + `__OTAGS_FILENAME__` / `__ATAGS_FILENAME__` defines).
2. The worker fetches `otags.json` after `columns.json` is ready — same pattern as `fetchPrintings()`. Given its smaller size, it should arrive quickly.
3. The worker fetches `atags.json` after `printings.json` is ready (since illustration tags require `PrintingIndex` for resolution).
4. On load, the worker posts `otags-ready` and/or `atags-ready` status messages. Tag queries become available incrementally.
5. PWA runtime cache rules added for both files.

Oracle tag data is evaluation-only and stays in the worker. Illustration tag data is also evaluation-only. The tag label lists (~200 KB for oracle, ~300 KB for illustration) can be posted to the main thread in the ready messages for autocomplete (future spec).

### Worker-side resolution of illustration tags

When `atags.json` arrives, the worker resolves each tag's strided pairs to printing row indices using the `PrintingIndex` already in memory. For each tag's array, iterate in stride-2 steps (`for (let i = 0; i < arr.length; i += 2)`) to extract `(face, illust_idx)` pairs. The `PrintingIndex` has `canonical_face_ref` and `illustration_id_index` columns, which together identify every printing row's artwork. The resolution builds a `Map<string, Uint32Array>` mapping each tag label to a sorted array of printing row indices — the same structure the evaluator expects for printing-domain leaves.

This is a one-time O(n) pass per tag at load time, not per-query. The cost is proportional to the number of printing rows (~168K), which is well within the budget for a background worker operation. Once resolved, the strided wire format is discarded.

### Loading sequence

```
Worker                                    Main Thread
──────                                    ───────────
1. Fetch columns.json
2. Build CardIndex + NodeCache
3. Post ready                         ──► Enable search
4. Fetch otags.json (parallel w/ 5-6)
5. Fetch printings.json
6. Fetch thumb-hashes.json            ──► (main thread fetches)
7. otags.json arrives
   Store oracle tag index
   Post otags-ready                   ──► otag: queries available
8. printings.json arrives
   Build PrintingIndex
   Post printings-ready               ──► Printing queries available
9. Fetch atags.json
   (starts after printings loaded,
    since evaluation needs PrintingIndex)
10. atags.json arrives
    Store illustration tag index
    Post atags-ready                  ──► atag: queries available
```

## Acceptance Criteria

1. `npm run etl -- process` produces `data/dist/otags.json` and `data/dist/atags.json` alongside existing output files (when raw tag files are present).
2. `otags.json` maps tag labels to sorted arrays of canonical face indices. Every index is valid in `columns.json`.
3. `atags.json` maps tag labels to strided arrays of `(canonical_face_index, illustration_id_index)` pairs. Arrays have even length. Every `canonical_face_index` (even positions) is valid in `columns.json`. Every `illustration_id_index` (odd positions) is a valid per-card illustration index as defined by `printings.json`.
4. Oracle tags are resolved via `oracle_id` join against `columns.json`.
5. Illustration tags are resolved via `illustration_id → scryfall_id → (canonical_face_ref, illustration_id_index)` join, using `default-cards.json` and `printings.json`.
6. Strided pairs in `atags.json` are sorted by `canonical_face_index`, then by `illustration_id_index`.
7. Tags with zero resolved pairs/indices are omitted from their respective output files.
8. If raw tag files are missing, the command logs a warning and degrades gracefully.
9. If `default-cards.json` or `printings.json` is missing, illustration tags are skipped but oracle tags are still processed.
10. `--verbose` prints processing statistics: tag counts, reference counts, dropped tags, output sizes.
11. The Vite plugin serves both tag files in dev and copies them (hashed + stable names) to `app/dist/` on build.
12. The worker resolves `atags.json` pairs to printing row indices at load time using `PrintingIndex`, producing a `Map<string, Uint32Array>` for the evaluator.

## Implementation Notes

- 2026-03-07: Implemented per spec. ETL `processTags()` in `etl/src/process-tags.ts`; Vite plugin and worker loading; PWA cache rules. Tag data is stored in worker and passed to `NodeCache` via `tagDataRef`; evaluator support for `otag:` and `atag:` implemented in Spec 093.
