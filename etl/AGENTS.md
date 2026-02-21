# etl/ — Agent Instructions

This workspace is a CLI tool that fetches MTG card data from the Scryfall API and transforms it into the compact columnar format consumed by the app. See **Spec 001** (`docs/specs/001-etl-download.md`) for the download command design.

## Commands

```
npm run etl -- download [--force] [--verbose]   # fetch Oracle Cards from Scryfall
npm run etl -- process                           # transform raw data → columnar JSON
npm run etl -- --help                            # list all commands
```

## Important: Network Access

The `download` command makes HTTP requests to `api.scryfall.com` and `data.scryfall.io`. Do not run it without the user's knowledge — it downloads ~161 MB of data and is subject to Scryfall's rate limits and terms of use.

## Data Directory

Output goes to `data/` at the **project root** (not inside `etl/`), since the app's build step also reads from it.

| Path                             | Contents                                     |
|----------------------------------|----------------------------------------------|
| `data/raw/oracle-cards.json`     | Full Oracle Cards JSON array from Scryfall   |
| `data/raw/meta.json`             | Freshness metadata (timestamps, URIs)        |
| `data/intermediate/columns.json` | Columnar format consumed by the query engine |

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
