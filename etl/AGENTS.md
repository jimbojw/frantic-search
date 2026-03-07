# etl/ — Agent Instructions

This workspace is a CLI tool that fetches MTG card data from the Scryfall API and transforms it into the compact columnar format consumed by the app. See **Spec 001** (`docs/specs/001-etl-download.md`) for the download command design.

## Commands

```
npm run etl -- download [--force] [--verbose]   # fetch Oracle Cards from Scryfall
npm run etl -- download-tags [--force] [--verbose]  # fetch oracle/illustration tags (Spec 091)
npm run etl -- process                           # transform raw data → columnar JSON
npm run etl -- --help                            # list all commands
```

## Important: Network Access

The `download` and `download-tags` commands make HTTP requests to `api.scryfall.com` and `data.scryfall.io`. Do not run them without the user's knowledge — they download significant data and are subject to Scryfall's rate limits and terms of use.

## Data Directory

Output goes to `data/` at the **project root** (not inside `etl/`), since the app's build step also reads from it.

| Path                             | Contents                                     |
|----------------------------------|----------------------------------------------|
| `data/raw/oracle-cards.json`     | Full Oracle Cards JSON array from Scryfall   |
| `data/raw/oracle-tags.json`      | Oracle tags from Scryfall (Spec 091)         |
| `data/raw/illustration-tags.json` | Illustration tags from Scryfall (Spec 091) |
| `data/raw/meta.json`             | Freshness metadata (timestamps, URIs)        |
| `data/dist/columns.json`         | Columnar format consumed by the query engine |

## Dependencies

| Package | Purpose                              |
|---------|--------------------------------------|
| `cac`   | CLI framework (subcommands, flags)   |
| `axios` | HTTP client with streaming support   |
| `zod`   | Scryfall API response validation     |
| `tsx`   | TypeScript execution (dev)           |

## Adding a New Subcommand

1. Create a new file in `etl/src/` for the command logic.
2. Register it in `etl/src/index.ts` using the `cac` API.
3. If the command has a non-trivial design, write or update a spec in `docs/specs/` before implementing.
