# Spec 032: The `is:` Operator

**Status:** Draft

**Depends on:** Spec 002 (Query Engine)

## Goal

Support the `is:` operator — Scryfall's catch-all for common query shorthands — by evaluating each keyword against existing columnar data (type lines, oracle text, layouts, and stats).

## Background

Scryfall's [search reference](https://scryfall.com/docs/syntax) uses `is:` over 100 times. The operator covers a grab bag of concepts: game mechanics (`is:spell`, `is:historic`), layout structure (`is:dfc`, `is:split`), creature categorization (`is:vanilla`, `is:bear`), and format eligibility (`is:commander`).

Many `is:` keywords are printing-level attributes (finishes, promo status, frame style, rarity) that don't apply to Frantic Search. Frantic Search indexes oracle cards — abstract card identities — not individual printings. The scope of this spec is limited to keywords that describe **gameplay-relevant properties derivable from existing data**.

### How it parses

The query `is:spell` already lexes and parses correctly under the existing grammar: `WORD("is") COLON WORD("spell")` → `FieldNode { field: "is", operator: ":", value: "spell" }`. The evaluator currently treats `is` as an unknown field (matches nothing). This spec adds evaluation logic for the `is` field, branching on the value.

### Only `:` is meaningful

Unlike color or numeric fields, the `is:` operator only supports `:` (and `=` as a synonym). Comparison operators (`<`, `>`, `<=`, `>=`, `!=`) are not meaningful. Negation is handled at the AST level: `-is:spell` wraps the `FieldNode` in a `NotNode`.

## Supported Keywords

### Type/supertype checks (via `type_lines`)

These perform case-insensitive substring matches against the face's type line, identical to the existing `t:` field logic.

| Keyword | Type line contains | Notes |
|---|---|---|
| `is:permanent` | `Artifact`, `Battle`, `Creature`, `Enchantment`, `Land`, or `Planeswalker` | Union of all permanent types |
| `is:spell` | Inverse: type line does NOT contain `Land` and card is not a `token` layout | Approximate; Scryfall excludes lands from spells |
| `is:historic` | `Artifact`, `Legendary`, or `Saga` | Dominaria mechanic |
| `is:party` | `Cleric`, `Rogue`, `Warrior`, or `Wizard` | ZNR party mechanic (subtypes) |
| `is:outlaw` | `Assassin`, `Mercenary`, `Pirate`, `Rogue`, or `Warlock` | OTJ outlaw mechanic (subtypes) |

### Layout checks (via `layouts`)

These compare the face's layout string directly.

| Keyword | Layout value(s) |
|---|---|
| `is:split` | `split` |
| `is:flip` | `flip` |
| `is:transform` | `transform` |
| `is:modal` | `modal_dfc` |
| `is:mdfc` | `modal_dfc` |
| `is:dfc` | `transform` or `modal_dfc` or `meld` |
| `is:meld` | `meld` |
| `is:adventure` | `adventure` |
| `is:leveler` | `leveler` |

### Oracle text checks

| Keyword | Logic |
|---|---|
| `is:vanilla` | Oracle text is empty (after reminder text stripping, which `CardIndex` already performs) |
| `is:frenchvanilla` | Oracle text, after stripping reminder text, contains only recognized keyword abilities (see § French Vanilla) |
| `is:commander` | Type line contains `Legendary` AND (`Creature` or `Planeswalker`), OR oracle text contains `"can be your commander"` |
| `is:brawler` | Same logic as `is:commander` |
| `is:companion` | Oracle text contains `"Companion —"` |
| `is:partner` | Oracle text contains `"Partner"` as a keyword line (starts with `Partner` at the beginning of the text or after `\n`, not as a substring of another word) |

### Stat checks

| Keyword | Logic |
|---|---|
| `is:bear` | Type line contains `Creature`, AND power = 2, AND toughness = 2, AND mana value = 2 |

### Summary: 21 keywords

`permanent`, `spell`, `historic`, `party`, `outlaw`, `split`, `flip`, `transform`, `modal`, `mdfc`, `dfc`, `meld`, `adventure`, `leveler`, `vanilla`, `frenchvanilla`, `commander`, `brawler`, `companion`, `partner`, `bear`.

Unknown `is:` values match zero cards (consistent with how the evaluator handles unknown fields).

## French Vanilla

A creature is "French vanilla" if its oracle text consists entirely of keyword abilities — no other rules text. After stripping reminder text (which `CardIndex` already does), the remaining text is split by `\n` and each non-empty line is checked against a set of recognized keyword abilities.

### Recognized keywords

The evaluator will maintain a set of evergreen and common keyword abilities:

```
deathtouch, defender, double strike, enchant, equip, first strike,
flash, flying, haste, hexproof, indestructible, intimidate, lifelink,
menace, partner, protection, prowess, reach, shroud, skulk, trample,
vigilance, ward, wither, afflict, annihilator, bushido, cascade,
changeling, convoke, crew, cumulative upkeep, cycling, dash,
devoid, emerge, escape, evoke, exalted, exploit, extort, fabricate,
flanking, flashback, forecast, foretell, frenzy, graft, horsemanship,
kicker, landfall, living weapon, madness, miracle, modular, morph,
mutate, ninjutsu, offering, outlast, persist, phasing, poisonous,
rampage, rebound, reconfigure, regenerate, renown, replicate, retrace,
riot, scavenge, shadow, soulbond, spectacle, split second, storm,
sunburst, surge, suspend, totem armor, training, transfigure,
transmute, tribute, undying, unleash, unearth, vanishing, warding
```

A line matches if it starts with one of these keywords (case-insensitive). This allows parameterized abilities like `"Flying"`, `"Protection from red"`, `"Ward {2}"`, `"Equip {3}"`, or `"Cycling {2}"` to match. Lines that don't start with a keyword disqualify the card.

Empty oracle text does NOT qualify as French vanilla — that's regular `is:vanilla`. The card must also be a creature (type line contains `Creature`).

## Data Requirements

### Existing columns used

| Column | Used by |
|---|---|
| `type_lines` | `permanent`, `spell`, `historic`, `party`, `outlaw`, `commander`, `brawler`, `bear`, `frenchvanilla` |
| `oracle_texts` | `vanilla`, `frenchvanilla`, `commander`, `brawler`, `companion`, `partner` |
| `layouts` | `split`, `flip`, `transform`, `modal`, `mdfc`, `dfc`, `meld`, `adventure`, `leveler`, `spell` |
| `powers` + `power_lookup` | `bear` |
| `toughnesses` + `toughness_lookup` | `bear` |
| `mana_costs` (via mana value) | `bear` |

### CardIndex changes

`CardIndex` currently does not expose the `layouts` column. Add:

```typescript
readonly layouts: string[];
```

Populated directly from `data.layouts` in the constructor — no transformation needed.

### No new columns

All 21 keywords are computable from data already in `ColumnarData`. No ETL changes.

## Evaluator Changes

### Field alias

Add `is` to `FIELD_ALIASES` mapping to itself:

```typescript
is: "is",
```

### Evaluation

Add a `case "is"` branch in `evalLeafField`. The branch switches on `valLower` (the lowercased value) and fills the buffer using the appropriate logic for each keyword. Unknown values fill with 0.

For `:` and `=` operators, the logic is identical. For any other operator, fill with 0 (no match).

### Pseudocode for type-check keywords

```typescript
case "permanent": {
  const types = ["artifact", "battle", "creature", "enchantment", "land", "planeswalker"];
  for (let i = 0; i < n; i++) {
    const tl = index.typeLinesLower[i];
    buf[i] = types.some(t => tl.includes(t)) ? 1 : 0;
  }
  break;
}
```

### Pseudocode for layout keywords

```typescript
case "split":
  for (let i = 0; i < n; i++) buf[i] = index.layouts[i] === "split" ? 1 : 0;
  break;
```

### Pseudocode for `is:bear`

```typescript
case "bear": {
  for (let i = 0; i < n; i++) {
    const isPow2 = Number(index.powerLookup[index.powers[i]]) === 2;
    const isTou2 = Number(index.toughnessLookup[index.toughnesses[i]]) === 2;
    const isCmc2 = index.manaValue[i] === 2;
    const isCreature = index.typeLinesLower[i].includes("creature");
    buf[i] = isPow2 && isTou2 && isCmc2 && isCreature ? 1 : 0;
  }
  break;
}
```

## Test Strategy

Extend the existing synthetic card pool in `evaluator.test.ts` or create a dedicated `is`-operator test block with its own pool. The existing pool already has useful diversity (creatures, instants, artifacts, a legendary creature, a transform DFC, cards with and without oracle text).

### Test cases

| Query | Expected matches | Why |
|---|---|---|
| `is:spell` | Bolt, Counterspell, Azorius Charm, Dismember | Instants (non-land, non-token) |
| `is:permanent` | Birds, Sol Ring, Tarmogoyf, Thalia, Ayara (front+back) | Creatures + artifact |
| `is:historic` | Sol Ring, Thalia, Ayara (front+back) | Artifact + legendary |
| `is:vanilla` | (none in current pool — oracle text is non-empty for all) | Need to add a vanilla creature |
| `is:commander` | Thalia, Ayara | Legendary creatures |
| `is:transform` | Ayara (front+back) | Layout is "transform" |
| `is:dfc` | Ayara (front+back) | Layout is "transform" (subset of dfc) |
| `is:bear` | (none in current pool — Thalia is 2/1, not 2/2) | Need to add a bear |
| `-is:spell` | Everything except the instants | Negation via NOT node |
| `is:party` | (none — no cleric/rogue/warrior/wizard subtypes) | Verify zero matches on missing subtypes |
| `is:nonsense` | 0 | Unknown keyword matches nothing |

Tests for `is:vanilla`, `is:bear`, `is:party`, and `is:frenchvanilla` will add synthetic cards to exercise those paths.

## Acceptance Criteria

1. All 21 keywords listed in § Supported Keywords produce correct results against the synthetic card pool.
2. Unknown `is:` values match zero cards without throwing.
3. `is:` with operators other than `:` and `=` matches zero cards.
4. Negation (`-is:spell`) works correctly via the existing `NOT` node mechanism.
5. `is:commander` correctly matches both "legendary creature" type lines and cards with "can be your commander" in oracle text.
6. `is:frenchvanilla` matches creatures whose oracle text (after reminder text stripping) contains only recognized keyword ability lines, and does not match `is:vanilla` cards or non-creatures.
7. `is:bear` requires all four conditions (creature, power 2, toughness 2, mana value 2).
8. `is:partner` matches cards with the Partner keyword but not cards that merely contain the substring "partner" in other text.
9. Layout-based keywords correctly match across both faces of multi-face cards.
10. No ETL or schema changes are required — all evaluation uses existing `ColumnarData` columns.

## Out of Scope

- **Printing-level attributes:** `is:foil`, `is:etched`, `is:glossy`, `is:nonfoil`, `is:fullart`, `is:textless`, `is:promo`, `is:digital`, `is:oversized`.
- **Rarity:** `is:common`, `is:uncommon`, `is:rare`, `is:mythic`. Rarity is printing-level, not oracle-level.
- **Curated land cycles:** `is:shockland`, `is:fetchland`, `is:checkland`, etc. These require maintained card lists, not data-driven evaluation.
- **Set/distribution metadata:** `is:reprint`, `is:reserved`, `is:funny`, `is:universesbeyond`. These require new columns (possible future spec).
- **Alchemy/digital:** `is:alchemy`, `is:rebalanced`. Frantic Search indexes paper oracle cards.
