# Spec 029: Density Map

**Status:** Draft

**Depends on:** Spec 028 (Density Map Lens Orderings)

## Goal

Add a **Density Map** component that renders the entire Magic: The Gathering card pool (~30,000 cards) simultaneously on a 2D canvas. Each card is a single pixel. Matching cards light up on every keystroke, giving the user instant macro-level feedback on the shape and distribution of their query results.

## Background

The STATS panel (Spec 025) currently contains two horizontal bar charts — Color Identity and Mana Value — that summarize the result set as aggregated counts. The density map complements these by showing the **individual card level**: every card in the dataset is visible at all times, and the user's query literally illuminates the matching subset.

The visualization is a **Dense Pixel Display** — a technique for rendering large datasets without aggregation. Each card maps to one pixel. A space-filling curve preserves 1D locality in 2D, so cards that are adjacent in the selected sort order form contiguous clusters on the canvas rather than disconnected horizontal stripes.

### Precedents

| System | Technique | Difference |
|---|---|---|
| Ben Shneiderman's treemaps | Dense pixel displays for hierarchical data | Frantic Search uses a flat list with a space-filling curve |
| VisDB (Keim 1994) | Dense pixel displays for database queries | Similar concept; Frantic Search adds curve mapping and lens selection |
| Scryfall | No equivalent | Text-only result list |

## Design

### Placement: Standalone MAP box

The density map is a **standalone component** rendered as its own box in the main content area, between the STATS panel and the RESULTS list. It is **not** a tab inside STATS.

The MAP box is visible as soon as the worker posts the `ready` message — even on the landing page before the user has typed a query. This lets users explore the full card pool immediately. The STATS and RESULTS boxes retain their existing conditional rendering (only shown when a query has results).

```
Landing page (no query):

  ┌─ TERMS / Input / MATCHES ─┐
  │                            │
  └────────────────────────────┘
  ┌─ MAP ──────────────────────┐
  │  ┌──────────────────────┐  │
  │  │   ~174 × ~174 canvas │  │
  │  └──────────────────────┘  │
  │  (Alphabetical) (Chrono…)  │
  │  ☐ Color by identity       │
  └────────────────────────────┘

With query:

  ┌─ TERMS / Input / MATCHES ─┐
  │                            │
  └────────────────────────────┘
  ┌─ STATS ────────────────────┐
  │  Color Identity │ Mana Val │
  └────────────────────────────┘
  ┌─ MAP ──────────────────────┐
  │  ┌──────────────────────┐  │
  │  │   ~174 × ~174 canvas │  │
  │  └──────────────────────┘  │
  │  (Alphabetical) (Chrono…)  │
  │  ☐ Color by identity       │
  └────────────────────────────┘
  ┌─ RESULTS ──────────────────┐
  │  Card list…                │
  └────────────────────────────┘
```

The STATS panel (Spec 025) and RESULTS list are **unchanged** — no tab interface, no new props.

### Canvas

A single `<canvas>` element whose resolution is **determined by the data**. The canvas is a square with side length `ceil(sqrt(N))`, where `N` is the number of unique cards in the dataset (the length of any lens array from Spec 028). With ~30,000 cards, this produces a ~174×174 canvas — 30,276 total positions, of which only ~276 are empty (>99% fill rate).

The canvas is rendered at this native resolution and scaled up via CSS to fill the available panel width, preserving the square aspect ratio. The CSS property `image-rendering: pixelated` disables bilinear interpolation, so each logical pixel renders as a crisp block at any display size.

```css
canvas {
  width: 100%;
  aspect-ratio: 1;
  image-rendering: pixelated;
  background: black;
}
```

The canvas resolution adapts automatically if the card pool grows. No hardcoded dimension.

### Space-filling curve: Gilbert

A **Gilbert curve** maps the linear positions `0..side*side-1` to `(x, y)` coordinates on the square grid. Unlike a Hilbert curve (which requires power-of-2 dimensions), the Gilbert curve generalizes to **arbitrary rectangles**, allowing the canvas to be sized exactly to fit the data with near-zero waste.

The Gilbert curve preserves spatial locality: adjacent positions in the 1D sequence are adjacent in 2D (sharing an edge), so cards near each other in the lens ordering form contiguous clusters on the canvas. This property is comparable to a Hilbert curve for near-square rectangles.

#### Algorithm

The Gilbert curve is computed via a recursive subdivision algorithm. The rectangle is split in half along its longer axis, and each half is filled recursively with appropriate coordinate transformations to maintain continuity. The well-known reference is Jakub Červený's generalized Hilbert curve for arbitrary rectangles.

The algorithm takes `(width, height)` as input and produces an ordered sequence of `(x, y)` points — one per cell, visiting every cell exactly once. For a 174×174 grid (30,276 points), the computation takes < 5 ms.

#### Computation and caching

The curve is computed **client-side**, once at component mount time. The output is cached as two parallel `Uint16Array`s:

- `curveX[position]` — the x coordinate for position `p`
- `curveY[position]` — the y coordinate for position `p`

These are combined with the canvas width to produce the `pixelOffset` array used during rendering (see Rendering Pipeline). The curve is recomputed only if the canvas resolution changes (i.e., if the card pool size changes — effectively never during a session).

### Lenses

Below the canvas, a row of **lens chips** lets the user select the active sort ordering. Each chip corresponds to a lens array from Spec 028:

| Chip label | `DisplayColumns` field | Default? |
|---|---|---|
| Alphabetical | `lens_name` | |
| Chronology | `lens_chronology` | Yes |
| Mana Curve | `lens_mana_curve` | |
| Complexity | `lens_complexity` | |

Clicking a chip:
1. Sets it as the active lens (visually highlighted).
2. Rebuilds the pixel offset lookup (see Rendering Pipeline below).
3. Repaints the entire canvas (both RGB and alpha).

The selected lens is stored in `localStorage`.

### Color encoding

Each pixel's RGB channels are determined by the card's **color identity** bitmask (from `DisplayColumns.color_identity`).

| Identity | RGB | Hex | Notes |
|---|---|---|---|
| W (White) | 248, 225, 80 | `#F8E150` | Warm gold, high luminance |
| U (Blue) | 74, 144, 217 | `#4A90D9` | Standard blue |
| B (Black) | 140, 110, 160 | `#8C6EA0` | Desaturated violet — distinguishable from background |
| R (Red) | 217, 64, 64 | `#D94040` | Standard red |
| G (Green) | 58, 154, 90 | `#3A9A5A` | Standard green |
| C (Colorless) | 180, 176, 168 | `#B4B0A8` | Warm grey |
| M (Multicolor) | 255, 0, 200 | `#FF00C8` | Bright magenta — intentionally loud |

Mono-colored cards use the corresponding color. Multi-colored cards (2+ colors in identity) use the multicolor magenta. Colorless cards (identity bitmask = 0) use grey.

The pixel color is resolved by checking the `color_identity` value:

```
if identity === 0 → Colorless
else if popcount(identity) >= 2 → Multicolor
else → the single set bit determines W/U/B/R/G
```

### Color toggle

A checkbox labeled **"Color by identity"** sits below the lens chips. When unchecked, all cards render as white (`rgb(255, 255, 255)`) regardless of identity. This monochrome mode lets the user focus on the spatial distribution of matches without the visual noise of color. Default: checked (color on).

When toggled, the canvas repaints RGB values but does not recompute the match set or pixel offsets.

### Alpha encoding (match status)

Each pixel's alpha channel encodes whether the card matches the current query:

| State | Alpha | Visual effect |
|---|---|---|
| Match | 255 | Full brightness |
| No match | 25 | Faint ghost — preserves dataset silhouette |
| Empty cell (beyond card count) | 255 | Solid black (indistinguishable from `rgba(0,0,0,1)` background) |

The ghost grid at alpha 25 maintains context: the user always sees the full shape of the card pool, with matching cards glowing against a dim silhouette. A narrow query like `t:elf` shows bright green-tinted dots scattered across the dim whole.

**Empty query state:** When no query is active (empty input), all cards are rendered at full alpha (255). The density map shows the entire card pool at full brightness, colored by identity (or white in monochrome mode). This serves as a baseline: the user sees the "unfiltered" visualization and can explore the dataset's structure by switching lenses.

## Rendering Pipeline

The rendering is split into two phases with different frequencies.

### Phase 1: Layout (on lens switch or first mount)

Runs once per lens selection. Pre-computes a mapping from linear position to pixel byte offset in the `ImageData` buffer.

1. Read the active lens array from `DisplayColumns` (e.g., `lens_chronology`). Let `N` = lens array length (unique card count). Let `side = ceil(sqrt(N))`.
2. If not already cached for this `side`, compute the Gilbert curve for `side × side` → `curveX`, `curveY` arrays.
3. For each position `p` in `0..N-1`:
   - Look up `(x, y) = (curveX[p], curveY[p])`.
   - Compute `offset = (y * side + x) * 4` — the byte offset into `ImageData.data`.
   - Store `cardIndex = lens[p]` and `offset` in a lookup structure.
4. Pre-fill the `ImageData` buffer:
   - Fill the entire buffer with `rgba(0, 0, 0, 255)` (solid black background).
   - For each position `p` in `0..N-1`, write the RGB values based on `color_identity[cardIndex]` (or white if monochrome). Set alpha to 255 (full brightness — the empty-query default).

Store the lookup as two parallel arrays:
- `pixelCardIndex: Uint32Array[N]` — maps position → canonical face index
- `pixelOffset: Uint32Array[N]` — maps position → byte offset in `ImageData.data`

### Phase 2: Match update (on every keystroke)

Runs on every query result. Only touches the alpha channel.

1. Build a match lookup from the current `indices: Uint32Array` (the worker's result). A `Uint8Array` of length `faceCount` works well: set `matchLookup[i] = 1` for each index in `indices`, `0` otherwise.
2. Iterate positions `0..N-1`:
   ```
   for (let p = 0; p < N; p++) {
     const alpha = matchLookup[pixelCardIndex[p]] ? 255 : 25
     imageData.data[pixelOffset[p] + 3] = alpha
   }
   ```
3. Put the `ImageData` to the canvas: `ctx.putImageData(imageData, 0, 0)`.

**Empty query:** When the query is empty (`indices.length === 0` and no active search), skip the match loop and leave all alphas at 255 (the layout default).

### Performance budget

| Operation | Frequency | Cost |
|---|---|---|
| Gilbert curve (~30,276 positions) | Once at mount | < 5 ms |
| Layout (lens switch) | Per lens change | ~2 ms (iterate ~30K positions, write RGB + alpha) |
| Match update | Per keystroke | < 1 ms (iterate ~30K positions, write alpha byte) |
| `putImageData` | Per keystroke | < 0.2 ms (~174×174 = ~120 KB) |

Total per-keystroke cost: < 1.5 ms. Well within the frame budget. The smaller canvas (174×174 vs 256×256) also reduces the `putImageData` cost by ~55%.

## Data Dependencies

All data consumed by the density map is already available on the main thread after the worker posts the `ready` message. No new worker protocol changes are required.

| Data | Source | When available |
|---|---|---|
| Lens arrays | `DisplayColumns.lens_*` | Worker init (`ready` message) |
| Color identity | `DisplayColumns.color_identity` | Worker init |
| Canonical face | `DisplayColumns.canonical_face` | Worker init |
| Match indices | `indices: Uint32Array` | Per query result |
| Face count | `DisplayColumns.names.length` | Worker init |

## Component Structure

A new `DensityMap` component (`app/src/DensityMap.tsx`) encapsulates the canvas, lens chips, and color toggle. It receives props from `App.tsx`:

```typescript
{
  display: DisplayColumns
  indices: Uint32Array
  hasQuery: boolean
}
```

- `display` — the full display columns (for lens arrays, color identity, canonical face).
- `indices` — the current match set (empty `Uint32Array` when no query).
- `hasQuery` — whether the user has an active query (controls full-alpha vs ghost-grid mode).

Internal state (signals):
- `activeLens` — which lens is selected (persisted to `localStorage`).
- `colorByIdentity` — whether to use color or monochrome (persisted to `localStorage`).

## Integration with App.tsx

The `DensityMap` component is rendered directly in `App.tsx`, between the STATS panel and the RESULTS list. It is gated only on `display()` being available (worker ready), **not** on having query results:

```tsx
<Show when={display()}>
  {(d) => (
    <DensityMap display={d()} indices={indices()} hasQuery={query().trim() !== ''} />
  )}
</Show>
```

The STATS panel (`ResultsBreakdown`) and the RESULTS list retain their existing conditional rendering — they only appear when a query produces results. **No changes to `ResultsBreakdown`.**

## Gilbert Curve Implementation

The Gilbert curve for a `w × h` rectangle is computed via recursive subdivision. The algorithm splits the rectangle along its longer axis into two halves, recurses into each half with appropriate coordinate transformations, and yields `(x, y)` points in curve order. Every cell is visited exactly once.

A TypeScript implementation accepts `(width, height)` and returns the ordered point sequence. The recursion depth is `O(max(w, h))` and the total work is `O(w * h)` — one yield per cell. For a 174×174 grid this is ~30,000 recursive calls with minimal per-call work.

The output is collected into `curveX: Uint16Array` and `curveY: Uint16Array` arrays indexed by position. These are cached for the lifetime of the component (the grid dimensions do not change within a session).

## Edge Cases

### No query (landing page)

The density map renders all cards at full alpha. The user sees the full card pool colored by identity (or solid white in monochrome mode), shaped by the active lens. This is the "explore" mode — switching lenses shows different structural patterns in the dataset.

### Zero results

When a query matches nothing, all cards drop to ghost alpha (25). The canvas appears as a uniformly dim silhouette.

### Single result

One pixel at full brightness against a dim silhouette. Visually striking — the user can see exactly where one card sits in the ordering.

### Near-full canvas

With `side = ceil(sqrt(N))`, at most `side * side - N` positions are empty (at most `side - 1` cells, e.g., 276 out of 30,276). These trailing positions are rendered as solid black, indistinguishable from the background. The visual impact is negligible — less than 1% of the canvas.

### Display columns not yet loaded

If the worker has not yet posted the `ready` message (display columns are null), the density map is not rendered. The `<Show when={display()}>` guard in `App.tsx` handles this.

## Acceptance Criteria

1. The density map is rendered as a standalone box, visible on the landing page as soon as the worker is ready (before any query is entered).
2. When a query is active, the page layout is: STATS → MAP → RESULTS. The STATS and RESULTS boxes retain their existing conditional rendering.
3. The density map renders a square `<canvas>` with side length `ceil(sqrt(N))` (where N = unique card count), `image-rendering: pixelated`, scaled to fill the available width while maintaining a square aspect ratio.
4. The canvas background is solid black (`rgba(0, 0, 0, 1)`).
5. Every unique card in the dataset occupies exactly one pixel, mapped via a Gilbert curve computed for the exact canvas dimensions.
6. The Gilbert curve is computed once at mount time and cached. It is not pre-computed in the ETL pipeline.
7. Four lens chips are rendered below the canvas: Alphabetical, Chronology (default), Mana Curve, Complexity. The active lens is visually highlighted and persisted to `localStorage`.
8. Switching lenses repaints the canvas with the new ordering.
9. Pixel RGB is determined by color identity: W (gold), U (blue), B (desaturated violet), R (red), G (green), C (grey), M (bright magenta). Multicolor is 2+ colors in identity.
10. A "Color by identity" checkbox toggles between colored and monochrome (white) modes. Default: checked. Persisted to `localStorage`.
11. When a query is active, matching cards render at alpha 255; non-matching cards render at alpha 25 (ghost). When no query is active, all cards render at alpha 255.
12. The match display updates on every keystroke without perceptible delay.
13. Canvas positions beyond the card count are solid black.
14. The existing STATS panel (histograms) and RESULTS list continue to work unchanged.
15. The canvas fill rate is >99% (near-zero wasted positions).
