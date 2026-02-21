# ADR-001: Monorepo Structure

**Status:** Accepted

## Context

Frantic Search consists of three distinct concerns:

1. A **frontend SPA** (SolidJS + Vite) for end users.
2. An **ETL pipeline** (Node.js) for fetching and transforming MTG card data.
3. **Shared logic and types** (TypeScript library) used by both.

These concerns need to share code (types, search logic, constants) without the overhead of publishing to a package registry.

## Decision

Use **npm workspaces** with three packages at the repository root:

- `app/` — the SolidJS single-page application.
- `etl/` — the data pipeline CLI.
- `shared/` — common types, constants, and logic.

## Consequences

- **Positive:** A single `npm install` resolves all dependencies across packages. Shared code is imported directly via workspace resolution (e.g., `@frantic-search/shared`).
- **Positive:** Atomic commits can span all three packages, keeping them in sync.
- **Negative:** All packages share a single `node_modules` tree at the root, which can occasionally cause version resolution surprises.
