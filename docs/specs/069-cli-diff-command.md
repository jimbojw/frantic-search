# Spec 069: CLI `diff` Subcommand

**Status:** Implemented

## Goal

Add a `diff` subcommand to the CLI that compares local Frantic Search results against the Scryfall API for any given query, enabling automated verification and debugging of search accuracy.

## Requirements

1. **Syntax:** `frantic-search diff "<query>"` (or `npm run cli -- diff "<query>"`).
2. **Local execution:** Run the query through the Frantic Search engine (same as `search`).
3. **Scryfall execution:** Run the canonical query against Scryfall's search API with full pagination.
4. **Comparison:** Compare results by Scryfall ID to correctly handle `unique:prints`, `unique:art`, and printing-level queries.
5. **Output:** Summary with three counts — In Both, Only in Frantic Search, Only in Scryfall.
6. **Discrepancy details:** List specific cards in the "Only" categories. Default: include card name, set, and collector number. `--quiet` shows only Scryfall IDs.

## Technical Details

- Uses `toScryfallQuery(parse(query))` to produce the Scryfall query string.
- Reuses rate limiting (50–100ms between requests) and retry logic from the compliance suite.
- Treats Scryfall 404 as zero results per `docs/guides/scryfall-comparison.md`.
- When `printingIndices` is present (e.g. `unique:prints`, printing conditions), compares printing-level Scryfall IDs.
- When only face indices, compares oracle-level Scryfall IDs (deduplicated by card).

## Acceptance Criteria

- [x] `npm run cli -- diff "t:creature unique:prints"` runs and outputs summary.
- [x] Output includes In Both, Only in Frantic Search, Only in Scryfall counts.
- [x] Discrepancy section lists cards with name, set, collector number by default.
- [x] `--quiet` shows only Scryfall IDs for discrepancies.
- [x] `--data` and `--printings` override data paths.
