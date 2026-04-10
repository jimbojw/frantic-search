# ADR-022: Categorical field operators (`:` / `=` / empty / `!=`)

**Status:** Accepted

## Context

Frantic Search evaluates Scryfall-style queries on every keystroke. Many filters draw values from a **closed or indexed vocabulary** (formats, sets, frames, keywords, tags) or from **normalized row strings** (set code, collector number). Scryfall’s syntax reference often treats **`:`** and **`=`** as interchangeable for those filters; observed API behavior is not always identical to the docs.

We need a **single documented policy** so that:

- **Well-formed** queries stay aligned with Scryfall where that is the project goal ([ADR-019](019-scryfall-parity-by-default.md)).
- **In-progress** queries remain usable (narrow-as-you-type) without spurious empty results or hard failures for a bare `field:` or `field=`.
- **Frantic-only** extensions (notably **`!=`**) have one meaning everywhere they appear.

**Scryfall contrast (whitespace after the operator).** Scryfall does not treat `⟨field⟩⟨operator⟩` followed by whitespace as an empty-valued field clause in the same way Frantic does. In typical Scryfall normalization, that pattern does not bind a value to the field; it devolves into separate bare tokens (for example the field name matching card names), not “field filter with empty value.” Frantic Search intentionally uses **adjacent** operator–value binding ([Spec 002](../specs/002-query-engine.md)); this ADR defines product behavior for **empty values that the Frantic parser produces** as `FIELD` nodes.

Individual **specs** remain the normative, testable source for each field. This ADR records **cross-cutting operator semantics** those specs should follow unless they document an explicit **exception** (with rationale).

## Decision

1. **Scryfall-first for correct queries.** For values Scryfall documents as exact or unambiguous, prefer **documented** semantics, and prefer **observed** behavior when it matches the docs. When documentation and behavior disagree, follow [ADR-019](019-scryfall-parity-by-default.md) (do not treat undocumented Scryfall quirks as parity targets).

2. **Empty values — open clause vs committed mistake.**

   - **Open for input (forgiving).** When a recognized **`FIELD`** node has an **empty** value on **`:`** or **`=`** and the clause is still **open** — the user has typed the operator but not yet bound a value and has not “closed” the clause — the term must **not** narrow the result set (same as a no-op for filtering: all-match / passthrough). Operationally: the empty-valued field term is the **last** term in the query **and** there is **no whitespace** (including newline) between the operator and end of input. Mechanism is implementation-defined (all-match buffer, passthrough-elided error nodes per [Spec 039](../specs/039-non-destructive-error-handling.md), etc.).

   - **Committed empty (error UX).** If an empty-valued **FIELD** node is **not** in that open position — there is **whitespace** (including newline) between the operator and end of input, **or** there is **another term** after the clause (e.g. `kw: otag` parses as an empty `kw:` plus a following atom) — the term must still **not** narrow the result set (no spurious empty results), but it must surface as a **query error** in the UI (e.g. error styling, squiggle) so the user can fix the mistake quickly.

   - **No empty-value narrowing.** An empty value on **`:`** or **`=`** must **never** apply a special subset filter (no “match only cards that have any tag,” “match only mana producers,” etc.). Discoverability for those ideas belongs in **non-empty** prefix queries, suggestions, or docs — not in bare `field:`.

   How “open vs committed” is detected from spans and source text is implementation-defined; specs and tests pin observable behavior.

3. **Non-empty `=` — strict equality; errors, not silent zero-hits.** **`=`** means **normalized exact match** per the field spec (typically after `normalizeForResolution` in [Spec 103](../specs/103-categorical-field-value-auto-resolution.md)). If nothing matches exactly, the leaf returns an **error** suitable for passthrough where applicable — **not** a silent all-zero match — unless the field spec documents a deliberate exception. **`otag`** / **`atag`** use **tag-normalized** full keys ([Spec 174](../specs/174-otag-atag-prefix-query-semantics.md) **`normalizeForTagResolution`**), not the same string as generic **`normalizeForResolution`** on hyphenated slugs.

4. **Non-empty `:` — prefix union for discoverability.** **`:`** means **prefix union** after the same normalization: every candidate whose normalized form **starts with** the normalized user value contributes (**OR**). If **no** candidate matches, the leaf returns an **error** (same broad family as (3)) — unless the field spec documents a deliberate exception (e.g. historical silent zero-hit for some tag fields). **`otag`** / **`atag`** are a **field-spec exception**: **`:`** uses **boundary-aligned prefix union** per [Spec 174](../specs/174-otag-atag-prefix-query-semantics.md), not full-string **`startsWith`** on **`normalizeForResolution`**-stripped text (hyphens must remain load-bearing for tag slugs).

5. **Intentional exceptions.** Any deviation from (2)–(4) must be **stated in the field spec** with rationale. Example: **non-vocabulary** string semantics (e.g. substring **`artist:`** per [Spec 149](../specs/149-artist-evaluator.md)).

6. **`!=` — Frantic extension: negation of exact `=`.** Where **`!=`** is supported, it negates the **positive mask built for `=`** (exact normalized match), **not** the positive mask for **`:`** (prefix union). Excluding a prefix-union predicate uses AST **`NOT`** / unary **`-`**. User-facing deltas vs Scryfall belong in reference docs (e.g. `app` Scryfall differences) when Scryfall does not document **`!=`** for that field.

## Relationship to other documentation

- **[ADR-019](019-scryfall-parity-by-default.md)** — default **result** parity with Scryfall. This ADR adds **operator-level** policy for categorical-style fields; it does not change ADR-019’s scope.
- **[Spec 103](../specs/103-categorical-field-value-auto-resolution.md)** — unique-prefix **`resolveForField`** for **canonicalize** and other non-eval consumers; **evaluation** for migrated fields uses this ADR’s **`:`** / **`=`** split as specified per field.

## Consequences

- **Positive:** One place to answer “what should `:` vs `=` mean?” when adding or migrating a field.
- **Positive:** Specs can stay shorter by citing this ADR and documenting only field-specific details and exceptions.
- **Positive:** Users get immediate visual feedback when they hit whitespace or add another term after an empty field clause, without the results suddenly going empty.
- **Negative:** Fields that historically diverged (silent zero-hit, equivalent **`:`** / **`=`**) need explicit spec amendments to align or to remain **documented** exceptions under (5).
- **Negative:** Parser, evaluator, and query UI must agree on **open vs committed** classification for empty `FIELD` nodes.
- **Negative:** Compliance and diff tooling remain about **Scryfall parity**; Frantic-only operator rules and this empty-value UX still require spec and docs maintenance.

## History

- **2026-04-10:** Parser-level operator aliases (`=>` / `=<` / `==`) and invalid colon–comparison composites (`:>` / `:<` / `:=`) are normative in [Spec 002](../specs/002-query-engine.md); invalid composites always evaluate as errors ([GitHub #255](https://github.com/jimbojw/frantic-search/issues/255)).
- **2026-04-10:** Clarified §3–§4: **`otag`** / **`atag`** use [Spec 174](../specs/174-otag-atag-prefix-query-semantics.md) tag normalization and boundary-aligned **`:`** matching ([GitHub #253](https://github.com/jimbojw/frantic-search/issues/253)).
- **2026-04-05:** Reworked §2 (empty values): open-clause forgiveness vs committed-empty error UX; explicit ban on empty-value subset filters; noted Scryfall whitespace contrast ([GitHub #260](https://github.com/jimbojw/frantic-search/issues/260)).
