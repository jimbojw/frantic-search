# Spec 040: Extended `is:` Keywords

**Status:** Implemented

**Depends on:** Spec 032 (is Operator), Spec 039 (Non-Destructive Error Handling)

## Goal

Expand `is:` operator coverage with 14 additional land cycle keywords (plus aliases), `is:hybrid`, and `is:phyrexian`. This brings total `is:` keyword count from 32 to 51 and closes the majority of the gap between Frantic Search and Scryfall for card-object-level queries.

## Background

Spec 032 implemented 8 curated land cycle keywords (`dual`, `shockland`, `fetchland`, `checkland`, `fastland`, `painland`, `slowland`, `bounceland`) using hardcoded name sets in `LAND_CYCLES`. Scryfall supports 22 land cycle keywords with various aliases. The remaining 14 cycles are all implementable with the same pattern — curated card-name lists matched against `namesLower`.

Scryfall also supports `is:hybrid` (cards with hybrid mana symbols) and `is:phyrexian` (cards with Phyrexian mana symbols). Both are determinable from the mana cost string, which is already available on `CardIndex` as `manaCostsLower`.

## Design

### 1. New land cycles

Each new cycle is a `Set<string>` of lowercased card names added to the existing `LAND_CYCLES` constant in `evaluator.ts`. No structural changes — `evalIsKeyword`'s default branch already handles the lookup.

#### bikeland / cycleland / bicycleland (8 cards)

Dual lands with basic land types and cycling.

Canyon Slough, Festering Thicket, Fetid Pools, Glittering Massif, Irrigated Farmland, Rain-Slicked Copse, Scattered Groves, Sheltered Thicket.

#### bondland / crowdland / battlebondland (10 cards)

Dual lands requiring two or more opponents.

Bountiful Promenade, Luxury Suite, Morphic Pool, Rejuvenating Springs, Sea of Clouds, Spectator Seating, Spire Garden, Training Center, Undergrowth Stadium, Vault of Champions.

#### canopyland / canland (6 cards)

Horizon lands — pay life for mana, sacrifice to draw.

Fiery Islet, Horizon Canopy, Nurturing Peatland, Silent Clearing, Sunbaked Canyon, Waterlogged Grove.

#### creatureland / manland (48 cards)

Lands that can become creatures. This is the largest and most volatile cycle — it grows with most new sets.

Blinkmoth Nexus, Cactus Preserve, Cave of the Frost Dragon, Cavernous Maw, Celestial Colonnade, Crawling Barrens, Creeping Tar Pit, Den of the Bugbear, Dread Statuary, Faceless Haven, Faerie Conclave, Forbidding Watchtower, Frostwalk Bastion, Ghitu Encampment, Hall of Storm Giants, Hissing Quagmire, Hive of the Eye Tyrant, Hostile Desert, Inkmoth Nexus, Lair of the Hydra, Lavaclaw Reaches, Lumbering Falls, Mishra's Factory, Mishra's Foundry, Mobilized District, Mutavault, Nantuko Monastery, Needle Spires, Raging Ravine, Restless Anchorage, Restless Bivouac, Restless Cottage, Restless Fortress, Restless Prairie, Restless Reef, Restless Ridgeline, Restless Spire, Restless Vents, Restless Vinestalk, Rising Chicane, Shambling Vent, Soulstone Sanctuary, Spawning Pool, Stalking Stones, Stirring Wildwood, Svogthos, the Restless Tomb, Treetop Village, Wandering Fumarole.

#### filterland (22 cards)

Lands that filter one mana into specific color pairs.

Cascade Bluffs, Cascading Cataracts, Crystal Quarry, Darkwater Catacombs, Desolate Mire, Ferrous Lake, Fetid Heath, Fire-Lit Thicket, Flooded Grove, Graven Cairns, Mossfire Valley, Mystic Gate, Overflowing Basin, Rugged Prairie, Shadowblood Ridge, Skycloud Expanse, Sungrass Prairie, Sunken Ruins, Sunscorched Divide, Twilight Mire, Viridescent Bog, Wooded Bastion.

#### gainland (15 cards)

Dual lands that gain 1 life on entry.

Akoum Refuge, Bloodfell Caves, Blossoming Sands, Dismal Backwater, Graypelt Refuge, Jungle Hollow, Jwar Isle Refuge, Kazandu Refuge, Rugged Highlands, Scoured Barrens, Sejiri Refuge, Swiftwater Cliffs, Thornwood Falls, Tranquil Cove, Wind-Scarred Crag.

#### pathway (10 cards)

Modal double-faced pathway lands. Both face names are included in the set since the evaluator matches per-face.

Front faces: Barkchannel Pathway, Blightstep Pathway, Branchloft Pathway, Brightclimb Pathway, Clearwater Pathway, Cragcrown Pathway, Darkbore Pathway, Hengegate Pathway, Needleverge Pathway, Riverglide Pathway.

Back faces: Tidechannel Pathway, Searstep Pathway, Boulderloft Pathway, Grimclimb Pathway, Murkwater Pathway, Timbercrown Pathway, Slitherbore Pathway, Mistgate Pathway, Pillarverge Pathway, Lavaglide Pathway.

#### scryland (10 cards)

Dual lands that scry on entry.

Temple of Abandon, Temple of Deceit, Temple of Enlightenment, Temple of Epiphany, Temple of Malady, Temple of Malice, Temple of Mystery, Temple of Plenty, Temple of Silence, Temple of Triumph.

#### surveilland (10 cards)

Dual lands that surveil on entry (Murders at Karlov Manor).

Commercial District, Elegant Parlor, Hedge Maze, Lush Portico, Meticulous Archive, Raucous Theater, Shadowy Backstreet, Thundering Falls, Undercity Sewers, Underground Mortuary.

#### shadowland / snarl (10 cards)

Dual lands that check for a basic land type in hand.

Choked Estuary, Foreboding Ruins, Fortified Village, Frostboil Snarl, Furycalm Snarl, Game Trail, Necroblossom Snarl, Port Town, Shineshadow Snarl, Vineglimmer Snarl.

#### storageland (12 cards)

Lands with storage counters.

Bottomless Vault, Calciform Pools, Crucible of the Spirit Dragon, Dreadship Reef, Dwarven Hold, Fungal Reaches, Hollow Trees, Icatian Store, Mage-Ring Network, Molten Slagheap, Saltcrusted Steppe, Sand Silos.

#### tangoland / battleland (8 cards)

Dual lands with basic types that ETB tapped unless you control 2+ basics.

Canopy Vista, Cinder Glade, Prairie Stream, Radiant Summit, Smoldering Marsh, Sodden Verdure, Sunken Hollow, Vernal Fen.

#### tricycleland / trikeland / triome (10 cards)

Three-color lands with basic types and cycling.

Indatha Triome, Jetmir's Garden, Ketria Triome, Raffine's Tower, Raugrin Triome, Savai Triome, Spara's Headquarters, Xander's Lounge, Zagoth Triome, Ziatora's Proving Ground.

#### triland (10 cards)

Three-color taplands.

Arcane Sanctum, Crumbling Necropolis, Frontier Bivouac, Jungle Shrine, Mystic Monastery, Nomad Outpost, Opulent Palace, Sandsteppe Citadel, Savage Lands, Seaside Citadel.

### 2. Alias handling

Aliases are implemented by adding multiple keys to `LAND_CYCLES` pointing to the same `Set` object reference. `evalIsKeyword`'s default branch does `LAND_CYCLES[keyword]`, so aliases work transparently with no code changes to the lookup path.

| Primary keyword | Aliases |
|---|---|
| `bikeland` | `cycleland`, `bicycleland` |
| `bondland` | `crowdland`, `battlebondland` |
| `canopyland` | `canland` |
| `creatureland` | `manland` |
| `shadowland` | `snarl` |
| `tangoland` | `battleland` |
| `tricycleland` | `trikeland`, `triome` |

Also backfill one missing alias for an existing cycle: `karoo` → `bounceland`. Scryfall supports `is:karoo` as a synonym for `is:bounceland`.

### 3. `is:hybrid` and `is:phyrexian`

These are computed from the mana cost string, not curated name lists. Two new cases in `evalIsKeyword`'s switch statement.

**`is:hybrid`** — the card's **mana cost** contains a hybrid mana symbol (`{W/U}`, `{2/R}`, etc. but NOT Phyrexian-only symbols like `{R/P}`). Detection scans `{...}` brace groups in the mana cost for a `/` where the symbol content after the slash is not just `p`. Oracle text is intentionally **not** checked — this matches Scryfall's behavior, where cards like Tasigur (`{G/U}` only in an activated ability) do not match `is:hybrid`.

**`is:phyrexian`** — the card contains a Phyrexian mana symbol (`{R/P}`, `{G/W/P}`, etc.) in its **mana cost or oracle text**. Detection scans `{...}` brace groups for content ending in `/p`. Oracle text is checked because many New Phyrexia cards have Phyrexian mana in activated abilities but not mana costs (e.g., Blinding Souleater: mana cost `{3}`, oracle text `{W/P}, {T}: Tap target creature`). This asymmetry with `is:hybrid` matches Scryfall's behavior.

Both detection functions only examine symbols inside `{...}` braces to avoid false positives from oracle text like `-5/-5` or `+1/+0`.

`CardIndex` already exposes `manaCostsLower` and `oracleTextsLower`. No new fields needed.

## Scope of Changes

| File | Change |
|---|---|
| `shared/src/search/evaluator.ts` | Expand `LAND_CYCLES` with 14 new cycles, aliases for new cycles, and `karoo` alias for `bounceland`. Add `hybrid` and `phyrexian` cases to `evalIsKeyword`'s switch. |
| `shared/src/search/evaluator.test.ts` | Tests for new land cycles (spot-check names per cycle), alias equivalence, `is:hybrid`, `is:phyrexian`. |
| `cli/suites/is-keywords.yaml` | Compliance suite entries for new keywords. |
| `docs/specs/032-is-operator.md` | Implementation note referencing Spec 040. |
| `docs/specs/039-non-destructive-error-handling.md` | Remove newly-supported keywords from `UNSUPPORTED_IS_KEYWORDS` examples. |

## Test Strategy

### Unit tests

Extend the synthetic card pool in `evaluator.test.ts`:

- Add one card per new land cycle (using a real card name from each cycle) to verify matching.
- Add one card with hybrid mana (e.g., mana cost `{W/U}{W/U}`) and one with Phyrexian mana (e.g., `{R/P}`) to verify `is:hybrid` and `is:phyrexian`.
- Verify alias equivalence: `is:bikeland`, `is:cycleland`, and `is:bicycleland` match the same card.
- Verify that `is:hybrid` does NOT match cards with only Phyrexian mana (and vice versa).

### Compliance suite

Add entries to `cli/suites/is-keywords.yaml` for each new keyword with `contains` assertions for 2-3 representative cards.

## Edge Cases

### Pathway DFCs

Pathway cards are modal DFCs — each has a front-face name and a back-face name. The evaluator matches per-face against `namesLower`, so both face names must be in the set. For example, "Brightclimb Pathway" (front) and "Grimclimb Pathway" (back) are both included. A query like `is:pathway` matches either face, and `buf[cf[i]] = 1` propagates to the canonical face.

### Hybrid-Phyrexian overlap

Some cards have both hybrid and Phyrexian mana in the same cost (e.g., `{G/W/P}` in Tamiyo's Compleation). The symbol `{G/W/P}` contains both a hybrid component (`G/W`) and a Phyrexian component (`/P`). Such cards should match both `is:hybrid` and `is:phyrexian`. The detection patterns handle this correctly: `/p}` matches for Phyrexian, and the non-`/p` slash matches for hybrid.

### Creatureland volatility

The `creatureland`/`manland` set (48 cards) grows whenever a new creature land is printed. The list must be updated manually when the ETL bulk data is refreshed. This is the same maintenance burden as any curated list — it just happens more frequently for this cycle. Compliance suite tests will catch drift via `count_min` assertions.

## Out of Scope

- **Printing-level `is:` keywords** (`foil`, `nonfoil`, `promo`, `reprint`, `digital`, etc.). These remain in `UNSUPPORTED_IS_KEYWORDS` per Spec 039.
- **`is:colorshifted`**, **`is:masterpiece`** — printing/frame-level attributes.
- **Additional non-land `is:` keywords** (`is:meldpart`, `is:meldresult`, `is:oathbreaker`, `is:duelcommander`, `is:newinpauper`). These could be added incrementally in future work. *Note: `is:gamechanger` / `is:gc` was implemented in a follow-up (Issue #40) via `CardFlag.GameChanger` from Scryfall's `game_changer` field.*
- **`is:tdfc`** alias for `is:transform`. Minor alias gap, not part of this spec.

## Acceptance Criteria

1. All 14 new land cycle keywords produce correct results against the synthetic card pool.
2. All aliases (`cycleland`, `bicycleland`, `crowdland`, `battlebondland`, `canland`, `manland`, `snarl`, `battleland`, `trikeland`, `triome`, `karoo`) produce identical results to their primary keyword.
3. `is:hybrid` matches cards with hybrid mana symbols and does not match cards with only Phyrexian mana.
4. `is:phyrexian` matches cards with Phyrexian mana symbols and does not match cards with only hybrid mana.
5. Cards with both hybrid and Phyrexian mana (e.g., `{G/W/P}`) match both `is:hybrid` and `is:phyrexian`.
6. Pathway DFCs match `is:pathway` regardless of which face name is checked.
7. Negation (`-is:bikeland`) works correctly via the existing NOT node mechanism.
8. Compliance suite entries pass in local mode.
