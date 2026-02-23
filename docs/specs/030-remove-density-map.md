# Spec 030: Remove Density Map

**Status:** Implemented

**Supersedes:** Spec 028 (Density Map Lens Orderings), Spec 029 (Density Map)

## Goal

Remove the Density Map feature — the seven-canvas visualization, the Gilbert curve, the pre-computed lens orderings in the ETL pipeline, and all supporting types and constants — from the codebase.

## Rationale

The Density Map (Specs 028–029) rendered every card in the dataset as a 2×2 pixel block on seven canvases, each sorted by a different "lens" (alphabetical, chronology, mana curve, complexity, color identity, type map, color × type). The idea was that query results would produce recognizable spatial patterns — footprints — that gave the user macro-level insight into the shape of their results.

After testing several variants, the most useful lenses turned out to be the two that combined Gray-coded type identity with Gray-coded color identity. For queries matching a moderate to large number of cards, these did produce meaningful footprints. However, for queries with sparse results — which are common — the visualizations looked like screens with dead pixels: bright spots against broken darkness, offering little actionable insight.

The more lasting takeaway was that type distribution is a valuable axis for understanding a result set. That insight led directly to the Card Type histogram added in Spec 025, which surfaces the same information in a more compact, interactive, and universally useful form. With the third histogram in place, the density map no longer carries its weight relative to the screen real estate and data cost (~1.2 MB of lens arrays in `columns.json`) it demands.

## Scope of Removal

### Files deleted entirely

| File | Purpose |
|---|---|
| `app/src/DensityMap.tsx` | Density map component (7 canvases, color toggle, rendering pipeline) |
| `app/src/gilbert.ts` | Gilbert curve implementation |
| `app/src/gilbert.test.ts` | Gilbert curve tests |
| `etl/src/lenses.ts` | `CardLensEntry`, `LensOrderings`, `computeLensOrderings()` |
| `etl/src/lenses.test.ts` | Lens ordering tests |

### Surgical removals

| File | What is removed |
|---|---|
| `shared/src/data.ts` | Seven `lens_*` fields from `ColumnarData` |
| `shared/src/worker-protocol.ts` | Seven `lens_*` fields from `DisplayColumns` |
| `shared/src/bits.ts` | `CardType` enum and `TYPE_FROM_WORD` lookup (only used by lens ETL) |
| `shared/src/index.ts` | Re-exports of `CardType` and `TYPE_FROM_WORD` |
| `app/src/worker.ts` | Seven `lens_*` lines in `extractDisplayColumns()` |
| `app/src/App.tsx` | `DensityMap` import, `mapExpanded`/`toggleMap` signal, `<DensityMap>` render |
| `etl/src/process.ts` | `encodeTypes()` function, `CardLensEntry` collection loop, lens array assignment |

### Data impact

Removing the seven lens arrays eliminates ~1.2 MB from `columns.json` (~15% of the file).
