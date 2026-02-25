# Spec 041: Result Display Modes

**Status:** Implemented

**Depends on:** Spec 026 (Options Panel), Spec 038 (Collapsible Sparkline Histograms), Spec 017 (ThumbHash Placeholders)

**Modifies:** Spec 026 (replaces Oracle text toggle with view mode selector)

## Goal

Replace the single "Oracle text" toggle with a four-way view mode selector that controls how search results are rendered. The four modes map to Scryfall's "Display as" options:

| Mode | Description | Scryfall equivalent | Batch size |
|---|---|---|---|
| **Slim** | Thumbnail, name, type line (with P/T, loyalty, defense), mana cost. Current default. | Checklist | 150 |
| **Detail** | Slim plus oracle text; P/T/loyalty/defense moves to bottom of oracle box. Current "Oracle text on" view. | Text Only | 60 |
| **Images** | Responsive grid of card face images (2–4 per row). | Images | 60 |
| **Full** | One card per row: full-width card image alongside detail text. | Full | 20 |

## Background

The existing result renderer has two states controlled by the `showOracleText` boolean signal: a compact list (Slim) and the same list with oracle text expanded (Detail). There is no way to see card images in the result list — only the small art crop thumbnails.

The ThumbHash ETL pipeline (Spec 017) already generates both art crop and card image ThumbHashes. The `card_thumb_hashes` column is populated in `ColumnarData` and transferred to the main thread via `DisplayColumns`, but is currently unused in rendering.

## Design

### View mode signal

Replace:

```typescript
const [showOracleText, setShowOracleText] = createSignal(false)
```

With:

```typescript
type ViewMode = 'slim' | 'detail' | 'images' | 'full'

const [viewMode, setViewMode] = createSignal<ViewMode>(
  (localStorage.getItem('frantic-view-mode') as ViewMode) || 'slim'
)
```

Persist on change:

```typescript
function cycleViewMode(mode: ViewMode) {
  setViewMode(mode)
  localStorage.setItem('frantic-view-mode', mode)
}
```

Derive `showOracleText` where still needed:

```typescript
const showOracleText = () => viewMode() === 'detail' || viewMode() === 'full'
```

### View mode toggle UI

The existing "Oracle text" pill in the toolbar is replaced by a segmented control with four options. Each segment shows a short label: **Slim**, **Detail**, **Images**, **Full**.

Styling: a row of buttons within a `rounded-full` container, using the same color scheme as the current pill (`bg-blue-100 text-blue-700` for active, `bg-gray-100 text-gray-600` for inactive). The active segment gets the blue background; others are gray. On hover, inactive segments lighten slightly.

```
┌──────┬────────┬────────┬──────┐
│ Slim │ Detail │ Images │ Full │
└──────┴────────┴────────┴──────┘
```

The toggle sits in the same position as the current "Oracle text" pill — right-aligned in the toolbar row between the histograms and the card list.

### View-dependent batch sizes

The `RESULT_BATCH` constant becomes a lookup:

```typescript
const BATCH_SIZES: Record<ViewMode, number> = {
  slim: 150,
  detail: 60,
  images: 60,
  full: 20,
}
```

The batch size is read reactively: `BATCH_SIZES[viewMode()]`. When the view mode changes, `visibleCount` resets to the new batch size (same as the existing reset on new search results).

### Card image URL helpers

Extract `normalImageUrl` from `CardDetail.tsx` into `color-identity.ts` (which already exports `artCropUrl`) for reuse:

```typescript
export function normalImageUrl(scryfallId: string, face: 'front' | 'back' = 'front'): string {
  return `https://cards.scryfall.io/normal/${face}/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}
```

### Color-identity indicator strip

Both Images and Full views show a color-identity gradient strip below the card image, matching the visual treatment in the `ArtCrop` component used by Slim and Detail modes. This is achieved with the same `pb-1` technique: the `CardImage` container has bottom padding, and the ThumbHash background uses `background-origin: content-box` so it doesn't fill the padding area. The color-identity gradient (applied as a second CSS background layer) fills the border-box, peeking through the bottom padding as a thin color strip.

### Lazy image loading

The `ArtCrop` component already uses `IntersectionObserver` to defer setting the `src` attribute until the element is near the viewport. The Images and Full views must apply the same technique to card face images.

Extract the observer pattern into a reusable primitive:

```typescript
function createInView(rootMargin = '200px'): { ref: (el: Element) => void; inView: Accessor<boolean> }
```

This returns a `ref` callback (for use with SolidJS `ref=`) and a reactive `inView` signal. The observer disconnects after the first intersection. Both `ArtCrop` and the new image-bearing views use this primitive.

### Slim view (unchanged)

Identical to the current default rendering. The `<ul>` with `CardFaceRow` components, art crop thumbnails, and progressive loading via IntersectionObserver sentinel.

### Detail view (unchanged)

Identical to the current "Oracle text on" rendering. `CardFaceRow` receives `showOracle={true}`, which expands oracle text and moves P/T to the bottom.

### Images view (new)

A responsive CSS grid replacing the `<ul>`, rendered as a contact-sheet layout:

```
grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-200 dark:bg-gray-800
```

The grid uses `gap-px` (1px) with a gray background that shows through the gaps as hairline dividers. There is no internal padding — cards extend to the container edges. The grid wrapper has `overflow-hidden rounded-b-xl` to clip the bottom corners flush with the results container's border radius.

Each cell is a clickable card that navigates to the card detail page. Cards have no individual border radius (the contact-sheet layout clips them at the container level). The cell contains:

1. A `CardImage` component with `aspect-[488/680]` (standard card proportions).
2. A ThumbHash placeholder as the background (decoded from `card_thumb_hashes[ci]`), falling back to the color-identity gradient.
3. An `<img>` with `src` gated by `createInView` — only set when the cell is near the viewport.
4. The card name as an `aria-label` on the clickable container for accessibility.

No text is shown in the grid cell — the card image alone identifies the card. Tapping a cell navigates to the card detail page.

For multi-faced cards (e.g., transform, modal DFC), only the front face image is shown in the grid. The card detail page already handles face switching.

### Full view (new)

One card per row, similar to Detail but with a large card image:

```
┌───────────────────────────────────────────────────────┐
│ ┌──────────────────┐  Card Name          {2}{W}{U}    │
│ │                  │  Type Line                        │
│ │   (card image    │  ┌──────────────────────────┐     │
│ │    336px wide)   │  │ Oracle text...           │     │
│ │                  │  │                    3/4   │     │
│ │                  │  └──────────────────────────┘     │
│ └──────────────────┘                                   │
├───────────────────────────────────────────────────────┤
│ (next card...)                                         │
```

The card image is **336px wide** (`w-[336px] max-w-full`) at all viewport widths, matching Scryfall's Full view maximum. The image has `rounded-lg`, `aspect-[488/680]`, a ThumbHash placeholder, and lazy-loaded `src`.

**Responsive wrap:** On viewports narrower than 600px, the layout switches from side-by-side to stacked — text wraps below the full-width image. This uses `flex-col min-[600px]:flex-row`.

The image is clickable and navigates to the card detail page. For multi-faced cards, only the front face image is shown.

## Scope of changes

| File | Change |
|---|---|
| `app/src/App.tsx` | Replace `showOracleText` signal with `viewMode`. Replace Oracle text pill with segmented control. Conditionally render Slim/Detail `<ul>` or Images grid or Full list based on `viewMode`. Make `RESULT_BATCH` view-dependent. Reset `visibleCount` on mode change. |
| `app/src/color-identity.ts` | Export `normalImageUrl`. |
| `app/src/CardDetail.tsx` | Import `normalImageUrl` from `color-identity.ts` instead of local definition. |
| `app/src/ArtCrop.tsx` | Refactor to use `createInView`. |
| `app/src/createInView.ts` (new) | Extracted IntersectionObserver primitive. |
| `app/src/CardImage.tsx` (new) | Reusable card face image component with ThumbHash placeholder + lazy src. Used by Images grid and Full view. |
| `app/src/ViewModeToggle.tsx` (new) | Segmented control component for the four view modes. |

## Edge cases

### Missing card ThumbHash

When `card_thumb_hashes[ci]` is empty, fall back to the color-identity gradient as the placeholder background. The image still lazy-loads normally.

### Missing card image (404)

If the Scryfall CDN returns a 404 for a card image (rare, but possible for very new or removed printings), show the ThumbHash/gradient placeholder permanently. An `onError` handler on the `<img>` can set a `failed` signal to prevent retries.

### Multi-faced cards in grid

Transform / modal DFC cards show only the front face in both Images and Full views. The card detail page handles face switching. The grid cell uses `normal/front/...` URL.

### Dark mode

Card images have their own backgrounds (card frames), so they look fine against both light and dark app backgrounds. The rounded-corner container clips any edge artifacts.

### Mobile considerations

The Images grid uses `grid-cols-2` on small screens, scaling up to 4 columns on large screens. Card images from Scryfall's `normal` size (488×680) are appropriately sized for these column widths — no need for `large` size images.

### View mode persistence

The `localStorage` key `frantic-view-mode` stores the raw string. Invalid values (e.g., from a future removal of a mode) fall back to `'slim'` via the `|| 'slim'` default.

### Batch size on mode switch

When switching view modes, `visibleCount` resets to the new mode's batch size. This prevents a scenario where switching from Slim (150 visible) to Full (batch 20) would attempt to render 150 Full rows with images simultaneously.

## Acceptance criteria

1. The "Oracle text" pill is replaced by a four-segment toggle: Slim, Detail, Images, Full.
2. The active view mode is visually highlighted (blue) in the toggle.
3. The selected view mode is persisted to `localStorage` under `frantic-view-mode`.
4. **Slim** renders identically to the current default (art crop thumbnail + name/type/mana cost).
5. **Detail** renders identically to the current "Oracle text on" mode.
6. **Images** renders a responsive grid (2–4 columns) of card face images with ThumbHash placeholders.
7. **Full** renders one card per row with a card image on the left and full detail (name, type, mana cost, oracle text, P/T) on the right.
8. Card images in Images and Full views are lazy-loaded via IntersectionObserver — `src` is not set until the element is near the viewport.
9. ThumbHash placeholders (from `card_thumb_hashes`) are shown while images load, falling back to color-identity gradients when no ThumbHash is available.
10. Progressive rendering batch sizes are view-dependent: Slim 150, Detail 60, Images 60, Full 20.
11. Switching view modes resets `visibleCount` to the new batch size.
12. Clicking a card in Images view navigates to the card detail page.
13. Clicking a card image in Full view navigates to the card detail page.
14. The IntersectionObserver sentinel ("…and N more") continues to work for progressive loading in all four modes.
15. Card images in Images and Full views show a color-identity gradient strip below the card, matching the art crop indicator in Slim/Detail modes.
16. In Full view, the card image is 336px wide (capped at container width). Below 600px viewport width, text content wraps below the image.
17. In Images view, the grid uses 1px gaps with no internal padding — cards extend to the results container edges.
