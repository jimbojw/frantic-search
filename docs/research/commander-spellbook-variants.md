# Research: Commander Spellbook variant data

**Status:** Empirical snapshot (2026-04-10)  
**Source:** `data/raw/variants.json` (Commander Spellbook bulk export, API v5.4.5)  
**Related:** [Commander Spellbook syntax guide](https://commanderspellbook.com/syntax-guide/), [Commander Spellbook API](https://backend.commanderspellbook.com/)

## Purpose

Characterize the Commander Spellbook **variants bulk data** to determine whether and how combo information could be integrated into Frantic Search. This document records the schema, scale, distribution, and design implications — not a product decision or spec.

## Data source and reproduction

The file `data/raw/variants.json` is the Commander Spellbook bulk export. Download URL:

```
https://backend.commanderspellbook.com/variants.json
```

The file is ~454 MB uncompressed. Top-level shape:

```json
{
  "version": "5.4.5",
  "timestamp": "2026-04-10T13:20:54.219826+00:00",
  "aliases": [ ... ],   // 1,158 entries — redirects for removed/merged combo IDs
  "variants": [ ... ]   // 83,543 entries — the actual combos
}
```

All counts below were produced with `jq` against this file.

## Terminology

Commander Spellbook uses specific terms:

| Term | Meaning |
|------|---------|
| **Combo** | An abstract combo recipe (parent). Identified by a numeric ID in the `of` field. |
| **Variant** | A concrete instantiation of a combo with specific cards. One combo can have multiple variants (card substitutions). |
| **Template** | A flexible slot in a combo that can be filled by any card meeting a description (e.g., "Persist Creature"). Appears in the `requires` array. |
| **Feature** | An outcome produced by completing the combo (e.g., "Infinite ETB", "Win the game"). |

There are **27,192 unique parent combos** expanded into **83,543 variants**.

## Variant schema

Each variant object has these top-level fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Composite ID: card IDs joined by `-`, then `--`, then template IDs (e.g., `"3096-4563-4970-7459--149--150"`) |
| `status` | string | Review status. All 83,543 current variants have status `"OK"`. |
| `uses` | array | Specific cards in the combo (see below). |
| `requires` | array | Template slots — flexible card requirements (see below). |
| `produces` | array | Outcomes/features the combo achieves. |
| `of` | array | Parent combo ID(s) this variant belongs to. |
| `includes` | array | Sub-combo ID(s) this variant includes. |
| `identity` | string | Color identity of the combo (e.g., `"UBRG"`). |
| `manaNeeded` | string | Mana cost to execute once set up (e.g., `"{2}"`). |
| `manaValueNeeded` | number | Numeric mana value of `manaNeeded`. |
| `easyPrerequisites` | string | Human-readable simple setup conditions. |
| `notablePrerequisites` | string | Human-readable notable/unusual setup conditions. |
| `description` | string | Step-by-step combo walkthrough. |
| `notes` | string | Editorial notes (substitutions, caveats). |
| `popularity` | number or null | EDHREC deck count (often null). |
| `spoiler` | boolean | Whether any card is from an unreleased set. |
| `bracketTag` | string | Commander bracket classification (see below). |
| `legalities` | object | Per-format boolean legality map. |
| `prices` | object | Aggregate combo price across TCGplayer, Card Kingdom, Cardmarket. |
| `variantCount` | number | How many variants share this combo's parent. |

### `uses` entries (specific cards)

Each entry in `uses` has:

- **`card`** — Full card data: `id` (Spellbook internal), `name`, `oracleId` (Scryfall oracle ID — the join key), `typeLine`, `spoiler`, and image URIs at multiple sizes.
- **`zoneLocations`** — Array of single-letter zone codes indicating where the card must start.
- **`battlefieldCardState`** / `exileCardState` / `libraryCardState` / `graveyardCardState`** — Additional state requirements (usually empty strings).
- **`mustBeCommander`** — Boolean.
- **`quantity`** — Number of copies needed.

### `requires` entries (template slots)

Each entry in `requires` has:

- **`template`** — Object with `id`, `name`, and optional `scryfallQuery` / `scryfallApi`.
- Same zone/state/quantity fields as `uses`.

### `produces` entries (outcomes)

Each entry has a **`feature`** object (`id`, `name`, `uncountable` boolean, `status`) and a `quantity`.

## Zone location codes

| Code | Zone | Occurrences |
|------|------|-------------|
| `B` | Battlefield | 251,263 |
| `H` | Hand | 31,152 |
| `G` | Graveyard | 8,933 |
| `E` | Exile | 4,059 |
| `C` | Command zone | 1,475 |
| `L` | Library | 1,462 |

The vast majority of combo pieces need to be on the battlefield.

## Bracket tags

| Tag | Count | Likely meaning |
|-----|-------|----------------|
| `E` | 71,412 | Outside brackets ("ask your group") |
| `R` | 5,493 | *Unknown — possibly "Requires discussion"* |
| `S` | 2,783 | *Unknown* |
| `P` | 2,027 | *Unknown* |
| `B` | 1,376 | *Unknown — possibly Bracket-aligned* |
| `C` | 243 | *Unknown* |
| `O` | 209 | *Unknown* |

The bracket tag meanings are not documented in the bulk data. 85% of combos are tagged `E`.

## Scale and distribution

### Cards per variant

| Cards | Variants | % of total |
|-------|----------|------------|
| 2 | 4,148 | 5.0% |
| 3 | 38,137 | 45.6% |
| 4 | 35,113 | 42.0% |
| 5 | 6,092 | 7.3% |
| 6–10 | 47 | <0.1% |

93% of combos are 3- or 4-card combos.

### Templates per variant

| Templates | Variants | % of total |
|-----------|----------|------------|
| 0 | 80,647 | 96.5% |
| 1 | 2,798 | 3.3% |
| 2 | 98 | 0.1% |

The vast majority of variants are fully enumerated (no open-ended slots). Of the 130 unique templates, **112 have a `scryfallQuery`** and 18 do not.

### Card participation

- **6,987 unique cards** (by `oracleId`) appear in combos — roughly 23% of the ~30k oracle card pool.
- Mean combos per card: 42. Median: **8**. Max: 5,213.
- The distribution is extremely heavy-tailed.

**Top 10 most combo-prolific cards:**

| Card | Combo count |
|------|-------------|
| Ashnod's Altar | 5,213 |
| Phyrexian Altar | 4,625 |
| Mortuary | 2,320 |
| Thermopod | 2,171 |
| Pitiless Plunderer | 2,027 |
| Animation Module | 1,910 |
| Altar of Dementia | 1,781 |
| Krark-Clan Ironworks | 1,705 |
| Sensei's Divining Top | 1,664 |
| Displacer Kitten | 1,528 |

### Outcomes (features)

1,047 unique features. The top outcomes are dominated by infinite triggers:

| Feature | Occurrences |
|---------|-------------|
| Infinite ETB | 52,818 |
| Infinite LTB | 45,691 |
| Infinite death triggers | 36,790 |
| Infinite sacrifice triggers | 35,021 |
| Infinite storm count | 18,705 |
| Infinite colored mana | 10,963 |
| Infinite creature tokens | 9,155 |
| Infinite draw triggers | 8,363 |
| Infinite colorless mana | 7,962 |
| Infinite +1/+1 counters | 7,847 |

Note: a single variant typically produces multiple features (e.g., infinite ETB + infinite LTB + infinite death triggers).

## Join key to Scryfall data

Each card in `uses` carries an `oracleId` field that is the Scryfall oracle UUID. This is the stable join key to Frantic Search's existing card data. The `card.id` values are Commander Spellbook internal IDs, not Scryfall IDs.

## Observations and design implications

### A `combos_with:` card-search filter is feasible but insufficient alone

A precomputed `oracleId → comboIds[]` index could support a card-level filter like `cw:!"Sliver Queen"` that matches all cards appearing in combos with Sliver Queen. However, this only surfaces card names — it strips away the combo context (zone layout, prerequisites, outcomes, step-by-step description) that makes the information useful.

### Combos are a different atomic unit than cards

A combo has its own fields (description, prerequisites, outcomes, legalities, prices, bracket) that don't map to individual cards. Useful combo display requires a dedicated page type, not a card result grid.

### The heavy-tailed distribution affects UX

Ashnod's Altar participates in 5,213 combos. Any "combos for this card" surface needs pagination, filtering (by outcome, color identity, format, number of pieces), and probably sorting (by popularity, price, variant count). This is essentially a second search engine over a different entity type.

### Commander Spellbook has an extensive query syntax

Their syntax guide documents 20+ search parameters with `:`, `=`, numeric comparisons, `all-`/`@` universal quantifiers, `-` negation, and `sort:`/`order:`. Full parity would be a large project. See the [syntax guide](https://commanderspellbook.com/syntax-guide/) for the complete reference.

### The raw data is large

At 454 MB uncompressed, the bulk export is dominated by repeated card image URIs. A processed version for Frantic Search would discard image URIs (we have our own image pipeline) and resolve `oracleId` references to canonical face indices (`Uint32`) at ETL time, consistent with the existing columnar data model. This should reduce the data dramatically.

### Templates are mostly machine-readable

112 of 130 templates include a `scryfallQuery`. The 18 without queries describe complex conditions like "Creature that taps for 2+ mana" or "Haste Enabler" that aren't easily expressed as search filters. These could be rendered as human-readable labels on a combo detail page.

## Possible integration tiers

Listed from smallest to largest scope. Each tier includes the ones before it.

### Tier 1: Card-level combo count chip

ETL computes `oracleId → comboCount` and ships a small lookup. The card detail page shows "Part of N combos" linking out to Commander Spellbook's own search. No new pages, no combo query engine.

### Tier 2: Card-level combo list page

ETL computes `oracleId → variant[]` summaries (combo ID, co-card names, outcome names, identity, legality). A new page type lists combos for a given card with filtering by outcome and identity. Combo detail links out to Commander Spellbook.

### Tier 3: Full combo detail page

A first-class combo page rendering the full variant: all cards (with zone layout), step-by-step description, prerequisites, outcomes, legalities, and prices. Cards link back to Frantic Search card detail pages.

### Tier 4: Combo search engine

A second search engine over combos with its own query language, results page, and filtering. Essentially building Commander Spellbook inside Frantic Search.

## Open questions

- What is the update frequency of the Spellbook bulk data? (Timestamp suggests daily builds.)
- What do the bracket tag codes mean? The single-letter codes (`E`, `R`, `S`, `P`, `B`, `C`, `O`) are not documented in the data itself.
- How stable are Spellbook's internal card IDs and variant IDs across exports?
- What is the compressed size of a minimal processed combo index (oracleId refs only, no image URIs)?
- Is there a meaningful "popularity" signal? The field was null for the variant examined.
