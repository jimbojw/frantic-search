# ADR-011: CLI Workspace

**Status:** Accepted

## Context

The query engine (ADR-009) lives in `shared/` and is consumed by the frontend app. We also want a command-line tool for parsing Scryfall queries and inspecting the resulting AST — useful for development, debugging, and scripting (e.g., piping AST JSON through `jq`).

The existing `etl/` workspace is a CLI, but it serves a different purpose: fetching and transforming data from Scryfall. It depends on `axios`, `zod`, and network I/O. The query CLI depends only on the parser from `shared/` and has no network dependencies. Merging them would couple unrelated dependency trees and muddy the purpose of each tool.

## Decision

Add a new **`cli/`** workspace to the monorepo for interactive query tools. It depends on `@frantic-search/shared` and is invoked via `npm run cli --`.

The `etl/` workspace remains unchanged and continues to own data pipeline concerns.

## Consequences

- **Positive:** Clean separation of concerns — `etl/` produces data, `cli/` consumes it.
- **Positive:** The query CLI has a minimal dependency footprint (just `shared` + a CLI framework + `tsx`).
- **Negative:** A fourth workspace adds a small amount of monorepo overhead (one more `package.json`, one more tsconfig).
