# Spec 032: The `is:` Operator

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 039 (Non-Destructive Error Handling), Spec 047 (Printing Query Fields), Spec 103 (Categorical Field Value Auto-Resolution), Spec 105 (Keyword Search — empty-value parity), Spec 176 (`kw:` / `keyword:` query semantics — parallel **`:`** / **`=`** / **`!=`** model), Spec 178 (Default inclusion / widen flags), ADR-022 (Categorical field operators)

## Goal

Support the `is:` operator — Scryfall's catch-all for common query shorthands — by evaluating each keyword against existing columnar data (type lines, oracle text, layouts, and stats).

## Background

Scryfall's [search reference](https://scryfall.com/docs/syntax) uses `is:` over 100 times. The operator covers a grab bag of concepts: game mechanics (`is:spell`, `is:historic`), layout structure (`is:dfc`, `is:split`), creature categorization (`is:vanilla`, `is:bear`), and format eligibility (`is:commander`).

Frantic Search indexes both oracle cards (abstract card identities) and individual printings (Spec 046). Many `is:` keywords are printing-level attributes (finishes, promo status, frame style, rarity) and are implemented in the printing domain (Spec 047). The scope of this spec is limited to **oracle-level** keywords — gameplay-relevant properties derivable from face-level data. Printing-level `is:` keywords (e.g. `is:foil`, `is:promo`, `is:rainbowfoil`) are defined in Spec 047.

### How it parses

The query `is:spell` already lexes and parses correctly under the existing grammar: `WORD("is") COLON WORD("spell")` → `FieldNode { field: "is", operator: ":", value: "spell" }`. The evaluator currently treats `is` as an unknown field (matches nothing). This spec adds evaluation logic for the `is` field, branching on the value.

### Operators (`:` / `=` / `!=`)

Per **[ADR-022](../adr/022-categorical-field-operators.md)**, **`is:`** / **`not:`** use the same operator split as **`kw:`** / **`keyword:`** (Spec 176) and vocabulary-style printing fields (Spec 047 / 182):

- **`:`** — **prefix union** after **`normalizeForResolution`**: every vocabulary keyword whose normalized form **starts with** the normalized user value contributes (**OR**). Discovery semantics; incomplete tokens narrow as you type.
- **`=`** — **exact match** after **`normalizeForResolution`**: only keywords whose normalized form **equals** the normalized user value contribute (**OR** if several wire keys share one normalized form, e.g. aliases). **No** prefix fallback. Escape hatch when the user must not match longer keys that merely extend the prefix (e.g. **`is=mel`** does not widen to **`meld`** / **`meldpart`** if those are the only prefix matches).
- **`!=`** — **Frantic extension** (Scryfall does not document **`!=`** on **`is:`**): negation of the **positive mask built for `=`** on the same trimmed value, **not** negation of a **`:`** prefix union. To exclude a prefix-union predicate, use **`-`** / **`NOT`**, not **`!=`**. Non-empty value with **no** exact vocabulary match → **`unknown keyword`** (same as **`=`**), not a silent all-match or all-zero leaf.

Ordering operators (`<`, `>`, `<=`, `>=`) are **not** supported on **`is` / `not`**. Any other operator → leaf error with a clear message and Spec 039 passthrough (not a silent zero-hit buffer).

Negation at the AST level (**`-is:spell`**) wraps the field in a **`NotNode`**. The convenience field **`not:`** uses the **same** vocabulary, operators, and expansion rules as **`is:`**, then applies the existing **`not:`** invert step on the leaf buffer (Spec 002).

### Scryfall vs Frantic

Scryfall’s syntax reference often treats **`:`** and **`=`** as interchangeable for **`is:`**. Frantic follows documented Scryfall semantics where they apply, and applies **[ADR-019](019-scryfall-parity-by-default.md)** for parity targets. The **`:`** / **`=`** split and **`!=`** are **Frantic** operator policy (ADR-022); document user-facing deltas in app reference (e.g. Scryfall differences).

## Value resolution (evaluation)

Query **evaluation** for **`is:`** and **`not:`** uses a **closed vocabulary** (`IS_PREFIX_VOCABULARY` in implementation — autocomplete / land-cycle / unsupported stubs aligned with eval). **Query evaluation does not call `resolveForField("is", …)`** for OR semantics; **`resolveForField("is", …)`** remains for **canonicalize** and other non-eval consumers (Spec 103).

### Vocabulary

The candidate set is the **union of all supported `is:` keywords** (face-level + printing-level + aliases such as `ub`, `gc`, `dfctoken`), as enumerated in implementation. This aligns with **`IS_KEYWORDS`** / **`IS_PREFIX_VOCABULARY`** in `eval-is.ts` / `categorical-resolve.ts`.

### Normalization

Use Spec 103 **`normalizeForResolution`** on the user value (after trim for non-empty rules) and on each keyword string.

### Expansion for `:` (prefix union)

For a **non-empty** trimmed user value with operator **`:`**:

1. Let **`u = normalizeForResolution(trimmed)`**.
2. **Expand** to list **L**:
   - If **any** keyword’s normalized form **equals** **`u`**, **L** is exactly the set of keywords with that normalized form (usually one). This prevents **`is:meld`** from also pulling in **`meldpart`** / **`meldresult`**.
   - Otherwise **L** is all vocabulary keywords whose normalized form **`startsWith(u)`**, **except** when **`u`** is a common **type-line** false positive (e.g. `creature`, `instant`) and there is **no** exact keyword with that normalized form — then **L** is empty → **`unknown keyword`** (wrong-field suggestions may offer **`t:`**; see `IS_VALUE_TYPE_LINE_FALSE_POSITIVE` in `categorical-resolve.ts`).
3. If **L** is empty → **`unknown keyword "<trimmed value>"`** with Spec 039 passthrough.
4. If **L** is non-empty → OR per keyword into the leaf buffer per **Dual domain** below.

### Expansion for `=` (exact only)

For a **non-empty** trimmed user value with operator **`=`**:

1. Let **`u = normalizeForResolution(trimmed)`**.
2. **L** is every vocabulary keyword whose **`normalizeForResolution(keyword) === u`** (OR all such wire keys). **No** prefix discovery.
3. If **`u`** is in the same **type-line false-positive** set as for **`:`** and **L** is empty → **`unknown keyword`** (do not accidentally match unrelated keys).
4. If **L** is empty → **`unknown keyword "<trimmed value>"`** with passthrough.
5. If **L** is non-empty → OR per keyword as for **`:`**.

### Expansion for `!=`

For a **non-empty** trimmed user value with operator **`!=`**:

1. Build **L** with the **same rules as `=`** (exact normalized match only).
2. If **L** is empty → **`unknown keyword`** (same as **`=`**).
3. Otherwise compute positive mask **M** by ORing the same per-keyword evaluation as for **`=`**, then set the leaf buffer to the **bitwise complement** of **M** in the leaf’s **final domain** (face-only, printing-only, or combined promoted buffer — same domain as the positive **`=`** leaf would use). **Mixed-domain** leaves: invert **after** the same combined OR used for **`=`**, not separate per-domain inverts that break promotion.

### Empty value

When the value is empty after trim, **`is:`**, **`is=`**, **`is!=`**, **`not:`**, **`not=`**, and **`not!=`** behave like empty **`kw:`** / ADR-022 / Spec 182: fill the leaf’s domain buffer with **all ones** (neutral filter). **Do not** apply **`!=`** inversion on an all-match buffer (that would incorrectly empty the result set).

### Unsupported keywords

If **any** keyword in **L** is in the implementation’s **unsupported** set (`UNSUPPORTED_IS_KEYWORDS`, e.g. `spotlight`, `booster`, `masterpiece`, …), the leaf errors with **`unsupported keyword "<user value as in AST>"`** (same pattern as today for a single unsupported token). No partial union: the whole term fails.

**Exception (operator `:` only, prefix discovery):** When **L** is built from the **`startsWith`** branch of § Expansion for **`:`** (not from the **exact normalized equality** branch), **remove** unsupported vocabulary entries from **L** before evaluation. Otherwise prefixes such as **`is:me`** would OR **`meld`** with **`meldpart`** / **`meldresult`** and fail the leaf on unsupported stubs. Typing the **full** unsupported token still uses the exact branch (or **`=`** / **`!=`**) and errors as above. Implementation: `expandIsKeywordsFromPrefix` in `categorical-resolve.ts`.

### Dual domain (face vs printing)

Keywords are partitioned for evaluation (see Spec 047):

- **Printing-evaluable:** Keywords in **`PRINTING_IS_KEYWORDS`** are evaluated with **`evalPrintingIsKeyword`** on a **printing** buffer when **`PrintingIndex`** is loaded.
- **Face-evaluable:** Keywords **not** in **`PRINTING_IS_KEYWORDS`** are evaluated with **`evalIsKeyword`** on a **face** buffer.
- **Dual-listed keywords** (e.g. `universesbeyond`, `ub`): when printings are loaded, use **printing** evaluation only for those tokens; when printings are **not** loaded, use **`FACE_FALLBACK_IS_KEYWORDS`** face evaluation instead of erroring, if the expanded set is compatible with fallback (existing Spec 047 behavior, generalized from a single resolved string to the **expanded set**).

**Mixed expansion** (e.g. prefix matches both a printing-only and a face-only keyword):

1. Evaluate all **printing-evaluable** members of **L** into a printing buffer (OR).
2. Evaluate all **face-evaluable** members of **L** into a face buffer (OR). Do **not** evaluate a dual-listed keyword on both domains when printings are loaded.
3. **Combine** at card level: promote the printing buffer to face indices (same promotion as other printing-domain leaves), then **OR** with the face buffer so a card matches if **either** branch matches.

If **any** expanded keyword **requires** printing data (printing-evaluable and not satisfiable by face fallback) and **`PrintingIndex`** is missing, the leaf errors with **`printing data not loaded`** (existing behavior).

### Structural widen flags (Spec 178)

**`widenExtrasLayout`**, **`widenContentWarning`**, **`widenPlaytest`**, and **`widenOversized`** are set when a **positive** `is` / `not` field node uses operator **`:`** or **`=`** and its expanded set **L** (prefix or exact per operator) contains **any** keyword in the corresponding widener category. **`!=`** terms **do not** set widen flags from the value: the user is **excluding** an exact keyword, not asserting it (same idea as ADR-022: **`!=`** negates **`=`**, not a positive prefix-union assertion).

### `not:` negation

**`not:`** / **`not=`** / **`not!=`** use the **same operator, expansion, and OR** as **`is:`** / **`is=`** / **`is!=`** respectively, then apply the existing **`not:`** invert step on the leaf buffer (printing and/or face domain per dual-domain rules). At the AST level, **`-is:x`** remains **`NotNode`** wrapping **`is:`**; for equivalent **`x`** and operator, semantics align with **`not:x`** where specified in Spec 002.

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
| `is:host` | `host` |
| `is:augment` | `augment` |
| `is:token` | `token` |
| `is:double_faced_token` | `double_faced_token` |
| `is:dfctoken` | `double_faced_token` (alias) |
| `is:art_series` | `art_series` |
| `is:emblem` | `emblem` |
| `is:planar` | `planar` |
| `is:scheme` | `scheme` |
| `is:vanguard` | `vanguard` |

Positive **`is:`** / **`not:`** / **`is=`** / **`not=`** terms whose expanded set **L** (§ Value resolution, operator **`:`** or **`=`**) includes **`token`**, **`double_faced_token`** / **`dfctoken`**, **`art_series`**, or **`vanguard`** set **`widenExtrasLayout`** in **`EvalOutput`** (Spec 002). **`is!=`** / **`not!=`** do not widen from those keywords. Under the default inclusion filter ([Spec 178](178-default-search-inclusion-filter.md)), that flag **fully re-includes** printings whose canonical face layout is in the extras-layout set for all omission passes on that row—see Spec 178 **Per-printing omission gate** and **`is:<extras-layout>`** widening row.

### Oracle text checks

| Keyword | Logic |
|---|---|
| `is:vanilla` | Oracle text is empty (after reminder text stripping, which `CardIndex` already performs) |
| `is:frenchvanilla` | Oracle text, after stripping reminder text, contains only recognized keyword abilities (see § French Vanilla) |
| `is:commander` | Front face type line contains `Legendary` AND (`Creature` or `Vehicle` or `Background`), OR oracle text contains `"can be your commander"` or `"spell commander"`, OR hardcoded exception (e.g. Grist); Vehicle/Spacecraft must have power and toughness (can become a creature); excludes tokens, meld results, and cards banned in Commander (Scryfall parity, Issue #148, #149) |
| `is:brawler` | Same logic as `is:commander` |
| `is:companion` | Oracle text contains `"Companion —"` |
| `is:partner` | **Scryfall-aligned** with `is:partner` for oracle-unique comparison when using `cli diff … include:extras` (or evaluating without the diff tool’s legal/restricted filter — see below). Faces whose type line contains `Saga` never match (no saga-partner assumption; revisit if WotC prints one). If the type line contains `Creature`, it must also contain `Legendary` (excludes Battlebond-style nonlegendary `Partner with` creatures). A face matches if **any** of: Scryfall `keywords` lists `Partner` or `Partner with …` for that oracle (`keywords_index`); oracle text (after reminder strip) has a standalone `Partner` line or a `Partner with` line; type line contains `Background`; oracle contains `choose a background`, `doctor's companion`, or `commander creatures you own`; or type line contains `Time Lord Doctor`. **`cli diff` default (no `include:extras`)** drops faces with no format where the card is legal or restricted, which can make a few Scryfall `is:partner` hits (e.g. not-legal-anywhere acorn cards) look like “Scryfall only” even though the evaluator matches them — add `include:extras` to compare oracle sets fairly. |

### Stat checks

| Keyword | Logic |
|---|---|
| `is:bear` | Type line contains `Creature`, AND power = 2, AND toughness = 2, AND mana value = 2 |

### Flag checks (via `flags` bitmask column)

These require a new `flags` column in `ColumnarData`, populated by the ETL pipeline.

| Keyword | Flag bit | Scryfall source field |
|---|---|---|
| `is:reserved` | `CardFlag.Reserved` | `reserved === true` |
| `is:funny` | `CardFlag.Funny` | See § Funny Flag Logic below |
| `is:universesbeyond` / `is:ub` | `CardFlag.UniversesBeyond` (face) or `promo_types_flags_0`/`promo_types_flags_1` (printing) | Dual-domain: when printings are loaded, evaluates in printing domain via `promo_types_flags_0`/`promo_types_flags_1`. When printings are not loaded, falls back to face domain via `CardFlag.UniversesBeyond`. See Spec 047. |
| `is:gamechanger` / `is:gc` | `CardFlag.GameChanger` | `game_changer === true` (Commander Game Changer list) |
| `is:content_warning` | `CardFlag.ContentWarning` | `content_warning === true` (Spec 170, Issue #224) |

### Curated land cycle lists (via name lookup)

These are hardcoded sets of oracle card names. The evaluator checks `namesLower[i]` against each set.

| Keyword | Cards |
|---|---|
| `is:dual` | Badlands, Bayou, Plateau, Savannah, Scrubland, Taiga, Tropical Island, Tundra, Underground Sea, Volcanic Island |
| `is:shockland` | Blood Crypt, Breeding Pool, Godless Shrine, Hallowed Fountain, Overgrown Tomb, Sacred Foundry, Steam Vents, Stomping Ground, Temple Garden, Watery Grave |
| `is:fetchland` | Arid Mesa, Bloodstained Mire, Flooded Strand, Marsh Flats, Misty Rainforest, Polluted Delta, Scalding Tarn, Verdant Catacombs, Windswept Heath, Wooded Foothills |
| `is:checkland` | Clifftop Retreat, Dragonskull Summit, Drowned Catacomb, Glacial Fortress, Hinterland Harbor, Isolated Chapel, Rootbound Crag, Sulfur Falls, Sunpetal Grove, Woodland Cemetery |
| `is:fastland` | Blackcleave Cliffs, Blooming Marsh, Botanical Sanctum, Concealed Courtyard, Copperline Gorge, Darkslick Shores, Inspiring Vantage, Razorverge Thicket, Seachrome Coast, Spirebluff Canal |
| `is:painland` | Adarkar Wastes, Battlefield Forge, Brushland, Caves of Koilos, Karplusan Forest, Llanowar Wastes, Shivan Reef, Sulfurous Springs, Underground River, Yavimaya Coast |
| `is:slowland` | Deathcap Glade, Deserted Beach, Dreamroot Cascade, Haunted Ridge, Overgrown Farmland, Rockfall Vale, Shattered Sanctum, Shipwreck Marsh, Stormcarved Coast, Sundown Pass |
| `is:bounceland` | Arid Archway, Azorius Chancery, Boros Garrison, Coral Atoll, Dimir Aqueduct, Dormant Volcano, Everglades, Golgari Rot Farm, Gruul Turf, Guildless Commons, Izzet Boilerworks, Jungle Basin, Karoo, Orzhov Basilica, Rakdos Carnarium, Selesnya Sanctuary, Simic Growth Chamber |

### Summary: 32 keywords

**Tier 1 (existing data):** `permanent`, `spell`, `historic`, `party`, `outlaw`, `split`, `flip`, `transform`, `modal`, `mdfc`, `dfc`, `meld`, `adventure`, `leveler`, `vanilla`, `frenchvanilla`, `commander`, `brawler`, `companion`, `partner`, `bear`.

**Tier 2 (flags column):** `reserved`, `funny`, `universesbeyond` (alias: `ub`), `gamechanger` (alias: `gc`).

**Tier 3 (curated name lists):** `dual`, `shockland`, `fetchland`, `checkland`, `fastland`, `painland`, `slowland`, `bounceland`.

A **non-empty** prefix that matches **no** vocabulary keyword yields **`unknown keyword "…"`** with passthrough (§ Value resolution), not a silent zero-hit leaf.

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
| `layouts` | `split`, `flip`, `transform`, `modal`, `mdfc`, `dfc`, `meld`, `adventure`, `leveler`, `token`, `double_faced_token`, `dfctoken`, `art_series`, `emblem`, `planar`, `scheme`, `vanguard`, `host`, `augment`, `spell` |
| `names` | `dual`, `shockland`, `fetchland`, `checkland`, `fastland`, `painland`, `slowland`, `bounceland` |
| `powers` + `power_lookup` | `bear` |
| `toughnesses` + `toughness_lookup` | `bear` |
| `mana_costs` (via mana value) | `bear` |

### New column: `flags`

A `flags` bitmask column (`number[]`) added to `ColumnarData`. Each card's flags are encoded during ETL from Scryfall card-level fields.

```typescript
// shared/src/bits.ts
export const CardFlag = {
  Reserved: 1 << 0,
  Funny: 1 << 1,
  UniversesBeyond: 1 << 2,
} as const;
```

The ETL extracts `reserved` (boolean), `security_stamp` (string), `border_color` (string), `set_type` (string), `promo_types` (string array), and `legalities` (object) from each Scryfall oracle card object. Flags are card-level properties, duplicated across faces of multi-face cards.

#### Funny Flag Logic

A card is funny (`CardFlag.Funny`) if ANY of these conditions holds:

1. `security_stamp === "acorn"` — Unfinity-era acorn-stamped cards.
2. `border_color === "silver"` — pre-Unfinity Un-set cards.
3. `border_color === "gold"` — gold-bordered casual/joke cards (e.g., Unfinity Promos).
4. `set_type === "funny"` AND the card is not legal in any format — catches Unknown Event (UNK), Mystery Booster Playtest Cards (CMB1/CMB2), holiday promos, and other funny-set cards. The legality guard excludes the ~190 eternal-legal Unfinity/SUNF cards that Scryfall does not consider funny.
5. `promo_types` includes `"playtest"` — catches playtest cards from non-funny set types (e.g., Mystery Booster 2 playtest cards in `set_type: "masters"`).

Conditions 1–2 were the original implementation. Conditions 3–5 were added to close a ~860-card gap versus Scryfall's `is:funny` (1,419 results vs. the original 560). Empirically, `is:funny` and format legality are mutually exclusive on Scryfall: `is:funny f:commander` returns zero results.

#### Universes Beyond Flag Logic

A card is Universes Beyond (`CardFlag.UniversesBeyond`) if ANY of these holds:

1. **Oracle card fields** (from `oracle-cards.json`): `security_stamp === "triangle"` or `promo_types` includes `"universesbeyond"`.
2. **Any printing** (from `default-cards.json`): The card's `oracle_id` appears in a printing that has `promo_types` including `"universesbeyond"` or `security_stamp === "triangle"`.

Oracle-cards has one entry per unique card and may use a default printing's fields; cards like Abrade (printed in UB Secret Lair) have no UB markers on their oracle entry. The ETL therefore pre-scans default-cards to build a set of `oracle_id`s with any UB printing, and uses that set when encoding flags. This closes the gap to ~3,531 vs. Scryfall's ~3,534.

### CardIndex changes

Add `layouts` and `flags`:

```typescript
readonly layouts: string[];
readonly flags: number[];
```

Both populated directly from `ColumnarData` — no transformation needed.

## Evaluator Changes

### Field alias

Add `is` to `FIELD_ALIASES` mapping to itself:

```typescript
is: "is",
```

### Evaluation

The evaluator’s **`is` / `not`** branch expands **L** per § Value resolution: **`:`** → prefix expansion; **`=`** / **`!=`** → exact expansion; **`!=`** inverts the positive **`=`** mask in the leaf’s final domain. OR **`evalIsKeyword`** / **`evalPrintingIsKeyword`** per **k** in **L** as today (dual-domain rules unchanged).

**Unknown** (empty **L**), **unsupported** (any member of **L** unsupported), **unsupported operator**, and **printing required but missing** follow § Value resolution and Spec 047.

The dual-domain **`NodeCache`** path uses operator-aware **L** for routing, printing intersect, printing OR, face OR, promotion, and widen-flag detection (Spec 178; **`!=`** excluded from widen predicate matching).

**[Spec 181](181-breakdown-prefix-branch-hint.md)** (if implemented): prefix-branch hints apply to **`:`** only; **`=`** / **`!=`** omit prefix-branch hints to avoid advertising **`:`**-only branches.

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
| `is:nonsense` | (leaf error) | Unknown prefix → `unknown keyword` passthrough |
| `is=mel` | (leaf error) or no widen | Exact-only: does not union `meld` / `meldpart` unless normalized keys equal `mel` |
| `is!=spell` | Complement of `is=spell` | **`!=`** negates **`=`** mask (same domain rules) |

Tests for `is:vanilla`, `is:bear`, `is:party`, and `is:frenchvanilla` will add synthetic cards to exercise those paths.

## Acceptance Criteria

1. All 32 keywords listed in § Supported Keywords produce correct results against the synthetic card pool (plus printing-level keywords per Spec 047).
2. A **non-empty** `is:` / `not:` value with operator **`:`** that prefix-matches **no** vocabulary keyword yields **`unknown keyword "…"`** with Spec 039 passthrough (not a silent zero-hit leaf).
3. A **`:`** prefix that matches **multiple** keywords matches the **union** of their per-keyword results (face and/or printing domains per § Value resolution).
4. **Empty** `is:` / `is=` / `is!=` / `not:` / `not=` / `not!=` (after trim) fills the leaf buffer with all matches in that leaf’s domain (neutral filter), same idea as empty **`kw:`** (Spec 105); **`!=`** does not invert the neutral buffer.
5. If the expanded set contains **any** unsupported keyword, the leaf errors with **`unsupported keyword`** (user’s AST value in the message).
6. **`is=`** / **`not=`** use **exact** expansion only: a value that would match multiple keys under **`:`** but matches **no** normalized exact key yields **`unknown keyword`**, not a union of prefix matches.
7. **`is!=`** / **`not!=`** negate the positive **`=`** mask for the same value; unsupported operators on **`is` / `not`** yield a **leaf error** with passthrough, not a silent zero-hit buffer.
8. Negation (`-is:spell`) and **`not:`** / **`not=`** / **`not!=`** work correctly, including **`not:`** after prefix union (invert of the OR).
9. `is:commander` correctly matches: front-face Legendary Creature/Vehicle/Background, oracle text "can be your commander", and hardcoded exceptions (e.g. Grist). Back-face-only creature types (e.g. Nicol Bolas modal DFC) do not match. Planeswalkers without the clause do not match.
10. `is:frenchvanilla` matches creatures whose oracle text (after reminder text stripping) contains only recognized keyword ability lines, and does not match `is:vanilla` cards or non-creatures.
11. `is:bear` requires all four conditions (creature, power 2, toughness 2, mana value 2).
12. `is:partner` follows the § Oracle text checks row for `is:partner` (keyword index, oracle lines, templates, saga exclusion, legendary+creature rule). It does not match cards that only contain the substring `partner` in unrelated text without satisfying those rules.
13. Layout-based keywords correctly match across both faces of multi-face cards.
14. `is:reserved`, `is:funny`, `is:universesbeyond`, `is:gamechanger` / `is:gc`, `is:content_warning`, and related flag-backed keywords correctly check flag bits from the `flags` column (see Spec 170 for `content_warning`).
15. Land cycle keywords match exactly the curated card name lists.
16. The `flags` column is populated correctly by the ETL pipeline from `reserved`, `security_stamp`, `border_color`, `set_type`, `promo_types`, and `legalities` fields.
17. **Spec 178** widen flags trigger when **any** expanded **`:`** or **`=`** keyword in **L** is in the corresponding widener set; **`!=`** terms do not set widen from the excluded value.
18. At least one **mixed-domain** prefix (face + printing keywords in **L**) ORs correctly after promotion.

## Out of Scope

- **Printing-level attributes:** `is:foil`, `is:etched`, `is:nonfoil`, `is:fullart`, `is:textless`, `is:promo`, `is:digital`, `is:oversized`, `is:unset`. (These are implemented as printing-domain keywords per Spec 047; `is:glossy`, `is:rebalanced` via `promo_types`; `is:alchemy` uses the same promo bit but ETL also sets it from `set_type: "alchemy"`; `is:unset` uses `printing_flags` from `set_type: "funny"` — Specs 046, 047, and 171.)
- **Rarity:** `is:common`, `is:uncommon`, `is:rare`, `is:mythic`. Rarity is printing-level, not oracle-level.
- **Reprint status:** `is:reprint`. Printing-level; implemented per Spec 047.

## Implementation Notes

- 2026-04-04: **ADR-022 alignment** — **`:`** prefix union vs **`=`** exact vs **`!=`** negation of exact **`=`** mask; empty **`!=`** neutral; unsupported operator → leaf error; Spec 178 widen operator-aware (**`!=`** excluded); `expandIsKeywordsExact` + operator routing in evaluator.
- 2026-04-02: **Prefix union** for `is:` / `not:` query evaluation (aligned with Spec 176 `kw:`): expand over `IS_PREFIX_VOCABULARY` with `normalizeForResolution`; OR per keyword; `unknown keyword` / `unsupported keyword` / empty-value rules; mixed face+printing domain; Spec 103 `resolveForField` only for non-eval consumers; Spec 178 widen detection uses expanded set for **`:`** / **`=`**.
- 2026-03-29: Added `is:content_warning` via `CardFlag.ContentWarning` and oracle `content_warning` in ETL (Spec 170, Issue #224).
- 2026-03-03: Spec 047 adds printing-domain `is:` keywords for Scryfall `promo_types` (51 values: `rainbowfoil`, `poster`, `alchemy`, `rebalanced`, etc.). `is:universesbeyond`/`is:ub` become dual-domain: printing domain when printings loaded, face-domain fallback when not.
- 2026-03-04: Added layout keywords for Issue #80: `is:token`, `is:double_faced_token`, `is:dfctoken`, `is:art_series`, `is:emblem`, `is:planar`, `is:scheme`, `is:vanguard`. These match cards indexed after ETL-level layout filtering was removed.
- 2026-02-25: Spec 040 extended coverage with 14 additional land cycle keywords
  (bikeland, bondland, canopyland, creatureland, filterland, gainland, pathway,
  scryland, surveilland, shadowland, storageland, tangoland, tricycleland, triland),
  aliases for new and existing cycles (karoo for bounceland), and two mana-cost-based
  keywords (hybrid, phyrexian). Total keyword count: 32 → 51.
