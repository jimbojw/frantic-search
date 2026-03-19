# ADR-021: Conventional Commits

**Status:** Accepted

## Context

Commit messages are the primary record of what changed and why. Inconsistent formats make history harder to scan, automate, and use for changelogs. The project already uses a type-prefixed style (`fix:`, `feat:`, `docs:`) in practice; we should document it as the standard.

## Decision

Use **Conventional Commits** for all commit messages:

- Format: `type(scope): description`
- Common types: `fix`, `feat`, `docs`, `perf`, `refactor`, `test`
- Scope is optional when the change spans multiple areas or is obvious from the description.
- Body and footer are optional; use when the change warrants explanation or references.

## Consequences

- **Positive:** Consistent, machine-parseable history. Changelog generation and tooling (e.g. semantic-release) work out of the box.
- **Positive:** Clear intent at a glance: type signals whether a change is a fix, feature, or documentation.
- **Neutral:** Contributors must learn the format; it is widely adopted and well-documented.
