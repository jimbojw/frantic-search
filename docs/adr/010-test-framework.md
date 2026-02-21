# ADR-010: Test Framework

**Status:** Accepted

## Context

The project has no test infrastructure. Every workspace has a stub `"test"` script that exits with an error. With the query engine (ADR-009) about to be implemented in `shared/`, we need a test runner that works across all three workspaces (`shared`, `etl`, `app`).

Requirements:

- Native TypeScript and ESM support (the project is fully ESM, see ADR-002).
- Fast iteration during development (watch mode, selective re-runs).
- No extra build or transpilation step before running tests.
- Works in Node.js (for `shared` and `etl`) and can integrate with browser/DOM testing later (for `app`).

## Decision

Use **Vitest** as the test framework for all workspaces.

Each workspace defines its own `vitest.config.ts` if needed, and its `package.json` `"test"` script invokes `vitest run`. The root `package.json` `"test"` script runs tests across all workspaces via `npm test --workspaces`.

## Alternatives Considered

### Jest

The most widely used JS test framework. However, Jest's ESM support is still flagged as experimental, and running TypeScript requires either a transform plugin (`ts-jest`) or a SWC-based preset. This adds configuration overhead that Vitest avoids entirely.

### Node.js built-in test runner (`node:test`)

Available since Node 18 and stable in Node 22 (our runtime). Zero dependencies. However, it lacks watch mode with HMR, has no built-in coverage integration, and its assertion library is minimal compared to Vitest's Chai-based `expect`. It also cannot reuse Vite's module resolution and transform pipeline, which matters for testing code that will run in the Vite-bundled app.

## Consequences

- **Positive:** Vitest reuses Vite's config and transform pipeline, so TypeScript, ESM, and path resolution work identically in tests and production — no "works in tests but breaks in build" surprises.
- **Positive:** Watch mode with instant HMR re-runs makes test-driven development of the parser practical.
- **Positive:** Single dependency (`vitest`) covers runner, assertions, coverage, and mocking.
- **Negative:** Adds a dev dependency to each workspace. Acceptable given the alternative is no testing at all.
