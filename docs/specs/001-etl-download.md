# Spec 001: ETL Download Command

**Status:** Implemented

## Goal

Reliably fetch the latest Oracle Cards and Default Cards bulk datasets from Scryfall and cache them locally, avoiding redundant downloads.

## Background

Scryfall provides a metadata endpoint at `https://api.scryfall.com/bulk-data` that returns a JSON list of available bulk data files. Each entry includes:

| Field                 | Example                                                       | Notes                                      |
|-----------------------|---------------------------------------------------------------|--------------------------------------------|
| `type`                | `"oracle_cards"` or `"default_cards"`                         | Identifies the dataset                     |
| `updated_at`          | `"2026-08-03T21:03:39.498+00:00"`                            | ISO 8601 timestamp of last update          |
| `jsonl_download_uri`  | `"https://data.scryfall.io/.../oracle-cards-....jsonl.gz"`   | Direct download URL for gzipped JSONL file |
| `compressed_size`     | `24443680`                                                    | Gzipped file size in bytes                 |

Scryfall retired the legacy bulk format (plain JSON with `download_uri`, `size`, and streaming gzip decompression by the HTTP client) on **July 20, 2026**. Bulk files are now pre-gzipped JSONL (`.jsonl.gz`).

The download command fetches two bulk types:

| Bulk type       | Entries   | Approx. uncompressed size | Contents                                      |
|-----------------|-----------|---------------------------|-----------------------------------------------|
| `oracle_cards`  | ~27,000   | ~161 MB                   | One card object per unique Oracle ID          |
| `default_cards` | ~80–90k   | ~350 MB                   | One entry per English-language printing       |

Oracle cards feed the face-level columnar data (Spec 003). Default cards feed the printing-level data (Spec 046).

## CLI Interface

```
npm run etl -- download [options]
```

### Options

| Flag        | Default | Description                                           |
|-------------|---------|-------------------------------------------------------|
| `--force`   | `false` | Download even if local data is up to date             |
| `--verbose` | `false` | Print detailed progress (metadata check, byte counts) |

## Behavior

```
┌─────────────────────────────────────────────────────────┐
│  Fetch metadata from https://api.scryfall.com/bulk-data │
│  (single HTTP request for both bulk types)              │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────────────────────────┐
              │ Find oracle_cards and default_cards entries │
              └───────────┬────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────────────────────────┐
              │ For each bulk type (oracle, then default):  │
              │ 1. Read local metadata (meta.json or       │
              │    default-cards-meta.json)                │
              │ 2. If remote updated_at > local OR         │
              │    --force: stream download to disk        │
              │ 3. Else: log "up to date"                 │
              └───────────────────────────────────────────┘
```

### Freshness Check

Each bulk type has its own metadata file. Compare `updated_at` from the Scryfall API with the stored value. If the remote timestamp is newer (or the metadata file does not exist), proceed with download. The `--force` flag bypasses the check for both files.

When reading local metadata, accept both the current shape (`jsonl_download_uri`, `compressed_size`) and the legacy pre-migration shape (`download_uri`, `size`) so that machines with cached metadata from before July 2026 still pass freshness checks via `updated_at`. New downloads always write the current shape.

### Streaming Download

Files are large (oracle ~161 MB, default ~350 MB uncompressed). To avoid buffering in memory:

1. Use a streaming HTTP client (`axios` with `responseType: 'stream'`) to fetch the pre-gzipped `.jsonl.gz` file.
2. Pipe through Node's `createGunzip()` to decompress locally (same pattern as Spec 100 / `download-mtgjson.ts`).
3. Convert JSONL (one JSON object per line) to a JSON array **streaming** via `readline`: write `[`, each non-empty line separated by `,`, then `]`.
4. Write to a temporary file (`*.json.tmp`), then rename atomically to the final path.

The on-disk output remains a plain JSON array (`[...]`) so downstream processors (Spec 003, Spec 046) require no changes.

### Output Files

| Path                              | Contents                                                                     |
|-----------------------------------|-------------------------------------------------------------------------------|
| `data/raw/oracle-cards.json`      | The full Oracle Cards JSON array from Scryfall                               |
| `data/raw/default-cards.json`     | The full Default Cards JSON array from Scryfall                               |
| `data/raw/meta.json`              | `{ "updated_at": "...", "jsonl_download_uri": "...", "compressed_size": ..., "type": "..." }` for oracle_cards |
| `data/raw/default-cards-meta.json`| Same shape, for default_cards                                                 |

## Error Handling

- **Network failure during metadata fetch:** Log error, exit non-zero.
- **Network failure during download:** Clean up partial file (delete incomplete `.json.tmp`), log error, exit non-zero.
- **JSONL conversion failure (invalid line, gunzip error):** Clean up partial file, log error, exit non-zero.
- **Scryfall API returns no `oracle_cards` or `default_cards` entry:** Log error, exit non-zero.
- **Scryfall API response fails schema validation:** Log error with details, exit non-zero.

## Dependencies

| Package | Purpose                                        |
|---------|------------------------------------------------|
| `cac`   | CLI framework (subcommands, flags)             |
| `axios` | HTTP client with streaming support             |
| `zod`   | Validate Scryfall API response shape           |

## Data Directory

The `data/` directory lives at the **project root** (not inside `etl/`), since the built artifacts will later be consumed by the `app/` build step.

```
data/
├── raw/                     # Scryfall downloads
│   ├── oracle-cards.json
│   ├── default-cards.json
│   ├── meta.json
│   └── default-cards-meta.json
└── dist/                    # Processed artifacts (Spec 003, Spec 046)
```

Both `data/raw/` and `data/dist/` should be git-ignored.

## Acceptance Criteria

1. Running `npm run etl -- download` for the first time downloads both `oracle-cards.json` and `default-cards.json` as valid JSON arrays, and writes their respective metadata files.
2. Running it again (without `--force`) prints "up to date" for each file that is current and skips downloading.
3. Running with `--force` always downloads both files, regardless of freshness.
4. A partial download (e.g., killed mid-stream) does not leave a corrupted JSON file behind (temporary files are cleaned up).
5. All output goes to `stderr` (logs) so that `stdout` remains clean for potential piping.
6. On-disk output format is unchanged: JSON arrays at the same paths, consumable by Spec 003 and Spec 046 without modification.

## Implementation Notes

- 2026-03-04: Added `default_cards` bulk download (Spec 046). The command now fetches both oracle-cards.json and default-cards.json sequentially, each with its own freshness check and metadata file.
- 2026-08-03: Migrated to Scryfall's JSONL bulk format (Issue #268). Scryfall retired `download_uri`/`size` on July 20, 2026; bulk files are now pre-gzipped JSONL downloaded via `jsonl_download_uri`. The ETL gunzips locally and converts JSONL to JSON arrays at download time to preserve the downstream contract. Metadata fetch is now a single HTTP request for both bulk types.
