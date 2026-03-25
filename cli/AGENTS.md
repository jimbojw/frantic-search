# cli/ — Agent Instructions

This workspace provides command-line tools for parsing and evaluating Scryfall-style queries. It exists for development, debugging, and scripting — it is not user-facing. See ADR-011 for why it is separate from `etl/`.

## Commands

```
npm run cli -- parse <query>                     # print AST as JSON
npm run cli -- search <query>                    # evaluate against card dataset
npm run cli -- search <query> --output names     # print matching card names
npm run cli -- search <query> --output cards     # print full card JSON
npm run cli -- search "my:list" --list=-         # run my:list with deck list from stdin
npm run cli -- diff "<query>"                    # compare local vs Scryfall results
npm run cli -- diff "<query>" --quiet            # compact output (IDs only)
npm run cli -- list-diff "<query>" --list <path> # compare list vs search for my:list
npm run cli -- list-diff "<query>" --list=- -q  # list from stdin, quiet output
npm run cli -- --help
```

The `search` command requires processed data. Run `npm run etl -- download` and `npm run etl -- process` first if `data/dist/columns.json` does not exist.

**Supplemental evaluation data (same as the app worker):** From the parent directory of `--data` (default `data/dist/`), the CLI also loads `otags.json`, `atags.json`, `flavor-index.json`, and `artist-index.json` when present. `atags.json` requires `printings.json`. `kw:` / `keyword:` use `keywords_index` embedded in `columns.json`. Run `npm run etl -- download-tags` before `process` if you need oracle/illustration tags. Flags: `--no-supplemental` skips the four JSON files; `--otags`, `--atags`, `--flavor-index`, `--artist-index` override paths. These apply to `search`, `diff`, `list-diff`, and `compliance` (local mode).

## Dependencies

Minimal by design — only `@frantic-search/shared` (for the query engine) and `cac` (CLI framework). No network dependencies.

## Output Conventions

- All log messages go to `stderr`. `stdout` is reserved for structured output (JSON, card names) so it can be piped through tools like `jq`.
- The process handles `EPIPE` gracefully (exits cleanly when piped to `head`, etc.).
