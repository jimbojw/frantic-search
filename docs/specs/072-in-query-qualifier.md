# Spec 072: in: Query Qualifier

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), Spec 068 (game:), ADR-017 (Dual-Domain Query Evaluation)

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

| Operator | Semantics |
|----------|-----------|
| `:`, `=` | Card has ≥1 printing matching the value |
| `!=`     | Card has no printing matching the value |

### Value disambiguation

Check in order: **game** → **set** → **rarity** → **language** (unsupported) → **unknown**.

1. **Game**: `paper`, `mtgo`, `arena`, `astral`, `sega` (via `GAME_NAMES`)
2. **Set code**: value is in `knownSetCodes` (case-insensitive)
3. **Rarity**: `common`, `uncommon`, `rare`, `mythic`, `special`, `bonus` (via `RARITY_NAMES`; `bonus` is a distinct tier above mythic, not an alias for `special`)
4. **Language**: known but unsupported (e.g. `ru`, `zhs`, `japanese`) → return `unsupported in value "ru"`
5. **Unknown**: none of the above → return `unknown in value "foo"`

### Error handling

- `in:ru` (language) → `unsupported in value "ru"` — we know what it means but don't support it
- `in:foo` (unrecognized) → `unknown in value "foo"`
- Both produce error nodes in the AST (Spec 039 pattern)

## Implementation

### Field registration

- Add `in: "in"` to `FIELD_ALIASES` in `eval-leaves.ts`
- Add `"in"` to `PRINTING_FIELDS` in `eval-printing.ts`

### evalPrintingField case for `in`

New case in `evalPrintingField()` that dispatches by value type:

```typescript
case "in": {
  const val = valLower;
  // 1. Game
  if (GAME_NAMES[val] !== undefined) {
    for (let i = 0; i < n; i++) {
      const g = pIdx.games[i] ?? 0;
      const match = (op === ":" || op === "=") ? (g & GAME_NAMES[val]) !== 0
        : op === "!=" ? (g & GAME_NAMES[val]) === 0 : false;
      if (match) buf[i] = 1;
    }
    break;
  }
  // 2. Set code
  if (pIdx.knownSetCodes.has(val)) {
    for (let i = 0; i < n; i++) {
      if (pIdx.setCodesLower[i] === val) buf[i] = 1;
    }
    break;
  }
  // 3. Rarity (bonus is distinct tier, in RARITY_NAMES)
  const rarityBit = RARITY_NAMES[val];
  if (rarityBit !== undefined) {
    for (let i = 0; i < n; i++) {
      const match = (op === ":" || op === "=") ? (pIdx.rarity[i] & rarityBit) !== 0
        : op === "!=" ? (pIdx.rarity[i] & rarityBit) === 0 : false;
      if (match) buf[i] = 1;
    }
    break;
  }
  // 4. Language (unsupported)
  if (KNOWN_LANGUAGES.has(val)) return `unsupported in value "${val}"`;
  // 5. Unknown
  return `unknown in value "${val}"`;
}
```

`KNOWN_LANGUAGES` is a small set of Scryfall language codes we explicitly reject with "unsupported" (e.g. `ru`, `zhs`, `japanese`, `en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `zhs`, `zht`, `ru`). Minimal set for common cases is fine.

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
