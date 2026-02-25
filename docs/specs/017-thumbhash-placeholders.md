# Spec 017: ThumbHash Image Placeholders

**Status:** Implemented

**Depends on:** Spec 001 (ETL Download)

## Goal

Show low-resolution image previews (ThumbHash placeholders) while card images load, replacing flat color-identity gradients with a recognizable smudge of the actual card art. Two kinds of ThumbHash are generated:

1. **Art crop** — used in the list-view search results (`ArtCrop` component).
2. **Card image** — used in future grid-view / Images results showing the full card face.

## Background

Today, each search result shows an `ArtCrop` component: a 4:3 thumbnail loaded from Scryfall's CDN (`cards.scryfall.io/art_crop/…`). While the image loads, a color-identity gradient fills the space. This works but offers no visual hint of which card is which until the image arrives.

[ThumbHash](https://evanw.github.io/thumbhash/) encodes a ~25-byte representation of an image that can be decoded client-side into a blurry placeholder. The decode is fast (<1 ms per image) and produces a data URL that can serve as a background image until the real image loads.

### Challenge

Generating ThumbHashes requires downloading ~33,000 images (×2 kinds) from Scryfall. Scryfall rate-limits to <10 requests/second. The project builds and deploys via GitHub Actions, where long-running image downloads are impractical in a single build. A progressive backfill strategy lets coverage accumulate over successive builds.

## Strategy: Progressive Backfill

Two separate manifests are maintained — one for art crop ThumbHashes and one for card image ThumbHashes. They share a single time budget.

Each CI build:

1. Restores cached **ThumbHash manifests** — two JSON maps of Scryfall IDs to base64-encoded ThumbHash bytes (`art-crop-thumbhash-manifest.json` for art crops, `card-thumbhash-manifest.json` for card images).
2. Loads the current oracle card data to determine the full set of valid Scryfall IDs.
3. Identifies cards not yet in each manifest.
4. Downloads art crops, generates ThumbHashes, and inserts them into the art crop manifest — up to a **shared time limit** (default: 500 seconds).
5. With remaining time, downloads card images, generates ThumbHashes, and inserts them into the card image manifest.
6. Prunes both manifests of entries whose Scryfall IDs no longer appear in the current oracle card set (removes stale cards from errata/merges).
7. Writes both updated manifests back to disk for caching.

Art crops are processed first. Once art crop coverage is complete, the entire time budget naturally shifts to card images. This prioritization ensures the existing list-view experience reaches full coverage before the newer grid-view placeholders.

The ETL `process` command then reads both manifests and populates `art_crop_thumb_hashes` and `card_thumb_hashes` columns in `columns.json`. Cards without a ThumbHash get an empty string in the respective column. Over successive builds, coverage improves until all cards are covered in both columns.

## ETL: `thumbhash` Subcommand

A new subcommand registered in `etl/src/index.ts`:

```
npm run etl -- thumbhash [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--timeout` | `500` | Maximum seconds to spend downloading and hashing |
| `--delay` | `100` | Milliseconds between image downloads (rate limiting) |
| `--verbose` | `false` | Print detailed progress |

### Behavior

```
Load art crop manifest from data/thumbhash/art-crop-thumbhash-manifest.json
  (fallback: data/thumbhash/manifest.json if renamed file missing — see Migration)
Load card image manifest from data/thumbhash/card-thumbhash-manifest.json (or empty map)
Load oracle-cards.json → extract list of Scryfall IDs (filtered same as process command)
Prune both manifests of entries not in current oracle card set
Determine art crop missing IDs (in oracle set but not in art crop manifest)
Determine card image missing IDs (in oracle set but not in card image manifest)

deadline = now + timeout

-- Phase 1: art crops --
for each art crop missing ID:
  if now >= deadline: break
  download art crop from cards.scryfall.io/art_crop/front/{id[0]}/{id[1]}/{id}.jpg
  resize to max dimension ~100px (preserving aspect ratio)
  generate ThumbHash from pixel data
  insert base64-encoded ThumbHash into art crop manifest
  wait delay ms
  on error (404, timeout, etc.): log warning, skip to next

-- Phase 2: card images (remaining time) --
for each card image missing ID:
  if now >= deadline: break
  download card image from cards.scryfall.io/normal/front/{id[0]}/{id[1]}/{id}.jpg
  resize to max dimension ~100px (preserving aspect ratio)
  generate ThumbHash from pixel data
  insert base64-encoded ThumbHash into card image manifest
  wait delay ms
  on error (404, timeout, etc.): log warning, skip to next

Write both manifests to data/thumbhash/
Log summary per manifest: N new hashes, M total, K pruned, L remaining
```

### Image Processing

Both art crops and card images are processed identically: resized to fit within 100×100 (preserving aspect ratio) before passing to `rgbaToThumbHash`. ThumbHash natively encodes aspect ratio, so the decoded placeholder matches the source proportions.

**Art crops** vary in aspect ratio (most are 626×457, but some layouts like Aftermath are wider). At display time, the `ArtCrop` component uses `background-size: cover` on the decoded ThumbHash data URL, matching the `object-cover` behavior of the real art crop `<img>`. The browser handles clipping to the 4:3 container, regardless of the source aspect ratio.

**Card images** are portrait-oriented (~488×680 for standard cards). The ThumbHash encodes this aspect ratio, so the decoded placeholder naturally matches the card shape. At display time, the same `background-size: cover` technique applies.

Use `sharp` for image decoding and resizing. It runs natively in Node and is available in GitHub Actions runners without extra setup.

### Image URLs

| Kind | URL pattern |
|---|---|
| Art crop | `cards.scryfall.io/art_crop/front/{id[0]}/{id[1]}/{id}.jpg` |
| Card image | `cards.scryfall.io/normal/front/{id[0]}/{id[1]}/{id}.jpg` |

### Failure Handling

- Individual download failures (network errors, 404s, timeouts) are logged and skipped. The card is not added to the respective manifest, so it will be retried on the next run.
- A persistent failure list is not needed: cards that 404 will be retried each run, but since they fail instantly (no rate-limit cost), this is cheap. If a card's image becomes available later, it will succeed on a future run.
- If either manifest file is missing or corrupt, start from an empty map for that manifest.

## Manifest Format

Two files in `data/thumbhash/`:

| File | Contents |
|---|---|
| `art-crop-thumbhash-manifest.json` | Art crop ThumbHashes |
| `card-thumbhash-manifest.json` | Card image ThumbHashes |

Both share the same schema — a flat JSON object mapping Scryfall UUIDs to base64-encoded ThumbHash bytes:

```json
{
  "1904db14-6df7-424f-afa5-e3dfab31300a": "3OcRJYB4d3h/iIeHeFhHd4iHcPo9wA==",
  "f3bb6b12-1e55-4bff-a153-671ebc6d2800": "IhgKFYB3d3hwiIeHeFhHd4iHcPo9wA=="
}
```

Each value is ~25 bytes → ~36 characters base64. Each file is ~2.5 MB at full 33k coverage — well within GitHub Actions cache limits. Using separate files keeps the cache additive (a new card image manifest doesn't invalidate the existing art crop manifest).

## GitHub Actions Integration

Add a cache step to the deploy workflow for the ThumbHash manifest, separate from the existing Scryfall data cache:

```yaml
- name: Restore ThumbHash cache
  uses: actions/cache@v4
  with:
    path: data/thumbhash
    key: thumbhash-manifest-${{ github.run_id }}
    restore-keys: |
      thumbhash-manifest-

- name: Generate ThumbHashes
  run: npm run etl -- thumbhash --verbose
```

This goes after the "Download Oracle Cards" step (which populates `data/raw/oracle-cards.json`) and before the "Process card data" step (which reads the manifest).

The cache key includes the run ID so each build saves a new entry. The `restore-keys` prefix fallback ensures each run restores the most recent prior cache. GitHub's cache action saves on workflow completion when the exact key is a miss.

## Wire Format: `ColumnarData` Extension

Add `art_crop_thumb_hashes` and `card_thumb_hashes` fields to the `ColumnarData` interface in `shared/src/data.ts`:

```typescript
export interface ColumnarData {
  // ... existing fields ...
  art_crop_thumb_hashes: string[];
  card_thumb_hashes: string[];
}
```

Both arrays are aligned with `scryfall_ids`: `art_crop_thumb_hashes[i]` is the base64 art crop ThumbHash for the card at index `i`, and `card_thumb_hashes[i]` is the base64 card image ThumbHash. Either is `""` if no ThumbHash is available for that kind.

### Payload Impact

- Raw: ~33k × ~36 chars × 2 columns = ~2.4 MB additional JSON.
- Gzipped: base64 strings have moderate entropy; expect ~800 KB–1.2 MB additional transfer.
- This is a one-time cost on initial load, acceptable for the UX improvement.

### ETL `process` Changes

The `processCards` function loads both ThumbHash manifests and populates both columns alongside `scryfall_ids`:

```typescript
const artCropManifest = loadArtCropManifest();
const cardManifest = loadCardManifest();
// in pushFaceRow:
data.art_crop_thumb_hashes.push(artCropManifest[card.id ?? ""] ?? "");
data.card_thumb_hashes.push(cardManifest[card.id ?? ""] ?? "");
```

## Worker Protocol Changes

Both ThumbHash columns are included in `DisplayColumns` (Spec 024) so the main thread can decode them locally:

```typescript
export type DisplayColumns = {
  // ... existing fields ...
  art_crop_thumb_hashes: string[]
  card_thumb_hashes: string[]
}
```

The main thread looks up `display.art_crop_thumb_hashes[ci]` for art crop placeholders and `display.card_thumb_hashes[ci]` for card image placeholders. Either field is an empty string when no ThumbHash is available.

## Client Integration

### Decoding

The `thumbhash` npm package exports `thumbHashToDataURL(hash: Uint8Array): string`. The base64 string from the display column (`display.art_crop_thumb_hashes[ci]` or `display.card_thumb_hashes[ci]`) is decoded to a `Uint8Array` and passed to this function. The result is a data URL suitable for use as a CSS `background-image` or `<img>` src.

Decoding happens on the main thread. At <1 ms per hash and a maximum of 200 visible results, this is negligible.

### `ArtCrop` Component Changes

```typescript
function ArtCrop(props: {
  scryfallId: string
  colorIdentity: number
  thumbHash: string
}) {
  const [loaded, setLoaded] = createSignal(false)

  const gradient = () => CI_BACKGROUNDS[props.colorIdentity] ?? CI_COLORLESS

  const background = () => {
    if (props.thumbHash) {
      const bytes = base64ToBytes(props.thumbHash)
      return `url(${thumbHashToDataURL(bytes)}) center/cover, ${gradient()}`
    }
    return gradient()
  }

  return (
    <div
      class="w-[3em] pb-1 rounded-sm overflow-hidden shrink-0 mt-0.5"
      style={{ background: background() }}
    >
      <img
        src={artCropUrl(props.scryfallId)}
        loading="lazy"
        alt=""
        onLoad={() => setLoaded(true)}
        class="w-full aspect-[4/3] object-cover"
        classList={{ 'opacity-0': !loaded(), 'opacity-100': loaded() }}
        style="transition: opacity 300ms ease-in"
      />
    </div>
  )
}
```

The color-identity gradient is always present. When a ThumbHash is available, its decoded image is layered on top of the gradient using CSS multiple backgrounds. Because the art crop `<img>` does not fully cover the container (the container has bottom padding), the gradient peeks out at the bottom as a persistent color-identity indicator even after the image loads. The real art crop fades in on load as it does today.

### Bundle Size

The `thumbhash` package is ~1 KB minified. The `thumbHashToDataURL` function is the only import needed in the app bundle.

## Dependencies

| Package | Workspace | Purpose |
|---|---|---|
| `sharp` | `etl` | Image decode and resize for ThumbHash generation |
| `thumbhash` | `etl`, `app` | ThumbHash encoding (ETL) and decoding (app) |

## Acceptance Criteria

1. `npm run etl -- thumbhash` downloads art crops and card images, generates ThumbHashes, and writes `data/thumbhash/art-crop-thumbhash-manifest.json` (art crops) and `data/thumbhash/card-thumbhash-manifest.json` (card images).
2. The `--timeout` applies to the total time across both phases. Art crops are processed first; card images use remaining time.
3. The command respects `--delay` as a minimum interval between downloads.
4. Individual download failures are logged and skipped without aborting the run.
5. Stale manifest entries (IDs not in current oracle cards) are pruned from both manifests.
6. `npm run etl -- process` reads both manifests and populates `art_crop_thumb_hashes` and `card_thumb_hashes` columns in `columns.json`.
7. Cards without a ThumbHash have an empty string in the respective column.
8. The `ArtCrop` component shows a decoded art crop ThumbHash layered over the color-identity gradient when available.
9. The color-identity gradient is always visible (it peeks out from the bottom padding even after the art crop image loads). When no ThumbHash is available, only the gradient is shown.
10. The deploy workflow caches and restores both ThumbHash manifests between builds.

## Migration

The art crop manifest and columnar column were renamed for clarity. Two temporary fallbacks ensure a smooth transition across the first build:

1. **Manifest fallback.** When loading the art crop manifest, if `data/thumbhash/art-crop-thumbhash-manifest.json` is missing, fall back to `data/thumbhash/manifest.json` (the old name). The command always writes to the new filename. Remove this fallback after the first successful build.

2. **Column fallback.** When the `restore` command reconstructs manifests from a previously deployed `columns.json`, if the `art_crop_thumb_hashes` column is missing, fall back to `thumb_hashes` (the old name). Similarly, the app's data-loading path should treat `thumb_hashes` as an alias for `art_crop_thumb_hashes` if the new name is absent. Remove these fallbacks after the first successful build and deployment.

## Implementation Notes

- 2026-02-25: Extended spec to cover card image ThumbHashes (for future
  grid-view / Images results) alongside existing art crop ThumbHashes.
  Renamed the art crop manifest from `manifest.json` to
  `art-crop-thumbhash-manifest.json` and the columnar column from
  `thumb_hashes` to `art_crop_thumb_hashes` for symmetry with the new
  card image equivalents. Added temporary fallbacks for the old names
  (see Migration section). Added a two-phase download loop sharing a
  single `--timeout` budget. The Worker Protocol section was updated to
  reflect the index-based protocol from Spec 024 (the original
  `CardResult`-based description was stale).
