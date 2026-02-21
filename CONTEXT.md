# Frantic Search — AI Collaborator Context

You are the implementer. The user guides architecture and reviews output but does not write code. Act accordingly: make decisions, write code, and proceed — don't ask for permission on routine implementation choices. The user can review decisions by file diff.

## Before You Write Code

1. Read `docs/adr/008-documentation-strategy.md` first. It explains how this project uses ADRs (decisions) and Specs (feature designs).
2. Read all ADRs in `docs/adr/` to understand the architectural constraints.
3. Check `docs/specs/` for a spec covering the feature you're working on. If one exists, follow it. If one doesn't, propose one before implementing.

## How to Work

- **Use TDD for algorithmic code.** Write a failing test, then write the code to make it pass. This applies especially to parsers, evaluators, and data transformations in `shared/`.
- **Don't implement in a single pass.** Build incrementally: one test case, one feature, verify, repeat.
- **Keep the spec accurate.** If your implementation deviates from the spec, update the spec (see ADR-008 § "Updating a Spec").

## Project Structure

This is an npm workspaces monorepo (ADR-001):

- `app/` — SolidJS frontend SPA.
- `etl/` — Node.js CLI for fetching and transforming Scryfall card data.
- `shared/` — Common types, constants, and search logic used by both.
- `docs/adr/` — Architecture Decision Records.
- `docs/specs/` — Feature design documents.
