# Frantic Search — Agent Instructions

You are the implementer. The user guides architecture and reviews output but does not write code. Make decisions, write code, and proceed — don't ask for permission on routine implementation choices.

## Project Overview

Frantic Search is an instant, client-side search engine for Magic: The Gathering cards. A SolidJS SPA runs the query engine in a WebWorker so the UI stays responsive while filtering ~30,000 cards on every keystroke.

This is an **npm workspaces monorepo** with four packages:

| Workspace  | Purpose                                              | Run with                |
|------------|------------------------------------------------------|-------------------------|
| `app/`     | SolidJS frontend SPA (Vite)                          | `npm run dev`           |
| `cli/`     | Command-line query tools                             | `npm run cli -- <cmd>`  |
| `etl/`     | Scryfall data pipeline (download + transform)        | `npm run etl -- <cmd>`  |
| `shared/`  | Types, constants, and query engine used by all above | (library, not runnable) |

Install everything from the repo root:

```
npm install
```

First-time setup (installs deps + downloads and processes card data):

```
npm run setup
```

## Before You Write Code

1. Read the ADRs in `docs/adr/` to understand architectural constraints. Start with `docs/adr/008-documentation-strategy.md` — it explains how this project uses ADRs (decisions) and Specs (feature designs).
2. Check `docs/specs/` for a spec covering the feature you're working on. If one exists, follow it. If one doesn't, propose one before implementing.
3. Check `docs/guides/` for operational guides relevant to your task (e.g., comparing search results against Scryfall). Read these as needed, not upfront.

## Development Process

- **Use TDD for algorithmic code.** Write a failing test, then write the code to make it pass. This applies especially to parsers, evaluators, and data transformations in `shared/`.
- **Build incrementally.** One test case, one feature, verify, repeat. Don't implement in a single pass.
- **Keep specs accurate.** If your implementation deviates from a spec, update the spec (see ADR-008 § "Updating a Spec").

## Testing

The test framework is Vitest (ADR-010). Tests live alongside source files as `.test.ts` siblings.

| Scope              | Command                                                    |
|--------------------|------------------------------------------------------------|
| Single workspace   | `npm test -w shared`                                       |
| Single test file   | `npm test -w shared -- src/search/lexer.test.ts`           |
| Pattern match      | `npm test -w shared -- -t "trailing operator"`             |

## Key Architectural Decisions

These are the most important ADRs. Read them in full before making changes in the relevant area.

- **ADR-007** — Bit-packed data representation. Colors, types, legalities are bitmasks, not strings.
- **ADR-009** — Bitmask-per-node AST query engine. The parser, evaluator, and query debugger UX all operate on a single AST where each node owns a `Uint8Array`.
- **ADR-003** — Client-side architecture. Search runs in a WebWorker, not the main thread.
- **ADR-005** — Data transfer format. JSON (gzip-compressed by the host), not CBOR.

## Code Conventions

- **Commit messages:** Use Conventional Commits (ADR-021). Format: `type(scope): description`. Common types: `fix`, `feat`, `docs`, `perf`, `refactor`, `test`.
- TypeScript everywhere. The project is fully ESM (`"type": "module"` in every `package.json`).
- Shared code is imported via workspace resolution: `@frantic-search/shared`.
- Bitmask constants live in `shared/src/bits.ts` and are the single source of truth for encoding/decoding.
- SPDX license headers (`// SPDX-License-Identifier: Apache-2.0`) on source files.
- Query pipeline code uses pre-allocated `Uint8Array`/`Uint32Array` buffers — no `Set`, no `push()`. See `shared/AGENTS.md` § "Key Design Constraints" for details.

## Data Directory

The `data/` directory lives at the project root (not inside any workspace). It is git-ignored.

```
data/
├── raw/              # Scryfall bulk downloads (oracle-cards.json, meta.json)
└── dist/             # Processed columnar data (columns.json)
```

To populate it: `npm run etl -- download` then `npm run etl -- process`.

## Cursor Cloud specific instructions

- **No background services required.** This is a fully client-side SPA — no databases, Docker, or backend servers to start.
- **Data pipeline must run before the app or CLI search commands work.** The `data/` directory is git-ignored and must be populated each session. Run `npm run setup` (which chains install + all ETL downloads + process), or run the steps individually: `npm run etl -- download`, `npm run etl -- download-tags`, `npm run etl -- download-mtgjson`, then `npm run etl -- process`. The downloads total ~700 MB and processing takes ~30 seconds. The processed output lands in `data/dist/columns.json` (plus `printings.json`, `otags.json`, `atags.json`, `thumb-hashes.json`).
- **Dev server:** `npm run dev` starts Vite on port 5173 with HMR. Do not run `npm run build` during development sessions.
- **Lint/typecheck:** `npm run typecheck` runs `tsc --noEmit` across all four workspaces.
- **Tests:** `npm test` runs typecheck + Vitest in `shared`, `app`, and `etl`, then `npm run cli -- compliance`. All tests are pure unit tests and do not require the data pipeline.
- **Node.js 22** is required (per `.nvmrc`).
