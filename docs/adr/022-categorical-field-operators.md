# ADR-022: Categorical field operators (`:` / `=` / empty / `!=`)

**Status:** Accepted

## Context

Frantic Search evaluates Scryfall-style queries on every keystroke. Many filters draw values from a **closed or indexed vocabulary** (formats, sets, frames, keywords, tags) or from **normalized row strings** (set code, collector number). Scryfall’s syntax reference often treats **`:`** and **`=`** as interchangeable for those filters; observed API behavior is not always identical to the docs.

We need a **single documented policy** so that:

- **Well-formed** queries stay aligned with Scryfall where that is the project goal ([ADR-019](019-scryfall-parity-by-default.md)).
- **In-progress** queries remain usable (narrow-as-you-type) without spurious empty results or hard failures for a bare `field:` or `field=`.
- **Frantic-only** extensions (notably **`!=`**) have one meaning everywhere they appear.

Individual **specs** remain the normative, testable source for each field. This ADR records **cross-cutting operator semantics** those specs should follow unless they document an explicit **exception** (with rationale).

## Decision

1. **Scryfall-first for correct queries.** For values Scryfall documents as exact or unambiguous, prefer **documented** semantics, and prefer **observed** behavior when it matches the docs. When documentation and behavior disagree, follow [ADR-019](019-scryfall-parity-by-default.md) (do not treat undocumented Scryfall quirks as parity targets).

2. **Empty values — forgive the missing token.** After trim, when the field’s spec defines behavior for an **empty** value on **`:`** or **`=`**, the term must **not** narrow the result set while the user is still typing. Mechanism is implementation-defined (all-match buffer, passthrough-elided error nodes per [Spec 039](../specs/039-non-destructive-error-handling.md), etc.); field specs pin the **observable** outcome.

3. **Non-empty `=` — strict equality; errors, not silent zero-hits.** **`=`** means **normalized exact match** per the field spec (typically after `normalizeForResolution` in [Spec 103](../specs/103-categorical-field-value-auto-resolution.md)). If nothing matches exactly, the leaf returns an **error** suitable for passthrough where applicable — **not** a silent all-zero match — unless the field spec documents a deliberate exception.

4. **Non-empty `:` — prefix union for discoverability.** **`:`** means **prefix union** after the same normalization: every candidate whose normalized form **starts with** the normalized user value contributes (**OR**). If **no** candidate matches, the leaf returns an **error** (same broad family as (3)) — unless the field spec documents a deliberate exception (e.g. historical silent zero-hit for some tag fields).

5. **Intentional exceptions.** Any deviation from (3) or (4) must be **stated in the field spec** with rationale. Example: **non-vocabulary** string semantics (e.g. substring **`artist:`** per [Spec 149](../specs/149-artist-evaluator.md)).

6. **`!=` — Frantic extension: negation of exact `=`.** Where **`!=`** is supported, it negates the **positive mask built for `=`** (exact normalized match), **not** the positive mask for **`:`** (prefix union). Excluding a prefix-union predicate uses AST **`NOT`** / unary **`-`**. User-facing deltas vs Scryfall belong in reference docs (e.g. `app` Scryfall differences) when Scryfall does not document **`!=`** for that field.

## Relationship to other documentation

- **[ADR-019](019-scryfall-parity-by-default.md)** — default **result** parity with Scryfall. This ADR adds **operator-level** policy for categorical-style fields; it does not change ADR-019’s scope.
- **[Spec 103](../specs/103-categorical-field-value-auto-resolution.md)** — unique-prefix **`resolveForField`** for **canonicalize** and other non-eval consumers; **evaluation** for migrated fields uses this ADR’s **`:`** / **`=`** split as specified per field.

## Consequences

- **Positive:** One place to answer “what should `:` vs `=` mean?” when adding or migrating a field.
- **Positive:** Specs can stay shorter by citing this ADR and documenting only field-specific details and exceptions.
- **Negative:** Fields that historically diverged (silent zero-hit, equivalent **`:`** / **`=`**) need explicit spec amendments to align or to remain **documented** exceptions under (5).
- **Negative:** Compliance and diff tooling remain about **Scryfall parity**; Frantic-only operator rules still require spec and docs maintenance.
