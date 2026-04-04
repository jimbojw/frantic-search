# Spec 068: game: Query Qualifier

**Status:** Implemented

**Depends on:** Spec 047 (Printing Query Fields), Spec 182 (prefix union / exact / `!=` alignment with **`frame:`**), ADR-007 (Bit-packed data), ADR-017 (Dual-domain query evaluation), ADR-022 (Categorical field operators)

**GitHub Issue:** [#68](https://github.com/jimbojw/frantic-search/issues/68)

## Goal

Support the `game:` query qualifier to filter printings by game availability (paper, mtgo, arena, astral, sega). Matches Scryfall semantics: `game:arena` returns cards with at least one Arena-available printing.

## Scope

- **Printing-domain only.** The `games` field is per-printing in Scryfall's Default Cards bulk data. The card-level ETL (process.ts) reads oracle-cards.json and does not extract `games`; it is extracted only in process-printings from default-cards.json.
- **Out of scope:** The `in:` qualifier (card-level game availability) is a separate workstream.

## Semantics

Normative operator split: **[Spec 182](182-prefix-union-format-frame-in-collector.md)** / [ADR-022](../adr/022-categorical-field-operators.md) (same convention as **`frame:`**).

| Operator | Semantics |
|----------|-----------|
| `:` | **Prefix union** after Spec 103 **`normalizeForResolution`**: OR **`GAME_NAMES`** bits for every vocabulary key whose normalized form **starts with** **`u`**. A printing matches when **`(games[i] & combinedBit) !== 0`**. |
| `=` | **Exact match:** OR bits for keys with **`normalizeForResolution(key) === u`**. |
| `!=` | **Frantic extension:** negation of **`game=`** only — a printing matches when **`(games[i] & combinedBit) === 0`**, where **`combinedBit`** is built exactly as for **`=`** (not as for **`:`**). |

Values: `paper`, `mtgo`, `arena`, `astral`, `sega` (per [Scryfall API](https://scryfall.com/docs/api/cards) Print Fields).

Examples: `game:arena`, `game:paper`, `game:mtgo`, `game:a` (prefix **`:`** ORs **arena** and **astral**), `game=arena` (exact).

**Empty value:** After trim, **`:`**, **`=`**, and **`!=`** with an empty value are **neutral** (all printings match in the leaf), consistent with Spec 182 / **`frame:`**.

**Unknown token:** Non-empty trimmed value with **no** vocabulary match under the active operator → **`unknown game "<trimmed value>"`** (passthrough, Spec 039).

**Spec 103:** **Query evaluation** does **not** call **`resolveForField`** for **`:`** / **`=`** / **`!=`** semantic matching; the AST operator selects prefix vs exact vs **`!=`**. **`resolveForField("game", …)`** remains for **canonicalize** when unique-prefix collapse applies.

## Bitmask Encoding (ADR-007)

| Game   | Bit |
|--------|-----|
| paper  | 1   |
| mtgo   | 2   |
| arena  | 4   |
| astral | 8   |
| sega   | 16  |

Evaluation: for **`:`** / **`=`**, match when **`(games[i] & combinedBit) !== 0`**; for **`!=`**, match when **`(games[i] & combinedBit) === 0`** ( **`combinedBit`** from exact **`=`** only).

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
5. `game:a` with **`:`** ORs **arena** and **astral** (normalized keys starting with **`a`**); **`game=arena`** matches Arena only; **`game=a`** yields **`unknown game`** (no exact key **`a`**).
6. Unknown value (e.g. `game:xyz`) produces error: `unknown game "xyz"`.
7. `t:creature game:arena` (cross-domain AND) returns creatures with Arena printings.
8. Scryfall outlinks pass `game:` through unchanged.
9. Empty **`game:`** / **`game=`** / **`game!=`** (trimmed empty) do not narrow the printing leaf (neutral / all printings match).
