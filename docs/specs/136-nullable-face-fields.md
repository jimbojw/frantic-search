# Spec 136: Nullable Face Fields

**Status:** Implemented

**GitHub Issues:** [#150](https://github.com/jimbojw/frantic-search/issues/150), [#151](https://github.com/jimbojw/frantic-search/issues/151)

**Depends on:** Spec 002 (Query Engine), Spec 052 (Scryfall Outlink Canonicalization), Spec 080 (USD Null and Negated Price Semantics)

## Goal

Extend the `field=null` / `field!=null` / `-field=null` pattern from Spec 080 (printing-domain `usd`) to all nullable face-domain fields: power, toughness, loyalty, defense, mana cost, edhrec rank, and salt. This enables queries like `pow=null OR tou=null` to find non-creatures (e.g. Lightning Bolt), `m=null` to find cards with no mana cost (e.g. Glimpse of Tomorrow, Asmoranomardicadaistinaculdacar), and `edhrec=null` or `salt=null` to find cards without EDHREC data.

## Background

### Current bug

Queries such as `pow=null`, `tou=null`, `m=null`, `edhrec=null`, and `salt=null` return 0 results. The evaluator either breaks early (when `parseStatValue("null")`, `parseManaSymbols("null")`, or `Number("null")` yields no valid match) or never considers null as a distinct value.

Numeric comparisons like `pow>3` correctly exclude faces without power (the evaluator skips rows where the stat is NaN). However, negated terms like `-pow>3` use buffer inversion, so faces without power incorrectly end up in the result set — the same negation bug that Spec 080 fixed for `usd`.

### Scryfall behavior

Scryfall does not support `field=null` queries for these fields. Frantic Search–exclusive.

### Mana value is non-nullable

Mana value (mv, cmc) is derived from mana cost. A card with no mana cost (e.g. Glimpse of Tomorrow) still has a mana value of zero. Only the **mana cost** (`m`) is nullable; mana value is always defined. This spec does **not** add `mv=null`.

## Scope

### In scope

| Field | Canonical | Aliases | Null condition |
|-------|-----------|---------|-----------------|
| Power | `power` | `pow` | `power_lookup[powers[i]] === ""` |
| Toughness | `toughness` | `tou` | `toughness_lookup[toughnesses[i]] === ""` |
| Loyalty | `loyalty` | `loy` | `loyalty_lookup[loyalties[i]] === ""` |
| Defense | `defense` | `def` | `defense_lookup[defenses[i]] === ""` |
| Mana cost | `mana` | `m` | `mana_costs[i] === ""` |
| EDHREC rank | `edhrec` | `edhrecrank` | `edhrecRank[i] === null` |
| Salt | `salt` | `edhrecsalt`, `saltiness` | `edhrecSalt[i] === null` |

### Out of scope

- **Mana value (mv, cmc):** Non-nullable; cards with no mana cost have MV 0.
- **year, date (printing domain):** Same null-exclusion pattern; deferred per Spec 080 scope.

## Design

### `field=null` / `field:null`

The value `null` (case-insensitive) is a special sentinel for each nullable face field.

| Operator | Semantics |
|----------|-----------|
| `:`, `=` | Match faces where the field is null (no value) |
| `!=` | Match faces where the field is not null (has a value) |
| `>`, `>=`, `<`, `<=` | Error: `"null cannot be used with comparison operators"` |

Examples: `pow=null`, `tou!=null`, `m:null`, `loy=null`, `def!=null`, `edhrec=null`, `salt!=null`.

### Null detection

- **power, toughness, loyalty, defense:** The ETL encodes missing values as empty string via `DictEncoder`. Null = `xxxLookup[idxCol[i]] === ""`.
- **mana:** Cards with no mana cost have `mana_costs[i] === ""`. Null = empty mana cost string.
- **edhrec:** Not every card has an EDHREC rank. Null = `edhrecRank[i] === null`.
- **salt:** Salt comes from MTGJSON; many cards lack a salt score. Null = `edhrecSalt[i] === null`.

### Negated semantics

When a NOT node wraps a FIELD with a nullable face canonical and value is **not** `null`, negation is implemented by **operator inversion** instead of buffer inversion. This excludes null faces from the negated result.

**Operator-inversion fields:** power, toughness, loyalty, defense, edhrec, salt.

**Mana is excluded.** For `mana`, negation always uses buffer inversion. The existing behavior of `-m:{R}` (and `m!={R}`) continues to match cards without a mana cost (e.g. Glimpse of Tomorrow). This spec only adds `m=null` and `m!=null` as special values; it does not alter negation semantics for other mana values.

| Original | Inverted |
|----------|----------|
| `>` | `<=` |
| `>=` | `<` |
| `<` | `>=` |
| `<=` | `>` |
| `=` | `!=` |
| `!=` | `=` |

So `-pow>3` = `pow<=3` (excluding nulls). For mana: `-m:{R}` uses buffer inversion (nulls included); `-m=null` uses buffer inversion and matches faces with mana cost.

When the value **is** `null`, negation uses normal buffer inversion: `-pow=null` matches faces with power (correct).

### Canonicalization

When serializing to Scryfall outlinks, `field=null` and `field!=null` for these face fields have no Scryfall equivalent. For power, toughness, loyalty, defense, and mana, add explicit strip logic (emit empty for the node, same as `usd=null` per Spec 080). For edhrec and salt, Spec 099 and Spec 101 already strip all terms for these fields, so `edhrec=null` and `salt=null` are stripped automatically.

## Implementation

| File | Change |
|------|--------|
| `shared/src/search/eval-leaves.ts` | Add `valLower === "null"` branch for `power`, `toughness`, `loyalty`, `defense`, `mana`, `edhrec`, `salt`; match on empty lookup/cost or null; error for comparison ops with null |
| `shared/src/search/evaluator.ts` | In NOT case (face domain): when child is FIELD with canonical in {power, toughness, loyalty, defense, edhrec, salt} and val ≠ `null`, evaluate inverted operator instead of buffer invert. Mana always uses buffer inversion. |
| `shared/src/search/canonicalize.ts` | Strip `field=null` / `field!=null` for power, toughness, loyalty, defense, mana when serializing to Scryfall (edhrec/salt already stripped per Spec 099/101) |
| `app/src/docs/reference/syntax.mdx` | Add `field=null` examples for nullable face fields (per Spec 098 content spec) |
| `app/src/docs/reference/fields/face/*.mdx`, `card/edhrec.mdx`, `card/salt.mdx` | Document `=null` / `!=null` for pow, tou, loy, def, m (face); edhrec, salt (card) |

## Test Plan

### eval-leaves.test.ts (or equivalent)

- `pow=null` matches faces with no power (e.g. Lightning Bolt)
- `pow!=null` matches faces with power
- `tou=null`, `loy=null`, `def=null` same pattern
- `m=null` matches faces with no mana cost (e.g. Glimpse of Tomorrow)
- `m!=null` matches faces with mana cost (including `{0}`)
- `edhrec=null` matches faces without EDHREC rank
- `salt=null` matches faces without salt score
- `pow>null` returns error `"null cannot be used with comparison operators"`
- `pow=null OR tou=null` matches non-creatures (combined query from goal)

### evaluator.test.ts

- `-pow>3` excludes faces without power (same as `pow<=3`, operator inversion)
- `-pow=null` matches faces with power (buffer inversion)
- Same operator-inversion pattern for tou, loy, def, edhrec, salt
- `-m:{R}` uses buffer inversion (nulls included; existing behavior unchanged)
- `-m=null` matches faces with mana cost (buffer inversion)

### canonicalize.test.ts

- `pow=null`, `m=null`, etc. are stripped from Scryfall serialization

## Acceptance Criteria

- [ ] `pow=null` returns faces without power
- [ ] `pow!=null` returns faces with power
- [ ] `tou=null`, `loy=null`, `def=null` behave analogously
- [ ] `m=null` returns faces with no mana cost
- [ ] `m!=null` returns faces with mana cost (including `{0}`)
- [ ] `edhrec=null` returns faces without EDHREC rank
- [ ] `salt=null` returns faces without salt score
- [ ] `-pow>3` excludes null-power faces (operator inversion)
- [ ] `-pow=null` returns faces with power (buffer inversion)
- [ ] `-m:{R}` uses buffer inversion (nulls included; existing behavior unchanged)
- [ ] `-m=null` returns faces with mana cost (buffer inversion)
- [ ] `toScryfallQuery` strips `field=null` and `field!=null` for these fields
- [ ] Reference: syntax.mdx includes `field=null` examples for nullable face fields
- [ ] Reference: per-field docs (pow, tou, loy, def, m, edhrec, salt) document `=null` / `!=null`
