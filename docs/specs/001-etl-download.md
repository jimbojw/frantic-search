# Spec 001: ETL Download Command

**Status:** Implemented

## Goal

Reliably fetch the latest Oracle Cards and Default Cards bulk datasets from Scryfall and cache them locally, avoiding redundant downloads.

## Background

Scryfall provides a metadata endpoint at `https://api.scryfall.com/bulk-data` that returns a JSON list of available bulk data files. Each entry includes:

| Field             | Example                                                       | Notes                                  |
|-------------------|---------------------------------------------------------------|----------------------------------------|
| `type`            | `"oracle_cards"` or `"default_cards"`                         | Identifies the dataset                 |
| `updated_at`      | `"2026-02-16T22:03:22.113+00:00"`                            | ISO 8601 timestamp of last update      |
| `download_uri`    | `"https://data.scryfall.io/..."`                              | Direct download URL                    |
| `size`            | `168836725`                                                   | Uncompressed size in bytes             |
| `content_encoding`| `"gzip"`                                                      | The download is served gzip-compressed |

The download command fetches two bulk types:

| Bulk type       | Entries   | Approx. size | Contents                                      |
|-----------------|-----------|--------------|-----------------------------------------------|
| `oracle_cards`  | ~27,000   | ~161 MB      | One card object per unique Oracle ID          |
| `default_cards` | ~80–90k   | ~350 MB      | One entry per English-language printing       |

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

### Streaming Download

Files are large (oracle ~161 MB, default ~350 MB uncompressed). To avoid buffering in memory:

1. Use a streaming HTTP client (e.g., `axios` with `responseType: 'stream'`).
2. Pipe the response to a temporary file, then rename atomically to the final path.
3. Scryfall serves with `content_encoding: gzip`; the client auto-decompresses, so the file on disk is full JSON.

### Output Files

| Path                              | Contents                                                                     |
|-----------------------------------|-------------------------------------------------------------------------------|
| `data/raw/oracle-cards.json`      | The full Oracle Cards JSON array from Scryfall                               |
| `data/raw/default-cards.json`     | The full Default Cards JSON array from Scryfall                               |
| `data/raw/meta.json`              | `{ "updated_at": "...", "download_uri": "...", "size": ..., "type": "..." }` for oracle_cards |
| `data/raw/default-cards-meta.json`| Same shape, for default_cards                                                 |

## Error Handling

- **Network failure during metadata fetch:** Log error, exit non-zero.
- **Network failure during download:** Clean up partial file (delete incomplete `.json.tmp`), log error, exit non-zero.
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

1. Running `npm run etl -- download` for the first time downloads both `oracle-cards.json` and `default-cards.json`, and writes their respective metadata files.
2. Running it again (without `--force`) prints "up to date" for each file that is current and skips downloading.
3. Running with `--force` always downloads both files, regardless of freshness.
4. A partial download (e.g., killed mid-stream) does not leave a corrupted JSON file behind (temporary files are cleaned up).
5. All output goes to `stderr` (logs) so that `stdout` remains clean for potential piping.

## Implementation Notes

- 2026-03-04: Added `default_cards` bulk download (Spec 046). The command now fetches both oracle-cards.json and default-cards.json sequentially, each with its own freshness check and metadata file.
