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

- TypeScript everywhere. The project is fully ESM (`"type": "module"` in every `package.json`).
- Shared code is imported via workspace resolution: `@frantic-search/shared`.
- Bitmask constants live in `shared/src/bits.ts` and are the single source of truth for encoding/decoding.
- SPDX license headers (`// SPDX-License-Identifier: Apache-2.0`) on source files.

## Data Directory

The `data/` directory lives at the project root (not inside any workspace). It is git-ignored.

```
data/
├── raw/              # Scryfall bulk downloads (oracle-cards.json, meta.json)
└── intermediate/     # Processed columnar data (columns.json)
```

To populate it: `npm run etl -- download` then `npm run etl -- process`.
