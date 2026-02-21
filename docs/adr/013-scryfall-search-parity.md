# ADR-013: Scryfall Search Parity

**Status:** Accepted

## Context

Frantic Search uses Scryfall's oracle-cards bulk data as its card source and implements Scryfall-compatible query syntax. During development, we observed that our search results sometimes differ from Scryfall's default search results. For example, a query like `t:/legend.*elf/ power>=2` returns 144 results locally versus Scryfall's 127. The differences fall into categories like:

- **Specialize variants** (Alchemy digital-only mechanic): Scryfall's bulk data includes these as separate oracle entries, but Scryfall's search hides them, showing only the base card.
- **Playtest and event cards** (`set_type: "funny"`): Present in the bulk data but excluded from Scryfall's default search.
- **Name formatting**: Our results display the front face name for multi-face cards; Scryfall displays the joined "Front // Back" name.

Each of these represents a Scryfall UX decision about result aggregation and presentation, not a difference in query evaluation.

## Decision

Frantic Search matches Scryfall's **query syntax and per-face evaluation semantics** but does not aim for strict parity with Scryfall's **result aggregation and filtering**.

Specifically:

1. **We include all cards from the oracle-cards bulk file** that pass our layout filter (art_series, tokens, emblems, and other non-searchable layouts are excluded per ADR-012). We do not apply additional exclusion based on set type, digital status, game availability, or legality status.
2. **Our results may be a superset of Scryfall's.** A query may return cards that Scryfall's default search hides — Specialize variants, playtest cards, crossover cards, etc. These are not false positives; they are accurate matches against real card data.
3. **We handle discrepancies case-by-case.** If a specific category of results causes user confusion, we address it individually rather than trying to reverse-engineer Scryfall's aggregation logic wholesale.
4. **User-facing filtering is a future app concern.** When the app UI is built, settings like "hide digital-only cards" or "hide cards not legal in any format" may be offered to bring default behavior closer to Scryfall for users who want that. The query engine and data pipeline remain inclusive.

## Rationale

Our goal is fast, thorough, debuggable search. We match Scryfall's default behavior as much as we can because it serves this user need — not because strict parity is a goal in itself. Scryfall's result aggregation involves undocumented heuristics (e.g., hiding Specialize variants, suppressing playtest cards) that are difficult to replicate faithfully and may change without notice. Investing in reproducing those heuristics yields diminishing returns compared to investing in search speed, correctness, and the query debugger UX.

## Consequences

- **Positive:** The data pipeline and query engine remain simple — no special-casing for Scryfall's deduplication rules.
- **Positive:** Users can find cards that Scryfall hides by default, which may be useful for casual play, collection tracking, or curiosity.
- **Positive:** Future app-level filtering can be added without changing the engine or data model.
- **Negative:** Result counts will not match Scryfall exactly for some queries. Users familiar with Scryfall may notice extra results.
- **Negative:** No single "source of truth" for expected result counts — validation against Scryfall requires understanding the known divergences.
