# ADR-006: ETL Tooling Strategy

**Status:** Accepted

## Context

The ETL pipeline has multiple steps: downloading data from Scryfall, transforming it into a compact binary format, and compressing the output. These steps need to be individually runnable (e.g., re-download without rebuilding, or rebuild without re-downloading).

## Decision

Build the ETL as a **single CLI tool with subcommands** rather than a collection of independent scripts.

- Entry point: `etl/src/index.ts`
- Invoked via: `npm run etl -- <command> [options]`
- Subcommands: `download`, `build`, etc.

## Rationale

- A single CLI provides a unified `--help` and shared configuration (e.g., data directory paths, verbosity).
- Avoids cluttering `package.json` with numerous script entries.
- Easy to extend with new subcommands as the pipeline evolves.

## Consequences

- **Positive:** Discoverability — `npm run etl -- --help` lists all available commands.
- **Positive:** Shared options (like `--data-dir` or `--verbose`) are defined once.
- **Negative:** Requires a CLI framework dependency (e.g., `cac` or `commander`).
