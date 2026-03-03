# Spec 068: game: Query Qualifier

**Status:** Implemented

**Depends on:** Spec 047 (Printing Query Fields), ADR-007 (Bit-packed data), ADR-017 (Dual-domain query evaluation)

**GitHub Issue:** [#68](https://github.com/jimbojw/frantic-search/issues/68)

## Goal

Support the `game:` query qualifier to filter printings by game availability (paper, mtgo, arena, astral, sega). Matches Scryfall semantics: `game:arena` returns cards with at least one Arena-available printing.

## Scope

- **Printing-domain only.** The `games` field is per-printing in Scryfall's Default Cards bulk data. The card-level ETL (process.ts) reads oracle-cards.json and does not extract `games`; it is extracted only in process-printings from default-cards.json.
- **Out of scope:** The `in:` qualifier (card-level game availability) is a separate workstream.

## Semantics

| Operator | Semantics |
|----------|-----------|
| `:`, `=` | Printing is available in the given game |
| `!=`     | Printing is not available in the given game |

Values: `paper`, `mtgo`, `arena`, `astral`, `sega` (per [Scryfall API](https://scryfall.com/docs/api/cards) Print Fields).

Examples: `game:arena`, `game:paper`, `game:mtgo`

## Bitmask Encoding (ADR-007)

| Game   | Bit |
|--------|-----|
| paper  | 1   |
| mtgo   | 2   |
| arena  | 4   |
| astral | 8   |
| sega   | 16  |

Evaluation: `games[i] & targetBit` for `:` / `=`; `!(games[i] & targetBit)` for `!=`.

## ETL

- **Source:** default-cards.json (per-printing). Each Default Card entry has `games?: string[]`.
- **process-printings.ts:** Add `games` to `DefaultCard` interface; encode via `GAME_NAMES`; emit `games: number[]` column to printings.json.
- **process.ts (card-level):** Does not read default-cards.json. Oracle-cards.json may contain `games`; it is ignored. Games are per-printing only.

## Backward Compatibility

If `games` is missing from printings.json (legacy data), treat as empty array. Rows without game data match nothing for `game:` queries. New ETL runs populate correctly.

## Acceptance Criteria

1. `game:arena` returns cards with at least one Arena-available printing (~14,900 on Scryfall).
2. `game:paper` returns cards with at least one paper printing (nearly all cards).
3. `game:mtgo` returns cards with at least one MTGO printing.
4. `game:astral` and `game:sega` work when those games appear in the data.
5. Unknown value (e.g. `game:xyz`) produces error: `unknown game "xyz"`.
6. `t:creature game:arena` (cross-domain AND) returns creatures with Arena printings.
7. Scryfall outlinks pass `game:` through unchanged.
