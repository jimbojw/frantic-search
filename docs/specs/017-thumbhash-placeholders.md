# Spec 017: ThumbHash Image Placeholders

**Status:** Draft

**Depends on:** Spec 001 (ETL Download)

## Goal

Show low-resolution image previews (ThumbHash placeholders) while art crop thumbnails load, replacing the flat color-identity gradient with a recognizable smudge of the actual card art.

## Background

Today, each search result shows an `ArtCrop` component: a 4:3 thumbnail loaded from Scryfall's CDN (`cards.scryfall.io/art_crop/…`). While the image loads, a color-identity gradient fills the space. This works but offers no visual hint of which card is which until the image arrives.

[ThumbHash](https://evanw.github.io/thumbhash/) encodes a ~25-byte representation of an image that can be decoded client-side into a blurry placeholder. The decode is fast (<1 ms per image) and produces a data URL that can serve as a background image until the real art crop loads.

### Challenge

Generating ThumbHashes requires downloading ~33,000 art crop images from Scryfall. Scryfall rate-limits to <10 requests/second. The project builds and deploys via GitHub Actions, where long-running image downloads are impractical in a single build. A progressive backfill strategy lets coverage accumulate over successive builds.

## Strategy: Progressive Backfill

Each CI build:

1. Restores a cached **ThumbHash manifest** — a JSON map of Scryfall IDs to base64-encoded ThumbHash bytes.
2. Loads the current oracle card data to determine the full set of valid Scryfall IDs.
3. Identifies cards not yet in the manifest.
4. Downloads art crops, generates ThumbHashes, and inserts them into the manifest — up to a **time limit** (default: 500 seconds).
5. Prunes manifest entries whose Scryfall IDs no longer appear in the current oracle card set (removes stale cards from errata/merges).
6. Writes the updated manifest back to disk for caching.

The ETL `process` command then reads the manifest and populates a `thumb_hashes` column in `columns.json`. Cards without a ThumbHash get an empty string. Over successive builds, coverage improves until all cards are covered.

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
Load manifest from data/thumbhash/manifest.json (or empty map)
Load oracle-cards.json → extract list of Scryfall IDs (filtered same as process command)
Prune manifest entries not in current oracle card set
Determine missing IDs (in oracle set but not in manifest), in oracle-cards.json order

deadline = now + timeout
for each missing ID:
  if now >= deadline: break
  download art crop from cards.scryfall.io/art_crop/front/{id[0]}/{id[1]}/{id}.jpg
  resize to max dimension ~100px (preserving aspect ratio)
  generate ThumbHash from pixel data
  insert base64-encoded ThumbHash into manifest
  wait delay ms
  on error (404, timeout, etc.): log warning, skip to next

Write manifest to data/thumbhash/manifest.json
Log summary: N new hashes, M total, K pruned, L remaining
```

### Art Crop Processing

Art crops vary in aspect ratio (most are 626×457, but some layouts like Aftermath are wider). The pipeline preserves the native aspect ratio — no cropping. The image is resized to fit within 100×100 (preserving aspect ratio) before passing to `rgbaToThumbHash`. ThumbHash natively encodes aspect ratio, so the decoded placeholder matches the source proportions.

At display time, the `ArtCrop` component uses `background-size: cover` on the decoded ThumbHash data URL, matching the `object-cover` behavior of the real art crop `<img>`. The browser handles clipping to the 4:3 container, regardless of the source aspect ratio.

Use `sharp` for image decoding and resizing. It runs natively in Node and is available in GitHub Actions runners without extra setup.

### Failure Handling

- Individual download failures (network errors, 404s, timeouts) are logged and skipped. The card is not added to the manifest, so it will be retried on the next run.
- A persistent failure list is not needed: cards that 404 will be retried each run, but since they fail instantly (no rate-limit cost), this is cheap. If a card's art crop becomes available later, it will succeed on a future run.
- If the manifest file is missing or corrupt, start from an empty map.

## Manifest Format

File: `data/thumbhash/manifest.json`

```json
{
  "1904db14-6df7-424f-afa5-e3dfab31300a": "3OcRJYB4d3h/iIeHeFhHd4iHcPo9wA==",
  "f3bb6b12-1e55-4bff-a153-671ebc6d2800": "IhgKFYB3d3hwiIeHeFhHd4iHcPo9wA=="
}
```

Keys are Scryfall UUIDs. Values are base64-encoded ThumbHash bytes (~25 bytes → ~36 characters base64). The file is ~2.5 MB for full 33k coverage — well within GitHub Actions cache limits.

## GitHub Actions Integration

Add a cache step to the deploy workflow for the ThumbHash manifest, separate from the existing Scryfall data cache:

```yaml
- name: Restore ThumbHash cache
  uses: actions/cache@v4
  with:
    path: data/thumbhash
    key: thumbhash-manifest

- name: Generate ThumbHashes
  run: npm run etl -- thumbhash
```

This goes after the "Download Oracle Cards" step (which populates `data/raw/oracle-cards.json`) and before the "Process card data" step (which reads the manifest).

The cache key `thumbhash-manifest` is fixed. Each run restores the previous manifest, extends it, and saves it back. GitHub's cache action handles the save-on-success automatically.

## Wire Format: `ColumnarData` Extension

Add a `thumb_hashes` field to the `ColumnarData` interface in `shared/src/data.ts`:

```typescript
export interface ColumnarData {
  // ... existing fields ...
  thumb_hashes: string[];
}
```

The array is aligned with `scryfall_ids`: `thumb_hashes[i]` is the base64 ThumbHash for the card at index `i`, or `""` if no ThumbHash is available.

### Payload Impact

- Raw: ~33k × ~36 chars = ~1.2 MB additional JSON.
- Gzipped: base64 strings have moderate entropy; expect ~400–600 KB additional transfer.
- This is a one-time cost on initial load, acceptable for the UX improvement.

### ETL `process` Changes

The `processCards` function loads the ThumbHash manifest and populates `thumb_hashes` alongside `scryfall_ids`:

```typescript
const manifest = loadThumbHashManifest(); // { [scryfallId]: base64 }
// in pushFaceRow:
data.thumb_hashes.push(manifest[card.id ?? ""] ?? "");
```

## Worker Protocol Changes

Add `thumbHash` to `CardResult`:

```typescript
export type CardResult = {
  scryfallId: string
  colorIdentity: number
  thumbHash: string
  faces: CardFace[]
}
```

The worker populates it from `data.thumb_hashes[canonIdx]`. The field is an empty string when no ThumbHash is available.

## Client Integration

### Decoding

The `thumbhash` npm package exports `thumbHashToDataURL(hash: Uint8Array): string`. The base64 string from `CardResult.thumbHash` is decoded to a `Uint8Array` and passed to this function. The result is a data URL suitable for use as a CSS `background-image` or `<img>` src.

Decoding happens on the main thread. At <1 ms per hash and a maximum of 200 visible results, this is negligible.

### `ArtCrop` Component Changes

```typescript
function ArtCrop(props: {
  scryfallId: string
  colorIdentity: number
  thumbHash: string
}) {
  const [loaded, setLoaded] = createSignal(false)

  const background = () => {
    if (props.thumbHash) {
      const bytes = base64ToBytes(props.thumbHash)
      return `url(${thumbHashToDataURL(bytes)})`
    }
    return CI_BACKGROUNDS[props.colorIdentity] ?? CI_COLORLESS
  }

  return (
    <div
      class="w-[3em] pb-1 rounded-sm overflow-hidden shrink-0 mt-0.5"
      style={{ background: background(), "background-size": "cover", "background-position": "center" }}
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

When a ThumbHash is available, the container shows a decoded blurry preview as its background. When not available, it falls back to the existing color-identity gradient. In both cases, the real art crop fades in on load as it does today.

### Bundle Size

The `thumbhash` package is ~1 KB minified. The `thumbHashToDataURL` function is the only import needed in the app bundle.

## Dependencies

| Package | Workspace | Purpose |
|---|---|---|
| `sharp` | `etl` | Image decode and resize for ThumbHash generation |
| `thumbhash` | `etl`, `app` | ThumbHash encoding (ETL) and decoding (app) |

## Acceptance Criteria

1. `npm run etl -- thumbhash` downloads art crops, generates ThumbHashes, and writes `data/thumbhash/manifest.json`.
2. The command respects `--timeout` and stops downloading when the time limit is reached.
3. The command respects `--delay` as a minimum interval between downloads.
4. Individual download failures are logged and skipped without aborting the run.
5. Stale manifest entries (IDs not in current oracle cards) are pruned.
6. `npm run etl -- process` reads the manifest and populates a `thumb_hashes` column in `columns.json`.
7. Cards without a ThumbHash have an empty string in the column.
8. The `ArtCrop` component shows a decoded ThumbHash as the placeholder background when available.
9. The `ArtCrop` component falls back to the color-identity gradient when no ThumbHash is available.
10. The deploy workflow caches and restores the ThumbHash manifest between builds.
