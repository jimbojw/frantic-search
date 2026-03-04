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
6. **Discrepancy details:** List specific cards in the "Only" categories. Default: include card name, set, and collector number. `--quiet` shows only comparison keys.

## Technical Details

- Uses `toScryfallQuery(parse(query))` to produce the Scryfall query string.
- Reuses rate limiting (50–100ms between requests) and retry logic from the compliance suite.
- Treats Scryfall 404 as zero results per `docs/guides/scryfall-comparison.md`.
- Local results are normalized through parity semantics before comparison:
  - default playable filter (`include:extras` bypass),
  - printing-derived card-set behavior for printing-condition queries (Spec 057),
  - `unique:cards` / `unique:prints` / `unique:art` display-mode shaping.
- Comparison key mode is query-aware:
  - `unique:prints` → compare by printing Scryfall ID.
  - `unique:cards` → compare by oracle ID (avoids false diffs from representative-printing choice).
  - `unique:art` → compare by per-oracle art-variant counts (avoids false diffs from differing representative printings for the same artwork).

## Acceptance Criteria

- [x] `npm run cli -- diff "t:creature unique:prints"` runs and outputs summary.
- [x] Output includes In Both, Only in Frantic Search, Only in Scryfall counts.
- [x] Discrepancy section lists cards with name, set, collector number by default.
- [x] `--quiet` shows only comparison keys for discrepancies.
- [x] `--data` and `--printings` override data paths.
