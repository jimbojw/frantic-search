# Spec 001: ETL Download Command

**Status:** Draft

## Goal

Reliably fetch the latest "Oracle Cards" bulk dataset from Scryfall and cache it locally, avoiding redundant downloads.

## Background

Scryfall provides a metadata endpoint at `https://api.scryfall.com/bulk-data` that returns a JSON list of available bulk data files. Each entry includes:

| Field             | Example                                                       | Notes                                  |
|-------------------|---------------------------------------------------------------|----------------------------------------|
| `type`            | `"oracle_cards"`                                              | Identifies the dataset                 |
| `updated_at`      | `"2026-02-16T22:03:22.113+00:00"`                            | ISO 8601 timestamp of last update      |
| `download_uri`    | `"https://data.scryfall.io/oracle-cards/oracle-cards-...json"`| Direct download URL                    |
| `size`            | `168836725`                                                   | Uncompressed size in bytes (~161 MB)   |
| `content_encoding`| `"gzip"`                                                      | The download is served gzip-compressed |

We want the `oracle_cards` entry specifically. This contains one card object per unique Oracle ID (~27,000 cards).

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
              ┌────────────────────────┐
              │ Find oracle_cards entry │
              └───────────┬────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │ Read local metadata   │
              │ (data/raw/meta.json)  │
              └───────────┬───────────┘
                          │
               ┌──────────┴──────────┐
               │ Is local up to date │
               │ AND --force is off? │
               └──────────┬──────────┘
                     ╱          ╲
                   Yes           No
                   ╱              ╲
          ┌───────────────┐  ┌──────────────────────────────┐
          │ Log: up to    │  │ Stream download_uri to disk   │
          │ date, exit 0  │  │ -> data/raw/oracle-cards.json │
          └───────────────┘  └──────────────┬───────────────┘
                                            │
                                            ▼
                              ┌──────────────────────────┐
                              │ Write data/raw/meta.json │
                              │ (updated_at, uri, size)  │
                              └──────────────────────────┘
```

### Freshness Check

Compare `updated_at` from the Scryfall API response with `updated_at` stored in `data/raw/meta.json`. If the remote timestamp is newer (or `meta.json` does not exist), proceed with download.

### Streaming Download

The file is ~161 MB uncompressed. To avoid buffering the entire response in memory:

1. Use a streaming HTTP client (e.g., `axios` with `responseType: 'stream'`).
2. Pipe the response directly to a write stream at `data/raw/oracle-cards.json`.
3. Note: Scryfall serves this with `content_encoding: gzip`. Axios/Node will auto-decompress, so the file on disk will be the full JSON.

### Output Files

| Path                         | Contents                                                                    |
|------------------------------|-----------------------------------------------------------------------------|
| `data/raw/oracle-cards.json` | The full Oracle Cards JSON array from Scryfall                              |
| `data/raw/meta.json`         | `{ "updated_at": "...", "download_uri": "...", "size": ..., "type": "..." }`|

## Error Handling

- **Network failure during metadata fetch:** Log error, exit non-zero.
- **Network failure during download:** Clean up partial file (delete incomplete `oracle-cards.json`), log error, exit non-zero.
- **Scryfall API returns no `oracle_cards` entry:** Log error, exit non-zero.
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
├── raw/                # Scryfall downloads
│   ├── oracle-cards.json
│   └── meta.json
└── dist/               # Processed artifacts (future: build command)
```

Both `data/raw/` and `data/dist/` should be git-ignored.

## Acceptance Criteria

1. Running `npm run etl -- download` for the first time downloads `oracle-cards.json` and writes `meta.json`.
2. Running it again (without `--force`) prints "Up to date" and exits without downloading.
3. Running with `--force` always downloads, regardless of freshness.
4. A partial download (e.g., killed mid-stream) does not leave a corrupted `oracle-cards.json` behind.
5. All output goes to `stderr` (logs) so that `stdout` remains clean for potential piping.
