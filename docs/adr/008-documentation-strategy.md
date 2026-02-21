# ADR-008: Documentation Strategy

**Status:** Accepted

## Context

This project uses Architecture Decision Records (ADRs) to document significant decisions. However, ADRs capture *why* a decision was made — they do not describe *how* a feature should be built.

We need a complementary format for planning and documenting the design of specific features and subsystems before (and during) implementation.

## Decision

Adopt a two-tier documentation strategy using **ADRs** and **Specs**, both stored in the repository under `docs/`.

### ADRs (`docs/adr/`)

Architecture Decision Records document **cross-cutting decisions** that affect the project's structure, tooling, or conventions.

- **Scope:** Broad. "What technology do we use?" "How do we deploy?" "How do we document?"
- **Lifecycle:** Essentially immutable once accepted. If a decision is reversed, the original ADR is marked `Superseded by ADR-XXX` and a new ADR explains the change.
- **Format:** Context, Decision, Consequences.
- **Examples:** Choice of SolidJS, use of npm workspaces, CBOR data format.

### Specs (`docs/specs/`)

Specs document the **design of a specific feature or subsystem**. They are the blueprint that precedes (and then accompanies) implementation.

- **Scope:** Narrow. "How does the download command work?" "What is the card search algorithm?"
- **Lifecycle:** Mutable. Updated as the feature evolves (see below).
- **Format:** Goal, Requirements, Technical Details, Acceptance Criteria.
- **Examples:** ETL download command, search index structure, card data schema.

### When to Use Which

| Question | Use |
|---|---|
| "Should we use CBOR or JSON?" | ADR |
| "How should the download command check for freshness?" | Spec |
| "Should we use a monorepo?" | ADR |
| "What fields should the compressed card object contain?" | Spec |
| "How should we document our work?" | ADR (this one) |

**Rule of thumb:** If the decision is about *choosing between alternatives* with trade-offs, it is an ADR. If it is about *describing how something works* (or will work), it is a Spec.

## Spec Lifecycle

Each spec carries a **Status** line near the top of the document.

### Statuses

| Status | Meaning |
|---|---|
| `Draft` | Design is proposed but not yet implemented. Open to significant changes. |
| `In Progress` | Implementation has started. The spec reflects the current intended design. |
| `Implemented` | Feature is complete. The spec reflects the as-built state. |
| `Superseded by Spec NNN` | A major redesign has replaced this spec. |

### Updating a Spec

- **Small changes** (bug fixes, minor adjustments, new edge cases discovered during implementation): Update the spec in place. No ceremony needed.
- **Significant deviations** from the original plan (e.g., swapped a library, changed the data flow): Update the spec and add an entry to an `## Implementation Notes` section at the bottom, briefly explaining what changed and why.
- **Major overhauls** (e.g., complete rewrite of the feature): Mark the old spec as `Superseded by Spec NNN` and write a new spec with its own number.

### Implementation Notes Section

When an implementation deviates from the original plan, append notes to the bottom of the spec:

```markdown
## Implementation Notes

- 2026-02-20: Switched from `axios` to native `fetch` — Node 22 supports
  streaming natively, removing the need for the dependency.
- 2026-03-01: Added retry logic (3 attempts with exponential backoff) after
  encountering intermittent Scryfall timeouts in CI.
```

This preserves the original design intent while documenting the reality of what was built.

## Consequences

- **Positive:** Planning context lives alongside the code. AI agents (and future contributors) can read a spec to understand a feature without reverse-engineering the implementation.
- **Positive:** Clear separation: ADRs for "why," Specs for "how."
- **Positive:** Specs are living documents — they stay accurate as the code evolves, rather than rotting as a stale design doc in a wiki.
- **Negative:** Maintaining specs requires discipline. If the code changes and the spec is not updated, it becomes misleading.
