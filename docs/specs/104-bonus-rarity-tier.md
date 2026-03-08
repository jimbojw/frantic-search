# Spec 104: Bonus Rarity Tier

**Status:** Draft

**Depends on:** Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), Spec 072 (in: Query Qualifier)

## Goal

Add `bonus` as a distinct rarity tier **above mythic** to match Scryfall's semantics. Currently Frantic Search maps `bonus` to `special`, but Scryfall treats them as separate: `rarity=bonus rarity>mythic` finds 9 cards; `rarity=bonus rarity<=mythic` finds 0.

## Background

Scryfall defines `bonus` as a rarity tier superior to mythic (e.g. Secret Lair bonus cards). Frantic Search currently:

- Maps `in:bonus` to `Rarity.Special` in `eval-printing.ts`
- Does not include `bonus` in `RARITY_FROM_STRING`, so ETL encodes bonus printings as `0` (no bits set)
- Has no `bonus` in `RARITY_NAMES` for `rarity:` queries

This spec corrects the data model and evaluator to treat `bonus` as its own tier.

## Design

### 1. Bit allocation

Add a 6th rarity bit:

| Bit | Value | Order |
|-----|-------|-------|
| 0 | common | 0 |
| 1 | uncommon | 1 |
| 2 | rare | 2 |
| 3 | special | 3 |
| 4 | mythic | 4 |
| 5 | **bonus** | **5** |

`RARITY_ORDER`: common(0) < uncommon(1) < rare(2) < special(3) < mythic(4) < **bonus(5)**.

### 2. Changes to `shared/src/bits.ts`

```typescript
export const Rarity = {
  Common: 1 << 0,
  Uncommon: 1 << 1,
  Rare: 1 << 2,
  Mythic: 1 << 3,
  Special: 1 << 4,
  Bonus: 1 << 5,  // NEW
} as const;

export const RARITY_FROM_STRING: Record<string, number> = {
  common: Rarity.Common,
  uncommon: Rarity.Uncommon,
  rare: Rarity.Rare,
  mythic: Rarity.Mythic,
  special: Rarity.Special,
  bonus: Rarity.Bonus,  // NEW
};

export const RARITY_NAMES: Record<string, number> = {
  common: Rarity.Common, c: Rarity.Common,
  uncommon: Rarity.Uncommon, u: Rarity.Uncommon,
  rare: Rarity.Rare, r: Rarity.Rare,
  mythic: Rarity.Mythic, m: Rarity.Mythic,
  special: Rarity.Special, s: Rarity.Special,
  bonus: Rarity.Bonus, b: Rarity.Bonus,  // NEW
};

export const RARITY_ORDER: Record<number, number> = {
  [Rarity.Common]: 0,
  [Rarity.Uncommon]: 1,
  [Rarity.Rare]: 2,
  [Rarity.Special]: 3,
  [Rarity.Mythic]: 4,
  [Rarity.Bonus]: 5,  // NEW
};
```

### 3. ETL

No code change. `encodeRarity` uses `RARITY_FROM_STRING`; once `bonus` is added, Scryfall's `"bonus"` rarity will encode to `Rarity.Bonus` automatically.

### 4. Evaluator (`shared/src/search/eval-printing.ts`)

Remove the `bonus` → `special` special case in the `in:` case:

```typescript
// Before:
const rarityBit = RARITY_NAMES[valLower] ?? (valLower === "bonus" ? Rarity.Special : undefined);

// After:
const rarityBit = RARITY_NAMES[valLower];
```

`bonus` will now be in `RARITY_NAMES` and resolve normally.

### 5. App display (`app/src/app-utils.ts`)

Add to `RARITY_LABELS`:

```typescript
[Rarity.Bonus]: 'Bonus',
```

### 6. Documentation updates

- **Spec 046** — Rarity bitmask: add bit 5 = bonus
- **Spec 047** — Rarity values: add `bonus`, `b`; update ordinal ordering
- **Spec 072** — `in:` rarity: `bonus` is a distinct value, not an alias for `special`
- **ADR-007** — Rarity: 5 values → 6 values

## Scope of changes

| File | Change |
|------|--------|
| `shared/src/bits.ts` | Add `Rarity.Bonus`, update `RARITY_FROM_STRING`, `RARITY_NAMES`, `RARITY_ORDER` |
| `shared/src/search/eval-printing.ts` | Remove `bonus` → `special` hack in `in:` case |
| `app/src/app-utils.ts` | Add `Rarity.Bonus` to `RARITY_LABELS` |
| `docs/specs/046-printing-data-model.md` | Add bonus to rarity bitmask table |
| `docs/specs/047-printing-query-fields.md` | Add bonus to rarity values and ordering |
| `docs/specs/072-in-query-qualifier.md` | Update bonus description |
| `docs/adr/007-bit-packed-data-representation.md` | 5 → 6 rarity values |

## Acceptance criteria

1. `rarity:bonus` and `r:bonus` match printings with bonus rarity.
2. `rarity>mythic` includes bonus-rarity printings.
3. `rarity=bonus rarity>mythic` returns the same cards as Scryfall (9 cards as of 2026-03).
4. `in:bonus` matches cards with at least one bonus-rarity printing.
5. Bonus printings display as "Bonus" in the UI.
6. `buildRarityMask` in eval-printing correctly handles bonus for all comparison operators.
