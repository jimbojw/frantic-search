# cli/ — Agent Instructions

This workspace provides command-line tools for parsing and evaluating Scryfall-style queries. It exists for development, debugging, and scripting — it is not user-facing. See ADR-011 for why it is separate from `etl/`.

## Commands

```
npm run cli -- parse <query>                     # print AST as JSON
npm run cli -- search <query>                    # evaluate against card dataset
npm run cli -- search <query> --output names     # print matching card names
npm run cli -- search <query> --output cards     # print full card JSON
npm run cli -- --help
```

The `search` command requires processed data. Run `npm run etl -- download` and `npm run etl -- process` first if `data/intermediate/columns.json` does not exist.

## Dependencies

Minimal by design — only `@frantic-search/shared` (for the query engine) and `cac` (CLI framework). No network dependencies.

## Output Conventions

- All log messages go to `stderr`. `stdout` is reserved for structured output (JSON, card names) so it can be piped through tools like `jq`.
- The process handles `EPIPE` gracefully (exits cleanly when piped to `head`, etc.).
