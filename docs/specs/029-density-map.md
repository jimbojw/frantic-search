# Spec 029: Density Map

**Status:** Implemented 

**Depends on:** Spec 028 (Density Map Lens Orderings)

## Goal

Add a **Density Map** component that renders the entire Magic: The Gathering card pool (~30,000 cards) simultaneously on a 2D canvas. Each card is a 2×2 pixel block. Matching cards light up on every keystroke, giving the user instant macro-level feedback on the shape and distribution of their query results.

## Background

The histograms inside the RESULTS drawer (Spec 025) summarize the result set as aggregated counts across color identity, mana value, and card type. The density map complements these by showing the **individual card level**: every card in the dataset is visible at all times, and the user's query literally illuminates the matching subset.

The visualization is a **Dense Pixel Display** — a technique for rendering large datasets without aggregation. Each card maps to a 2×2 pixel block, allowing multicolor cards to display their individual color identities rather than collapsing to a single multicolor indicator. A space-filling curve preserves 1D locality in 2D, so cards that are adjacent in the selected sort order form contiguous clusters on the canvas rather than disconnected horizontal stripes.

### Precedents

| System | Technique | Difference |
|---|---|---|
| Ben Shneiderman's treemaps | Dense pixel displays for hierarchical data | Frantic Search uses a flat list with a space-filling curve |
| VisDB (Keim 1994) | Dense pixel displays for database queries | Similar concept; Frantic Search adds curve mapping and lens selection |
| Scryfall | No equivalent | Text-only result list |

## Design

### Placement: Standalone MAP box

The density map is a **standalone component** rendered as its own box in the main content area, between the search input and the RESULTS list.

The MAP box is visible as soon as the worker posts the `ready` message — even on the landing page before the user has typed a query. This lets users explore the full card pool immediately. The RESULTS box retains its existing conditional rendering (only shown when a query has results).

```
Landing page (no query):

  ┌─ TERMS / Input / MATCHES ─────────┐
  │                                    │
  └────────────────────────────────────┘
  ┌─ MAP ──────────────────────────────┐
  │  Alphabetical      Chronology      │
  │  ┌──────────┐      ┌──────────┐   │
  │  │  canvas  │      │  canvas  │   │
  │  └──────────┘      └──────────┘   │
  │  Mana Curve        Complexity      │
  │  ┌──────────┐      ┌──────────┐   │
  │  │  canvas  │      │  canvas  │   │
  │  └──────────┘      └──────────┘   │
  │  ☐ Color by identity               │
  └────────────────────────────────────┘

With query:

  ┌─ TERMS / Input / MATCHES ─────────┐
  └────────────────────────────────────┘
  ┌─ MAP ──────────────────────────────┐
  │  (canvas grid as above)            │
  └────────────────────────────────────┘
  ┌─ RESULTS ──────────────────────────┐
  │  (histograms + Oracle Text toggle) │
  │  Card list…                        │
  └────────────────────────────────────┘
```

The RESULTS box (Spec 026) is **unchanged** — the histograms (Spec 025) live inside the RESULTS drawer, not in the density map.

### 2×2 Canvas Grid

All seven lens orderings are displayed simultaneously in a grid of canvases. There is no lens selection UI — all seven visualizations are always visible. The layout is a **3-column grid** with three rows: two full rows of three canvases and a final row with one canvas centered.

| | Column 1 | Column 2 | Column 3 |
|---|---|---|---|
| Row 1 | Alphabetical | Chronology | Mana Curve |
| Row 2 | Color Map | Type Map | Color × Type |
| Row 3 | | Complexity | |

The Gilbert curve operates on a logical grid of side length `side = ceil(sqrt(N))`, where `N` is the number of unique cards. Each logical cell maps to a 2×2 pixel block, so the canvas resolution is `2*side × 2*side`. With ~33,000 cards and `side` ≈ 183, each canvas is ~366×366 pixels.

Each canvas is rendered at this native resolution and scaled up via CSS to fill half the available width, preserving the square aspect ratio. The CSS property `image-rendering: pixelated` disables bilinear interpolation.

```css
canvas {
  width: 100%;
  aspect-ratio: 1;
  image-rendering: pixelated;
  background: black;
}
```

Each canvas has a small label above it (`font-mono text-[10px]`), matching the existing chart header style. The canvas resolution adapts automatically if the card pool grows. No hardcoded dimension.

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

All seven lens orderings from Spec 028 are rendered simultaneously — one per canvas in the grid. There is no lens selection UI or `localStorage` state for active lens.

| Label | `DisplayColumns` field | Grid position |
|---|---|---|
| Alphabetical | `lens_name` | Row 1, Col 1 |
| Chronology | `lens_chronology` | Row 1, Col 2 |
| Mana Curve | `lens_mana_curve` | Row 1, Col 3 |
| Color Map | `lens_color_identity` | Row 2, Col 1 |
| Type Map | `lens_type_map` | Row 2, Col 2 |
| Color × Type | `lens_color_type` | Row 2, Col 3 |
| Complexity | `lens_complexity` | Row 3, Col 2 (centered) |

### Color encoding

Each card occupies a **2×2 pixel block**. The four sub-pixels are labeled in reading order:

```
┌────┬────┐
│ TL │ TR │
├────┼────┤
│ BL │ BR │
└────┴────┘
```

#### Single-color palette

| Identity | RGB | Hex | Notes |
|---|---|---|---|
| W (White) | 248, 225, 80 | `#F8E150` | Warm gold, high luminance |
| U (Blue) | 74, 144, 217 | `#4A90D9` | Standard blue |
| B (Black) | 140, 110, 160 | `#8C6EA0` | Desaturated violet — distinguishable from background |
| R (Red) | 217, 64, 64 | `#D94040` | Standard red |
| G (Green) | 58, 154, 90 | `#3A9A5A` | Standard green |
| C (Colorless) | 180, 176, 168 | `#B4B0A8` | Warm grey |
| M (Five-color) | 255, 0, 200 | `#FF00C8` | Bright magenta — only for all-five-color cards |

#### Block fill rules by popcount

Colors are assigned to sub-pixels in **WUBRG order** (the canonical MTG color wheel ordering). The individual colors present in the identity bitmask are extracted in bit order: W (bit 0), U (bit 1), B (bit 2), R (bit 3), G (bit 4).

| Popcount | Example | TL | TR | BL | BR |
|---|---|---|---|---|---|
| 0 (Colorless) | Artifacts, lands | C | C | C | C |
| 1 (Mono) | `ci=W` | W | W | W | W |
| 2 (Guild) | `ci=WU` | W | U | W | U |
| 3 (Shard/Wedge) | `ci=WUB` | W | U | B | C |
| 4 (Nephilim) | `ci=WUBR` | W | U | B | R |
| 5 (WUBRG) | Five-color | M | M | M | M |

- **Two colors:** Two columns. The first color (in WUBRG order) fills the left column; the second fills the right column.
- **Three colors:** Reading order for the three colors; the fourth sub-pixel (BR) uses the **colorless grey** (`#B4B0A8`) as a neutral fill.
- **Four colors:** Reading order.
- **Five colors:** All four sub-pixels use magenta. This is the only case that loses individual color information (~50–100 cards).

### Color toggle

A checkbox labeled **"Color by identity"** sits below the 2×2 grid. When unchecked, all cards render as white (`rgb(255, 255, 255)`) regardless of identity. This monochrome mode lets the user focus on the spatial distribution of matches without the visual noise of color. Default: checked (color on).

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

### Phase 1: Layout (on mount or color toggle)

Runs once at mount time for all seven canvases. The Gilbert curve is computed once and shared across all seven.

1. Let `N` = lens array length (unique card count). Let `side = ceil(sqrt(N))`. Canvas resolution is `canvasRes = 2 * side`.
2. Compute the Gilbert curve for `side × side` → `curveX`, `curveY` arrays (shared).
3. For each of the seven canvases, using its corresponding lens array:
   a. For each position `p` in `0..N-1`:
      - Look up `(x, y) = (curveX[p], curveY[p])`.
      - Compute `baseOffset = (2*y * canvasRes + 2*x) * 4` — byte offset of the TL sub-pixel in `ImageData.data`. The stride between rows is `canvasRes * 4`.
      - Store `cardIndex = lens[p]` and `baseOffset` in a lookup structure.
   b. Pre-fill the `ImageData` buffer:
      - Fill the entire buffer with `rgba(0, 0, 0, 255)` (solid black background).
      - For each position `p` in `0..N-1`, resolve the 2×2 block colors from `color_identity[cardIndex]` (see Color encoding) and write RGB+alpha to the four sub-pixel offsets. In monochrome mode, all four sub-pixels are white.

Per-canvas lookup stored as two parallel arrays:
- `pixelCardIndex: Uint32Array[N]` — maps position → canonical face index
- `pixelBaseOffset: Uint32Array[N]` — maps position → byte offset of the TL sub-pixel in `ImageData.data`

The four sub-pixel offsets for position `p` are derived from the base offset:
```
const stride = canvasRes * 4
TL = baseOffset
TR = baseOffset + 4
BL = baseOffset + stride
BR = baseOffset + stride + 4
```

### Phase 2: Match update (on every keystroke)

Runs on every query result. Only touches the alpha channel of the four sub-pixels per card.

1. Build a match lookup from the current `indices: Uint32Array` (the worker's result). A `Uint8Array` of length `faceCount` works well: set `matchLookup[i] = 1` for each index in `indices`, `0` otherwise.
2. Iterate positions `0..N-1`, writing the same alpha to all four sub-pixels:
   ```
   const stride = canvasRes * 4
   for (let p = 0; p < N; p++) {
     const alpha = matchLookup[pixelCardIndex[p]] ? 255 : 25
     const base = pixelBaseOffset[p]
     data[base + 3] = alpha
     data[base + 7] = alpha
     data[base + stride + 3] = alpha
     data[base + stride + 7] = alpha
   }
   ```
3. Put the `ImageData` to the canvas: `ctx.putImageData(imageData, 0, 0)`.

**Empty query:** When the query is empty (`indices.length === 0` and no active search), skip the match loop and leave all alphas at 255 (the layout default).

### Performance budget

| Operation | Frequency | Cost |
|---|---|---|
| Gilbert curve (~33,489 positions) | Once at mount | < 5 ms |
| Layout (all 7 canvases) | Once at mount | ~21 ms (7 × ~3 ms per canvas) |
| Match update (all 7 canvases) | Per keystroke | < 14 ms (7 × ~2 ms per canvas) |
| `putImageData` (all 7) | Per keystroke | < 5 ms (7 × ~0.7 ms for ~366×366) |

Total per-keystroke cost: < 19 ms across all seven canvases. Tight for the frame budget — profiling recommended.

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

A new `DensityMap` component (`app/src/DensityMap.tsx`) encapsulates the 2×2 canvas grid and color toggle. It receives props from `App.tsx`:

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
- `colorByIdentity` — whether to use color or monochrome (persisted to `localStorage`).

## Integration with App.tsx

The `DensityMap` component is rendered directly in `App.tsx`, between the search input and the RESULTS list. It is gated only on `display()` being available (worker ready), **not** on having query results:

```tsx
<Show when={display()}>
  {(d) => (
    <DensityMap display={d()} indices={indices()} hasQuery={query().trim() !== ''} />
  )}
</Show>
```

The RESULTS box (including the histograms inside its drawer) retains its existing conditional rendering — it only appears when a query produces results. **No changes to `ResultsBreakdown`.**

## Gilbert Curve Implementation

The Gilbert curve for a `w × h` rectangle is computed via recursive subdivision. The algorithm splits the rectangle along its longer axis into two halves, recurses into each half with appropriate coordinate transformations, and yields `(x, y)` points in curve order. Every cell is visited exactly once.

A TypeScript implementation accepts `(width, height)` and returns the ordered point sequence. The recursion depth is `O(max(w, h))` and the total work is `O(w * h)` — one yield per cell. For a 174×174 grid this is ~30,000 recursive calls with minimal per-call work.

The output is collected into `curveX: Uint16Array` and `curveY: Uint16Array` arrays indexed by position. These are cached for the lifetime of the component (the grid dimensions do not change within a session).

## Edge Cases

### No query (landing page)

All seven canvases render all cards at full alpha. The user sees the full card pool colored by identity (or solid white in monochrome mode), shaped by each lens simultaneously. This is the "explore" mode — the user can compare structural patterns across all seven orderings at a glance.

### Zero results

When a query matches nothing, all cards drop to ghost alpha (25). The canvas appears as a uniformly dim silhouette.

### Single result

One 2×2 block at full brightness against a dim silhouette. Visually striking — the user can see exactly where one card sits in the ordering.

### Near-full canvas

With `side = ceil(sqrt(N))`, at most `side * side - N` positions are empty (at most `side - 1` cells, e.g., 276 out of 30,276). These trailing positions are rendered as solid black, indistinguishable from the background. The visual impact is negligible — less than 1% of the canvas.

### Display columns not yet loaded

If the worker has not yet posted the `ready` message (display columns are null), the density map is not rendered. The `<Show when={display()}>` guard in `App.tsx` handles this.

## Acceptance Criteria

1. The density map is rendered as a standalone box, visible on the landing page as soon as the worker is ready (before any query is entered).
2. When a query is active, the page layout is: MAP → RESULTS (with histograms inside the RESULTS drawer). The RESULTS box retains its existing conditional rendering.
3. The MAP box contains a **3-column grid** of seven canvases: Alphabetical, Chronology, Mana Curve (row 1), Color Map, Type Map, Color × Type (row 2), Complexity (row 3, centered). Each has a label above it.
4. Each canvas is a square with resolution `2 * ceil(sqrt(N))` (where N = unique card count), `image-rendering: pixelated`, scaled to fill one-third of the available width while maintaining a square aspect ratio. Each card occupies a 2×2 pixel block.
5. Each canvas background is solid black (`rgba(0, 0, 0, 1)`).
6. Every unique card in the dataset occupies exactly one 2×2 block per canvas, mapped via a Gilbert curve computed for the logical grid dimensions (`ceil(sqrt(N))`).
7. The Gilbert curve is computed once at mount time, shared across all seven canvases, and cached. It is not pre-computed in the ETL pipeline.
8. There is no lens selection UI. All seven orderings are always visible.
9. Each card's 2×2 block displays its individual color identity colors (see Color encoding). Mono-colored and colorless cards use a uniform block. Two-color cards use two columns. Three-color cards fill three sub-pixels with their colors and the fourth with colorless grey. Four-color cards fill all four sub-pixels. Five-color cards use magenta.
10. A "Color by identity" checkbox toggles between colored and monochrome (white) modes for all seven canvases. Default: checked. Persisted to `localStorage`.
11. When a query is active, matching cards render at alpha 255; non-matching cards render at alpha 25 (ghost) across all seven canvases. When no query is active, all cards render at alpha 255.
12. The match display updates on every keystroke without perceptible delay (< 19 ms total for all seven canvases).
13. Canvas positions beyond the card count are solid black.
14. The RESULTS box (including histograms in its drawer) continues to work unchanged.
15. The canvas fill rate is >99% (near-zero wasted positions).
