# Spec 100: ETL MTGJSON Download

**Status:** Implemented

**GitHub Issue:** [#113](https://github.com/jimbojw/frantic-search/issues/113)

**Depends on:** Spec 001 (ETL Download), Spec 003 (ETL Process)

## Goal

Fetch MTGJSON's AtomicCards dataset and cache it locally for use as an optional enrichment source. The primary use case is EDHREC saltiness scores (`edhrecSaltiness`), which Scryfall does not provide. The output feeds the process command (Spec 003), which joins salt data to the columnar format by `oracle_id`.

## Background

[MTGJSON](https://mtgjson.com/) provides portable JSON formats for Magic: The Gathering data. The AtomicCards dataset contains oracle-like card entities with evergreen properties. Unlike Scryfall's oracle-cards.json, AtomicCards includes optional EDHREC-derived fields:

| Field             | Type     | Description                                                                 |
|-------------------|----------|-----------------------------------------------------------------------------|
| `edhrecSaltiness` | `number` | EDHREC saltiness score (higher = saltier). Optional; not all cards have it. |
| `edhrecRank`      | `number` | EDHREC Commander popularity rank. Optional. (Scryfall also provides this.)  |

Scryfall does not provide salt scores. MTGJSON's [Card (Atomic) Data Model](https://mtgjson.com/data-models/card/card-atomic/) includes `edhrecSaltiness` (introduced in v5.2.1).

### Join Key

AtomicCards is keyed by card name (`Record<string, CardAtomic[]>`). Each `CardAtomic` has:

| Field                          | Type     | Description                                                                 |
|--------------------------------|----------|-----------------------------------------------------------------------------|
| `identifiers.scryfallOracleId` | `string` | Scryfall oracle UUID — matches `oracle_id` in the columnar data            |
| `edhrecSaltiness`              | `number` | Salt score (optional)                                                       |

For multi-face cards (e.g., Unstable variants), the same name may map to multiple `CardAtomic` entries. Prefer `scryfallOracleId` when joining to match the correct face.

### API Endpoints

| URL                                         | Contents                                                                 |
|---------------------------------------------|--------------------------------------------------------------------------|
| `https://mtgjson.com/api/v5/AtomicCards.json.gz` | Pre-compressed AtomicCards (~34 MiB). Decompress after download.         |
| `https://mtgjson.com/api/v5/Meta.json`      | Build metadata: `date` (ISO 8601), `version`                             |

The uncompressed AtomicCards JSON is ~123 MiB. Using the `.json.gz` variant reduces transfer time and bandwidth.

### Meta.json Schema

```json
{
  "meta": { "date": "2026-03-07", "version": "5.3.0+20260307" },
  "data": { "date": "2026-03-07", "version": "5.3.0+20260307" }
}
```

Use `meta.date` for freshness comparison. It indicates when the MTGJSON build was produced.

## CLI Interface

```
npm run etl -- download-mtgjson [options]
```

### Options

| Flag        | Default | Description                                           |
|-------------|---------|-------------------------------------------------------|
| `--force`   | `false` | Download even if local data is up to date             |
| `--verbose` | `false` | Print detailed progress (metadata check, byte counts) |

## Behavior

```
┌────────────────────────────────────────────────────────────┐
│  Fetch metadata from https://mtgjson.com/api/v5/Meta.json  │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────────────────────────┐
              │ Read local atomic-cards-meta.json          │
              │ Compare meta.date with stored date         │
              └───────────┬────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────────────────────────┐
              │ If remote date > local OR --force:         │
              │ 1. Download AtomicCards.json.gz            │
              │ 2. Decompress to memory or temp file       │
              │ 3. Write atomic-cards.json to data/raw/    │
              │ 4. Write atomic-cards-meta.json            │
              │ Else: log "up to date"                      │
              └───────────────────────────────────────────┘
```

### Freshness Check

Compare `meta.date` from the Meta.json response with the stored value in `atomic-cards-meta.json`. If the remote date is newer (or the metadata file does not exist), proceed with download. The `--force` flag bypasses the check.

**Fallback:** If the Meta.json fetch fails (network error, non-200 status), use a 24-hour mtime heuristic: if `atomic-cards.json` exists and was modified within the last 24 hours, skip the download. This mirrors Spec 091 (tag download) and avoids blocking when MTGJSON's metadata endpoint is temporarily unavailable.

### Download and Decompression

1. Stream the download to a temporary file (e.g., `atomic-cards.json.gz.tmp`).
2. Decompress using Node's `zlib` (e.g., `createGunzip()` + `pipeline`) or equivalent.
3. Write the decompressed JSON to `atomic-cards.json`.
4. Atomically rename or overwrite; clean up the temp file on failure.
5. Write `atomic-cards-meta.json` with `{ "date": "...", "version": "..." }` from the Meta response.

### Output Files

| Path                           | Contents                                                                 |
|--------------------------------|---------------------------------------------------------------------------|
| `data/raw/atomic-cards.json`    | Decompressed AtomicCards JSON (`{ data: Record<string, CardAtomic[]> }`) |
| `data/raw/atomic-cards-meta.json` | `{ "date": "2026-03-07", "version": "5.3.0+20260307" }`               |

## Error Handling

Salt data is optional. The process command (Spec 003) handles missing AtomicCards gracefully — all salt values are `null` when the file is absent. The download command must **never block CI**.

| Failure mode                          | Behavior                                                                 |
|---------------------------------------|---------------------------------------------------------------------------|
| **Network error** (timeout, DNS, etc.) | Log warning, exit 0. Existing cached files (if any) are preserved.        |
| **Non-200 HTTP status** (404, 500)    | Log warning with status code, exit 0. Existing cached files preserved.    |
| **Meta.json fetch fails**             | Fall back to 24h mtime heuristic. If file is stale or missing, attempt download. On download failure, exit 0. |
| **Decompression failure**             | Log warning, delete partial file, exit 0. Existing cached file preserved.|
| **No cached file and download failed**| Log warning, exit 0. Process command will emit all-null salt column.      |

The command always exits 0. This matches Spec 091 (tag download): optional enrichment data must not block deployment.

## Paths

New constants in `etl/src/paths.ts`:

```typescript
export const ATOMIC_CARDS_PATH = path.join(RAW_DIR, "atomic-cards.json");
export const ATOMIC_CARDS_META_PATH = path.join(RAW_DIR, "atomic-cards-meta.json");
```

## File Organization

```
etl/src/
├── download-mtgjson.ts    # New: MTGJSON download logic
├── index.ts              # Updated: register download-mtgjson subcommand
└── paths.ts              # Updated: ATOMIC_CARDS_PATH, ATOMIC_CARDS_META_PATH
```

The MTGJSON download logic lives in a separate module because it uses a different API, freshness mechanism, and error semantics than the Scryfall download.

## Data Directory

```
data/
├── raw/
│   ├── oracle-cards.json
│   ├── default-cards.json
│   ├── atomic-cards.json         # New (MTGJSON)
│   ├── atomic-cards-meta.json   # New (MTGJSON freshness)
│   ├── meta.json
│   ├── default-cards-meta.json
│   └── ...
└── dist/
```

Both files are git-ignored (they live under `data/raw/`).

## CI Integration

Add a step to the deploy workflow (`.github/workflows/deploy.yml`) after the Scryfall download:

```yaml
- name: Download MTGJSON AtomicCards
  run: npm run etl -- download-mtgjson --verbose
```

No separate cache step is needed. The existing `data/raw` cache (Scryfall data) includes all of `data/raw/`, so `atomic-cards.json` and `atomic-cards-meta.json` are cached automatically. If the MTGJSON download fails, the restore step will use the previous run's cached files (if any).

## Dependencies

| Package | Purpose                                        |
|---------|------------------------------------------------|
| `cac`   | CLI framework (already used)                   |
| `axios` | HTTP client (already used)                     |
| `zlib`  | Node built-in; decompress `.json.gz`           |

No new npm dependencies. Node's `zlib` module handles gzip decompression.

## Downstream Usage

The process command (Spec 003) will be updated to:

1. Optionally load `atomic-cards.json` if present.
2. Build `Map<oracle_id, edhrecSaltiness>` from the MTGJSON data.
3. Add `edhrec_salts: (number | null)[]` to the columnar output.
4. In `pushFaceRow`, look up `card.oracle_id` in the salt map; push value or `null`.
5. If the file is missing, push `null` for all rows.

See Issue #113 and the future EDHREC Salt Support spec for the full vertical.

## Acceptance Criteria

1. Running `npm run etl -- download-mtgjson` for the first time downloads `AtomicCards.json.gz`, decompresses it, writes `atomic-cards.json` and `atomic-cards-meta.json` to `data/raw/`.
2. Running it again (without `--force`) when Meta indicates current data logs "up to date" and skips downloading.
3. Running with `--force` always downloads and overwrites, regardless of freshness.
4. If the Meta.json fetch fails, the 24h mtime fallback is used; if the file is stale or missing, download is attempted.
5. On any download or decompression failure, the command logs a warning and exits 0. Existing cached files are not overwritten.
6. A partial download does not leave a corrupted JSON file behind (temp files are cleaned up).
7. All output goes to `stderr` (logs); `stdout` remains clean.
8. The deploy workflow includes the download-mtgjson step; failures do not block deployment.
