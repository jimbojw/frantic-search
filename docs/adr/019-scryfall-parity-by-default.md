# ADR-019: Scryfall Parity by Default

**Status:** Accepted

**Supersedes:** ADR-013 (Scryfall Search Parity)

## Context

ADR-013 was written early in the project when Frantic Search had no printing data and no default result filtering. At that time, the decision was to include all cards from the bulk data and accept that results would be a superset of Scryfall's. The rationale was that Scryfall's result aggregation involved undocumented heuristics that were difficult to replicate.

Since then, the project has evolved significantly:

- **Printing data model** (Spec 046) and **printing query fields** (Spec 047) give us per-printing evaluation.
- **Default playable filter** (Spec 057) excludes `is:funny` cards and non-tournament printings unless `include:extras` is present — matching Scryfall's default behavior.
- **Printing-level format legality** (Spec 056) filters non-tournament printings (gold-bordered, oversized, 30th Anniversary Edition).
- **Compliance suite** (Spec 035) and **diff command** (Spec 069) provide automated verification against Scryfall's API.
- **Date query semantics** (Spec 061) align with Scryfall for complete values while extending behavior for partial input.

The cumulative effect is that Frantic Search now aims for — and largely achieves — Scryfall parity in default search behavior. ADR-013's stance of "we don't aim for strict parity" no longer reflects reality.

## Decision

Scryfall search behavior is the **default target** for Frantic Search. Specifically:

1. **Match Scryfall's documented syntax and semantics.** For every query that Scryfall's [syntax guide](https://scryfall.com/docs/syntax) documents, Frantic Search should strive to return equivalent results under default conditions.
2. **Match Scryfall's default result filtering.** Non-playable cards (funny, digital-only Specialize variants) and non-tournament printings are excluded by default, consistent with Scryfall. The `include:extras` modifier bypasses this filter.
3. **Diverge only with principled rationale.** When we intentionally differ from Scryfall, the divergence is documented (in a spec, the compliance suite, or the comparison guide) with an explanation of why.
4. **Do not replicate undocumented bugs.** Scryfall behaviors that are inconsistent, undocumented, or appear to be bugs are not targets for parity.

### Principled Divergences

These are intentional differences with documented rationale:

| Divergence | Rationale |
|---|---|
| **`!` as operator synonym** — Scryfall inconsistently treats `!` as `=` for some fields (`ci!ur`) but not others (`set!usg`). We parse `!` as part of a bare word. | Scryfall's behavior is undocumented and inconsistent. See `docs/guides/scryfall-comparison.md`. |
| **Partial date ranges** — `date=202` expands to `[2020-01-01, 2030-01-01)`. Scryfall ignores partial dates as erroneous. | Enables narrow-as-you-type UX. See Spec 061. |
| **DFC name format** — We display the front face name; Scryfall displays the joined `Front // Back` name. | Presentation difference, not an evaluation difference. |

New divergences should follow this pattern: document the Scryfall behavior, explain why we differ, and annotate the compliance suite test case with a `divergence` field.

### Verification

Parity is verified through:

- **Compliance suite** (`npm run cli -- compliance`) — curated test cases with assertions against real card data, optionally verified against Scryfall's API.
- **Diff command** (`npm run cli -- diff "<query>"`) — ad-hoc comparison of any query against Scryfall, reporting discrepancies by Scryfall ID with card names, sets, and collector numbers.
- **Divergence annotations** in compliance YAML — tests for known divergences are annotated so they don't cause false failures.
- **Default-filtering research** — Scryfall’s full default inclusion logic is not fully documented or stable in observation. Ongoing empirical notes, falsified hypotheses, and a repeatable test matrix live in [`docs/research/scryfall-default-result-filtering.md`](../research/scryfall-default-result-filtering.md) ([GitHub #227](https://github.com/jimbojw/frantic-search/issues/227)).

## Consequences

- **Positive:** Clear standard for correctness. When results differ from Scryfall, the default assumption is "our bug" rather than "known divergence."
- **Positive:** The compliance suite and diff tool make parity measurable and regressions detectable.
- **Positive:** Principled divergences are documented and discoverable, not scattered across commit history.
- **Positive:** Users familiar with Scryfall get predictable behavior by default.
- **Negative:** Achieving and maintaining parity requires ongoing effort as Scryfall evolves.
- **Negative:** Some useful results (playtest cards, Specialize variants) are hidden by default — users must know about `include:extras` to find them.
