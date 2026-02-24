# ADR-012: Face-Per-Row Data Model

**Status:** Accepted

## Context

The columnar dataset produced by the ETL pipeline originally used one row per card. This worked for single-face cards but produced incomplete data for multi-face layouts:

- **Transform and modal DFCs** (~500 cards): Scryfall puts `oracle_text`, `mana_cost`, `power`, `toughness`, `colors`, and other fields exclusively on `card_faces`, not at the card's top level. The ETL read top-level fields and stored empty/zero values for these cards.
- **Adventure, split, and flip cards** (~300 cards): `oracle_text` was face-only. Other fields like `power` and `colors` were available at the top level but didn't represent the full picture.

Beyond missing data, Scryfall evaluates queries per-face: all conditions in a query must be satisfiable on the same face for the card to match. For example, a transform DFC with a 3/3 front face and a 4/4 back face does not match `power>=4 toughness<=2` because neither individual face satisfies both conditions. A card-per-row model cannot replicate this behavior without per-face columns or complex special-casing in the evaluator.

Three approaches were considered:

1. **Merge face data in the ETL** (concatenate oracle texts, union colors, pick front-face power). Simple but lossy — numeric comparisons on merged power/toughness can't match Scryfall's per-face semantics.
2. **Face-per-row**: emit one row per face, with metadata to link faces back to cards. The evaluator operates identically over face rows; a thin deduplication step collapses results.
3. **Dual-column approach**: keep one row per card but add separate columns for each face's fields. Doubles the column count and requires evaluator changes to check both columns at each leaf.

## Decision

Adopt the **face-per-row** model (option 2).

Each face of a multi-face card becomes its own row in the columnar data. Two metadata columns support result deduplication:

- `card_index`: maps each face row back to its position in the raw `oracle-cards.json` array.
- `canonical_face`: maps each face row to the face-row index of the card's primary (front) face.

Card-level properties (legalities, color identity) are duplicated across all faces of the same card.

Non-searchable layouts (`art_series`, `token`, `double_faced_token`, `emblem`, `planar`, `scheme`, `vanguard`, `augment`, `host`) are filtered out during ETL processing.

Multi-face layouts that produce multiple rows: `transform`, `modal_dfc`, `adventure`, `split`, `flip`.

## Consequences

- **Positive:** Every face has its own `name`, `type_line`, `oracle_text`, `mana_cost`, `power`, `toughness`, `colors`, etc. No missing data.
- **Positive:** The evaluator requires no changes to its core logic — it scans face rows identically to how it scanned card rows. Boolean AND/OR/NOT and the buffer pool are untouched.
- **Positive:** ~~Per-face evaluation matches Scryfall's documented behavior: conditions must be satisfiable on the same face.~~ **Corrected by Spec 033:** Empirical testing showed Scryfall promotes each leaf to card level (any face matches → card matches), then combines with AND/OR/NOT. The evaluator now writes matches to canonical face slots, giving card-level semantics.
- **Positive:** Filtering non-searchable layouts reduces total row count despite the face expansion (~33–34k face rows vs ~36.7k cards previously).
- **Negative:** Card-level fields (legalities, color identity) are duplicated across faces of the same card, slightly increasing data size for multi-face cards.
- ~~**Negative:** Callers must deduplicate face-level results to avoid showing the same card twice.~~ Resolved by Spec 033: the evaluator only sets canonical face slots, so results are inherently deduplicated.
- ~~**Negative:** The `matchCount` in `EvalResult` nodes reflects face-level matches, not card-level.~~ Resolved by Spec 033: `matchCount` now reflects card count.
