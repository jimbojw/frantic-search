# Spec 045: Split Data Files

**Status:** Implemented 

**Depends on:** Spec 003 (ETL Process), Spec 005 (App Data Loading), Spec 017 (ThumbHash Placeholders), Spec 024 (Index-Based Result Protocol)

## Goal

Split the monolithic `columns.json` into a core data file (searchable fields) and a supplemental thumb-hashes file (display-only placeholders). The app becomes searchable before thumb-hash data arrives, and the architecture supports future supplemental files (printings, prices).

## Background

`columns.json` is currently ~16 MB raw / ~4.8 MB gzipped. Of that, the two ThumbHash columns (`art_crop_thumb_hashes` and `card_thumb_hashes`) contribute ~2.4 MB raw / ~1 MB gzipped — roughly 20% of the transfer. These columns are never used by the query engine; they exist solely for display-time image placeholders.

The current load sequence is:

1. Worker fetches `columns.json` (~4.8 MB gzipped).
2. Worker builds `CardIndex` and `NodeCache`.
3. Worker extracts `DisplayColumns` (including thumb hashes) and posts `ready`.
4. Main thread receives `ready` and enables search.

Thumb hashes delay step 3 because they inflate the fetch and parse time. Meanwhile, the `ArtCrop` and `CardImage` components already have a graceful fallback when thumb hashes are empty: they show a color-identity gradient. Deferring thumb hashes costs nothing in UX — gradients fill the gap for the fraction of a second until the supplemental file arrives.

## Design

### File split

The ETL `process` command produces two files:

| File | Contents | Approximate size (gzip) |
|---|---|---|
| `data/dist/columns.json` | All columns except `art_crop_thumb_hashes` and `card_thumb_hashes` | ~3.8 MB |
| `data/dist/thumb-hashes.json` | Two arrays: `art_crop` and `card`, aligned by face-row index | ~1 MB |

### `thumb-hashes.json` format

```json
{
  "art_crop": ["<base64>", "<base64>", ""],
  "card": ["<base64>", "", "<base64>"]
}
```

Both arrays have the same length as the core columnar arrays (one entry per face row). Empty string means no thumb hash available — identical semantics to the current columnar columns.

### `ColumnarData` type change

Make thumb hash fields optional so `columns.json` (without them) and legacy files (with them) both satisfy the interface:

```typescript
export interface ColumnarData {
  // ... all existing required fields ...
  art_crop_thumb_hashes?: string[]
  card_thumb_hashes?: string[]
}
```

### Load sequence

```
Worker                                    Main Thread
──────                                    ───────────
1. Fetch columns.json (~3.8 MB gz)
2. Build CardIndex + NodeCache
3. extractDisplayColumns (thumb hash
   arrays are empty [])
4. Post { ready, display }           ──►  5. Store display, enable search
                                          6. Start fetch: thumb-hashes.json (~1 MB gz)
                                          7. Parse JSON, merge into display signal
                                          8. Components re-render with thumb hashes
```

Steps 1–4 are faster because `columns.json` is smaller. Step 6 runs on the main thread because thumb hashes are display-only data — no reason to route through the worker and pay postMessage serialization.

The main-thread fetch starts immediately after receiving `ready`. It could start earlier (on mount), but waiting for `ready` avoids a dangling fetch if the worker fails.

### Worker changes (`app/src/worker.ts`)

`extractDisplayColumns` fills empty arrays when thumb hash columns are absent:

```typescript
function extractDisplayColumns(data: ColumnarData): DisplayColumns {
  const len = data.names.length
  return {
    // ... existing fields ...
    art_crop_thumb_hashes: data.art_crop_thumb_hashes ?? new Array(len).fill(''),
    card_thumb_hashes: data.card_thumb_hashes ?? new Array(len).fill(''),
  }
}
```

No new message types are needed.

### Main-thread thumb-hash fetch (`app/src/App.tsx`)

Add a `ThumbHashData` type:

```typescript
interface ThumbHashData {
  art_crop: string[]
  card: string[]
}
```

After receiving `ready`, the main thread fetches thumb-hashes.json and merges:

```typescript
if (msg.status === 'ready') {
  setDataProgress(1)
  setDisplay(msg.display)
  fetchThumbHashes()
}

async function fetchThumbHashes(): Promise<void> {
  try {
    const url = new URL(
      /* @vite-ignore */ `./assets/${__THUMBS_FILENAME__}`,
      location.href,
    )
    const resp = await fetch(url)
    if (!resp.ok) return
    const data: ThumbHashData = await resp.json()
    setDisplay(prev => prev ? {
      ...prev,
      art_crop_thumb_hashes: data.art_crop,
      card_thumb_hashes: data.card,
    } : prev)
  } catch {
    // Thumb hashes are optional; gracefully degrade to gradients.
  }
}
```

Replacing the `display` signal triggers a re-render. `ArtCrop` and `CardImage` components read `d().art_crop_thumb_hashes[ci]` and `d().card_thumb_hashes[ci]`, which now return real values instead of empty strings. The thumb-hash decode and data URL generation happen as before.

### Vite plugin changes (`app/vite.config.ts`)

The `serveData` plugin is extended to handle both files:

```typescript
function serveData(): Plugin {
  const columnsFile = path.resolve(__dirname, '..', 'data', 'dist', 'columns.json')
  const thumbsFile = path.resolve(__dirname, '..', 'data', 'dist', 'thumb-hashes.json')
  let columnsFilename = 'columns.json'
  let thumbsFilename = 'thumb-hashes.json'

  return {
    name: 'serve-data',

    config(_config, { command }) {
      if (command === 'build') {
        if (fs.existsSync(columnsFile)) {
          const hash = createHash('md5').update(fs.readFileSync(columnsFile)).digest('hex').slice(0, 8)
          columnsFilename = `columns.${hash}.json`
        }
        if (fs.existsSync(thumbsFile)) {
          const hash = createHash('md5').update(fs.readFileSync(thumbsFile)).digest('hex').slice(0, 8)
          thumbsFilename = `thumb-hashes.${hash}.json`
        }
      }
      const columnsSize = fs.existsSync(columnsFile) ? fs.statSync(columnsFile).size : 0
      return {
        define: {
          __COLUMNS_FILENAME__: JSON.stringify(columnsFilename),
          __COLUMNS_FILESIZE__: String(columnsSize),
          __THUMBS_FILENAME__: JSON.stringify(thumbsFilename),
        },
      }
    },

    configureServer(server) {
      // Serve both files during dev
      for (const [route, file] of [
        ['/columns.json', columnsFile],
        ['/thumb-hashes.json', thumbsFile],
      ] as const) {
        server.middlewares.use(route, (_req, res) => {
          if (!fs.existsSync(file)) {
            res.writeHead(404)
            res.end(`${path.basename(file)} not found — run ETL first`)
            return
          }
          res.setHeader('Content-Type', 'application/json')
          fs.createReadStream(file).pipe(res)
        })
      }
    },

    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      if (fs.existsSync(columnsFile)) {
        fs.copyFileSync(columnsFile, path.join(outDir, columnsFilename))
        fs.copyFileSync(columnsFile, path.join(outDir, 'columns.json'))
      }
      if (fs.existsSync(thumbsFile)) {
        fs.copyFileSync(thumbsFile, path.join(outDir, thumbsFilename))
        fs.copyFileSync(thumbsFile, path.join(outDir, 'thumb-hashes.json'))
      }
    },
  }
}
```

Both files are copied with content-hashed names (for the app) and stable names (for the restore command and PWA fallback).

### PWA caching

Add a runtime caching rule for thumb-hashes alongside the existing columns rule:

```typescript
runtimeCaching: [
  {
    urlPattern: /columns\.[a-f0-9]+\.json$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'card-data',
      expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
    },
  },
  {
    urlPattern: /thumb-hashes\.[a-f0-9]+\.json$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'card-data',
      expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
    },
  },
  // ... existing scryfall art rule ...
],
```

Both use `CacheFirst` with content-hashed URLs — a new deploy produces new filenames, naturally busting the cache.

### ETL process changes (`etl/src/process.ts`)

The `processCards` function writes two files instead of one:

1. `data/dist/columns.json` — all fields except `art_crop_thumb_hashes` and `card_thumb_hashes`.
2. `data/dist/thumb-hashes.json` — `{ art_crop: string[], card: string[] }`.

The thumb hash arrays are built the same way as today (from manifests keyed by scryfall ID). They are just written to a separate file.

### ETL restore changes (`etl/src/restore.ts`)

The restore command currently reconstructs ThumbHash manifests from `columns.json`. After the split, thumb hashes live in `thumb-hashes.json`. The restore command fetches both files from the deployed site:

1. `<site-url>/columns.json` — for `scryfall_ids`.
2. `<site-url>/thumb-hashes.json` — for the thumb hash arrays.

The `scryfall_ids` from `columns.json` are paired with the arrays from `thumb-hashes.json` to reconstruct the manifests. If `thumb-hashes.json` is unavailable (first deploy after split), the restore falls back to reading thumb hash columns from `columns.json` if present (backward compatibility).

### CLI impact

The CLI (`cli/src/index.ts`) reads `data/dist/columns.json` directly and constructs a `CardIndex`. Since `CardIndex` never accesses thumb hash fields, the CLI works without changes. The optional thumb hash fields on `ColumnarData` are simply undefined.

### Fetch URL resolution

The worker resolves `columns.json` relative to its own location: `new URL('../<filename>', import.meta.url)`. This works because Vite places the worker in `assets/` and the data files at the deploy root.

The main thread resolves `thumb-hashes.json` differently — it is not a module, so `import.meta.url` points to the JS bundle in `assets/`. Using `new URL('./<filename>', location.href)` resolves relative to the page URL (the deploy root), which is where the data files live. In dev mode, both files are served at the root by the Vite middleware.

## Migration

### First deploy after the split

The first deploy produces both `columns.json` (without thumb hashes) and `thumb-hashes.json`. The previous deployment's `columns.json` still contains thumb hashes inline. The restore command's backward-compatible fallback handles this: if `thumb-hashes.json` is not available from the site, it reads thumb hashes from the fetched `columns.json`.

After one successful deploy, both files exist at stable URLs and the fallback is no longer exercised.

### PWA cache transition

Users with the pre-split `columns.<hash>.json` cached will receive a new service worker on the next visit. The new service worker precaches the new app shell, and the runtime cache naturally picks up the new, smaller `columns.<hash>.json` and the new `thumb-hashes.<hash>.json`. The old cached entry expires per the existing 30-day TTL.

## Acceptance Criteria

1. `npm run etl -- process` produces both `data/dist/columns.json` (without thumb hash columns) and `data/dist/thumb-hashes.json`.
2. `thumb-hashes.json` contains `art_crop` and `card` arrays aligned by face-row index.
3. The app becomes searchable after loading `columns.json` only — before `thumb-hashes.json` arrives.
4. Art crop and card image components show gradients initially, then fade in thumb hash placeholders when the supplemental file loads.
5. `npm run build -w app` copies both files (hashed and stable names) to `app/dist/`.
6. The PWA service worker caches both data files via runtime CacheFirst.
7. The restore command reconstructs manifests from the deployed `thumb-hashes.json` + `columns.json`, with backward-compatible fallback to the pre-split format.
8. The CLI continues to work with `columns.json` that lacks thumb hash columns.
9. `ColumnarData.art_crop_thumb_hashes` and `ColumnarData.card_thumb_hashes` are optional (`?`) on the type.
