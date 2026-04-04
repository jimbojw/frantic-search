# Spec 072: in: Query Qualifier

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), Spec 068 (game:), Spec 182 (prefix union / exact / `!=` for `in:`), ADR-017 (Dual-Domain Query Evaluation), ADR-022 (Categorical field operators)

**GitHub Issue:** [#69](https://github.com/jimbojw/frantic-search/issues/69)

## Goal

Support the `in:` query qualifier with full parity to Scryfall's semantics for games, set codes, and rarity. `in:` is a **printing-domain** query that promotes to face domain: "Does this card have at least one printing that matches X?"

## Background

Scryfall's `in:` qualifier is overloaded. Disambiguation is by value type:

| Value type   | Example                       | Semantics                                                      |
| ------------ | ----------------------------- | -------------------------------------------------------------- |
| **Game**     | in:paper, in:mtgo, in:arena   | Cards with ≥1 printing available in that game                  |
| **Set code** | in:lea, in:m15, in:war       | Cards that have been printed in that set                       |
| **Rarity**   | in:common, in:rare, in:mythic | Cards that have ever been printed at that rarity               |
| **Language** | in:ru, in:zhs, in:japanese   | Cards printed in that language — **out of scope**              |

Examples:

- `in:arena` — cards playable on Arena
- `in:lea in:m15` — cards in both Alpha and M15
- `in:rare -rarity:rare` — non-rare printings of cards that have been printed at rare
- `-in:mtgo f:legacy` — Legacy-legal cards not on MTGO

## Semantics

Evaluation follows **[Spec 182](182-prefix-union-format-frame-in-collector.md)** §3 (ADR-022 operator policy). **Canonicalize** and other non-eval paths still use **Spec 103** **`resolveForField`** for unique-prefix collapse when exactly one vocabulary candidate matches.

| Operator | Semantics (evaluation) |
|----------|------------------------|
| `:` | **Prefix union** after `normalizeForResolution` on the trimmed value: OR printings that match **any** game key, **any** known set code, or **any** rarity key whose normalized form **starts with** `u` (same `u` for all three namespaces). |
| `=` | **Exact** positive mask only: disambiguate **game** → **set** → **rarity** using **normalized equality** (`=== u`) to keys or set codes; first branch with a match wins (no OR across namespaces for one token). |
| `!=` | **Negation of the `=` exact positive mask** for that value—not negation of a **`:`** prefix union (use **`-`** / **`NOT`** for that). |

**Empty value** (trimmed empty) on **`:`**, **`=`**, and **`!=`**: **neutral** (all printings match in the leaf)—aligned with **`frame:`** / **`kw:`** and ADR-022; do **not** return **`unknown in value`**.

### Unsupported language (exact token)

After empty handling, if the trimmed value (case-insensitive) is a **known unsupported language** token, return **`unsupported in value`** for **`:`**, **`=`**, and **`!=`**—**before** game/set/rarity matching. Examples: `ru`, `zhs`, `japanese` (see implementation list in `eval-printing.ts`).

### Non-empty `:` — vocabulary

If no game, set, or rarity vocabulary entry matches the prefix (and not unsupported language): **`unknown in value`**.

### Non-empty `=` / `!=` — disambiguation order

Check in order: **game** → **set** → **rarity** (normalized exact match to the respective key or set code).

1. **Game**: `paper`, `mtgo`, `arena`, `astral`, `sega` (via `GAME_NAMES`); OR bits if several keys share the same normalized form.
2. **Set code**: `knownSetCodes` with **`normalizeForResolution(code) === u`**
3. **Rarity**: `common`, `uncommon`, `rare`, `mythic`, `special`, `bonus` (via `RARITY_NAMES`; `bonus` is a distinct tier above mythic, not an alias for `special`)
4. **None of the above** (and not language): **`unknown in value`**

### Error handling

- `in:ru` / `in=ru` (language) → `unsupported in value "ru"` — we know what it means but don't support it
- Non-empty value with no vocabulary match under the active operator → `unknown in value "…"`
- Error leaves participate in **Spec 039** passthrough like other categorical fields

## Implementation

### Field registration

- `in: "in"` in `FIELD_ALIASES` in `eval-leaves.ts`
- `"in"` in `PRINTING_FIELDS` in `eval-printing.ts`

### evalPrintingField case for `in`

Implemented in **`eval-printing.ts`**: precomputed **`GAME_IN_NORM_BITS`** / **`RARITY_IN_NORM_BITS`**; **`PrintingIndex.setCodeNormByLower`** for set norms; **no** **`resolveForField`** on the eval path (Spec 182 / Spec 103 split). See source for the full **`:`** / **`=`** / **`!=`** branches.

### Operator support

Only `:`, `=`, and `!=` are supported. Comparison operators (`>`, `<`, etc.) return an error.

## Scope

- **In scope**: games, set codes, rarity
- **Out of scope**: language — return "unsupported" error

## Acceptance Criteria

1. `in:arena` returns cards with at least one Arena-available printing
2. `in:lea` returns cards printed in Alpha
3. `in:rare` returns cards that have ever been printed at rare
4. `in:lea in:m15` returns cards in both Alpha and M15 (AND)
5. `in:rare -rarity:rare` returns non-rare printings of cards printed at rare
6. `-in:mtgo f:legacy` returns Legacy-legal cards not on MTGO
7. `in:ru` produces error: `unsupported in value "ru"`
8. `in:foo` produces error: `unknown in value "foo"`
9. `in:rare` and `r:rare` are distinct: `in:rare` = "card has been printed at rare"; `r:rare` = "printing has rarity rare"

## Implementation Notes

- 2026-03-04: Implemented per Issue #69. `in:` evaluates in printing domain but promotes to face at the leaf level so `in:mh2 in:a25` combines at card level (cards in both sets), not printing level. Evaluator special-cases `canonical === "in"` to promote immediately after evalPrintingField.
- 2026-04-04: Eval semantics amended per **Spec 182** — **`:`** prefix union across games, sets, and rarities; **`=`** exact with game → set → rarity disambiguation; **`!=`** negates **`=`** only; empty operators neutral.
