// SPDX-License-Identifier: Apache-2.0
import type { CardIndex } from "./card-index";
import type { PrintingIndex } from "./printing-index";
import { CardFlag, Finish, PrintingFlag } from "../bits";

// ---------------------------------------------------------------------------
// is: keyword evaluation (Spec 032)
// ---------------------------------------------------------------------------

const PERMANENT_TYPES = ["artifact", "battle", "creature", "enchantment", "land", "planeswalker"];

const DFC_LAYOUTS = new Set(["transform", "modal_dfc", "meld"]);

const PARTY_TYPES = ["cleric", "rogue", "warrior", "wizard"];

// ---------------------------------------------------------------------------
// Curated land cycle name sets (Spec 032)
// ---------------------------------------------------------------------------

const _dual = new Set([
  "badlands", "bayou", "plateau", "savannah", "scrubland",
  "taiga", "tropical island", "tundra", "underground sea", "volcanic island",
]);
const _shockland = new Set([
  "blood crypt", "breeding pool", "godless shrine", "hallowed fountain",
  "overgrown tomb", "sacred foundry", "steam vents", "stomping ground",
  "temple garden", "watery grave",
]);
const _fetchland = new Set([
  "arid mesa", "bloodstained mire", "flooded strand", "marsh flats",
  "misty rainforest", "polluted delta", "scalding tarn", "verdant catacombs",
  "windswept heath", "wooded foothills",
]);
const _checkland = new Set([
  "clifftop retreat", "dragonskull summit", "drowned catacomb", "glacial fortress",
  "hinterland harbor", "isolated chapel", "rootbound crag", "sulfur falls",
  "sunpetal grove", "woodland cemetery",
]);
const _fastland = new Set([
  "blackcleave cliffs", "blooming marsh", "botanical sanctum", "concealed courtyard",
  "copperline gorge", "darkslick shores", "inspiring vantage", "razorverge thicket",
  "seachrome coast", "spirebluff canal",
]);
const _painland = new Set([
  "adarkar wastes", "battlefield forge", "brushland", "caves of koilos",
  "karplusan forest", "llanowar wastes", "shivan reef", "sulfurous springs",
  "underground river", "yavimaya coast",
]);
const _slowland = new Set([
  "deathcap glade", "deserted beach", "dreamroot cascade", "haunted ridge",
  "overgrown farmland", "rockfall vale", "shattered sanctum", "shipwreck marsh",
  "stormcarved coast", "sundown pass",
]);
const _bounceland = new Set([
  "arid archway", "azorius chancery", "boros garrison", "coral atoll",
  "dimir aqueduct", "dormant volcano", "everglades", "golgari rot farm",
  "gruul turf", "guildless commons", "izzet boilerworks", "jungle basin",
  "karoo", "orzhov basilica", "rakdos carnarium", "selesnya sanctuary",
  "simic growth chamber",
]);
const _bikeland = new Set([
  "canyon slough", "festering thicket", "fetid pools", "glittering massif",
  "irrigated farmland", "rain-slicked copse", "scattered groves", "sheltered thicket",
]);
const _bondland = new Set([
  "bountiful promenade", "luxury suite", "morphic pool", "rejuvenating springs",
  "sea of clouds", "spectator seating", "spire garden", "training center",
  "undergrowth stadium", "vault of champions",
]);
const _canopyland = new Set([
  "fiery islet", "horizon canopy", "nurturing peatland",
  "silent clearing", "sunbaked canyon", "waterlogged grove",
]);
const _creatureland = new Set([
  "blinkmoth nexus", "cactus preserve", "cave of the frost dragon", "cavernous maw",
  "celestial colonnade", "crawling barrens", "creeping tar pit", "den of the bugbear",
  "dread statuary", "faceless haven", "faerie conclave", "forbidding watchtower",
  "frostwalk bastion", "ghitu encampment", "hall of storm giants", "hissing quagmire",
  "hive of the eye tyrant", "hostile desert", "inkmoth nexus", "lair of the hydra",
  "lavaclaw reaches", "lumbering falls", "mishra's factory", "mishra's foundry",
  "mobilized district", "mutavault", "nantuko monastery", "needle spires",
  "raging ravine", "restless anchorage", "restless bivouac", "restless cottage",
  "restless fortress", "restless prairie", "restless reef", "restless ridgeline",
  "restless spire", "restless vents", "restless vinestalk", "rising chicane",
  "shambling vent", "soulstone sanctuary", "spawning pool", "stalking stones",
  "stirring wildwood", "svogthos, the restless tomb", "treetop village", "wandering fumarole",
]);
const _filterland = new Set([
  "cascade bluffs", "cascading cataracts", "crystal quarry", "darkwater catacombs",
  "desolate mire", "ferrous lake", "fetid heath", "fire-lit thicket",
  "flooded grove", "graven cairns", "mossfire valley", "mystic gate",
  "overflowing basin", "rugged prairie", "shadowblood ridge", "skycloud expanse",
  "sungrass prairie", "sunken ruins", "sunscorched divide", "twilight mire",
  "viridescent bog", "wooded bastion",
]);
const _gainland = new Set([
  "akoum refuge", "bloodfell caves", "blossoming sands", "dismal backwater",
  "graypelt refuge", "jungle hollow", "jwar isle refuge", "kazandu refuge",
  "rugged highlands", "scoured barrens", "sejiri refuge", "swiftwater cliffs",
  "thornwood falls", "tranquil cove", "wind-scarred crag",
]);
const _pathway = new Set([
  "barkchannel pathway", "blightstep pathway", "branchloft pathway", "brightclimb pathway",
  "clearwater pathway", "cragcrown pathway", "darkbore pathway", "hengegate pathway",
  "needleverge pathway", "riverglide pathway",
  "tidechannel pathway", "searstep pathway", "boulderloft pathway", "grimclimb pathway",
  "murkwater pathway", "timbercrown pathway", "slitherbore pathway", "mistgate pathway",
  "pillarverge pathway", "lavaglide pathway",
]);
const _scryland = new Set([
  "temple of abandon", "temple of deceit", "temple of enlightenment", "temple of epiphany",
  "temple of malady", "temple of malice", "temple of mystery", "temple of plenty",
  "temple of silence", "temple of triumph",
]);
const _surveilland = new Set([
  "commercial district", "elegant parlor", "hedge maze", "lush portico",
  "meticulous archive", "raucous theater", "shadowy backstreet", "thundering falls",
  "undercity sewers", "underground mortuary",
]);
const _shadowland = new Set([
  "choked estuary", "foreboding ruins", "fortified village", "frostboil snarl",
  "furycalm snarl", "game trail", "necroblossom snarl", "port town",
  "shineshadow snarl", "vineglimmer snarl",
]);
const _storageland = new Set([
  "bottomless vault", "calciform pools", "crucible of the spirit dragon", "dreadship reef",
  "dwarven hold", "fungal reaches", "hollow trees", "icatian store",
  "mage-ring network", "molten slagheap", "saltcrusted steppe", "sand silos",
]);
const _tangoland = new Set([
  "canopy vista", "cinder glade", "prairie stream", "radiant summit",
  "smoldering marsh", "sodden verdure", "sunken hollow", "vernal fen",
]);
const _tricycleland = new Set([
  "indatha triome", "jetmir's garden", "ketria triome", "raffine's tower",
  "raugrin triome", "savai triome", "spara's headquarters", "xander's lounge",
  "zagoth triome", "ziatora's proving ground",
]);
const _triland = new Set([
  "arcane sanctum", "crumbling necropolis", "frontier bivouac", "jungle shrine",
  "mystic monastery", "nomad outpost", "opulent palace", "sandsteppe citadel",
  "savage lands", "seaside citadel",
]);

const LAND_CYCLES: Record<string, Set<string>> = {
  dual: _dual, shockland: _shockland, fetchland: _fetchland,
  checkland: _checkland, fastland: _fastland, painland: _painland,
  slowland: _slowland,
  bounceland: _bounceland, karoo: _bounceland,
  bikeland: _bikeland, cycleland: _bikeland, bicycleland: _bikeland,
  bondland: _bondland, crowdland: _bondland, battlebondland: _bondland,
  canopyland: _canopyland, canland: _canopyland,
  creatureland: _creatureland, manland: _creatureland,
  filterland: _filterland, gainland: _gainland, pathway: _pathway,
  scryland: _scryland, surveilland: _surveilland,
  shadowland: _shadowland, snarl: _shadowland,
  storageland: _storageland,
  tangoland: _tangoland, battleland: _tangoland,
  tricycleland: _tricycleland, trikeland: _tricycleland, triome: _tricycleland,
  triland: _triland,
};
const OUTLAW_TYPES = ["assassin", "mercenary", "pirate", "rogue", "warlock"];

const FRENCH_VANILLA_KEYWORDS = [
  "absorb", "afflict", "annihilator", "bushido", "cascade", "changeling",
  "convoke", "crew", "cumulative upkeep", "cycling", "dash", "deathtouch",
  "defender", "devoid", "double strike", "emerge", "enchant", "equip",
  "escape", "evoke", "exalted", "exploit", "extort", "fabricate",
  "first strike", "flanking", "flash", "flashback", "flying", "forecast",
  "foretell", "frenzy", "graft", "haste", "hexproof", "horsemanship",
  "indestructible", "intimidate", "kicker", "landfall", "lifelink",
  "living weapon", "madness", "menace", "miracle", "modular", "morph",
  "mutate", "ninjutsu", "offering", "outlast", "partner", "persist",
  "phasing", "poisonous", "protection", "prowess", "rampage", "reach",
  "rebound", "reconfigure", "regenerate", "renown", "replicate", "retrace",
  "riot", "scavenge", "shadow", "shroud", "skulk", "soulbond", "spectacle",
  "split second", "storm", "sunburst", "surge", "suspend", "totem armor",
  "trample", "training", "transfigure", "transmute", "tribute", "undying",
  "unearth", "unleash", "vanishing", "vigilance", "ward", "wither",
];

function isFrenchVanilla(oracleTextLower: string, typeLineLower: string): boolean {
  if (!typeLineLower.includes("creature")) return false;
  if (oracleTextLower.length === 0) return false;
  const lines = oracleTextLower.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const parts = line.split(", ");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      if (!FRENCH_VANILLA_KEYWORDS.some(kw => trimmed === kw || trimmed.startsWith(kw + " "))) {
        return false;
      }
    }
  }
  return true;
}

const PARTNER_RE = /(?:^|\n)partner(?:\n|$)/;

function hasHybridSymbol(text: string): boolean {
  let i = 0;
  while ((i = text.indexOf('{', i)) !== -1) {
    const close = text.indexOf('}', i);
    if (close === -1) break;
    const sym = text.substring(i + 1, close);
    const slash = sym.indexOf('/');
    if (slash !== -1 && (sym[slash + 1] !== 'p' || slash + 2 !== sym.length)) return true;
    i = close + 1;
  }
  return false;
}

function hasPhyrexianSymbol(text: string): boolean {
  let i = 0;
  while ((i = text.indexOf('{', i)) !== -1) {
    const close = text.indexOf('}', i);
    if (close === -1) break;
    if (text.substring(i + 1, close).endsWith('/p')) return true;
    i = close + 1;
  }
  return false;
}

export const PRINTING_IS_KEYWORDS = new Set([
  "foil", "nonfoil", "etched",
  "full", "fullart", "textless", "reprint", "promo", "digital", "hires",
  "borderless", "extended",
]);

export const UNSUPPORTED_IS_KEYWORDS = new Set([
  "glossy", "spotlight",
  "booster", "masterpiece", "alchemy", "rebalanced", "colorshifted",
  "newinpauper", "meldpart", "meldresult",
]);

export function evalIsKeyword(
  keyword: string,
  index: CardIndex,
  buf: Uint8Array,
  n: number,
): "ok" | "unsupported" | "unknown" {
  const cf = index.canonicalFace;
  switch (keyword) {
    case "permanent":
      for (let i = 0; i < n; i++) {
        if (PERMANENT_TYPES.some(t => index.typeLinesLower[i].includes(t))) buf[cf[i]] = 1;
      }
      break;
    case "spell":
      for (let i = 0; i < n; i++) {
        if (!index.typeLinesLower[i].includes("land")) buf[cf[i]] = 1;
      }
      break;
    case "historic":
      for (let i = 0; i < n; i++) {
        const tl = index.typeLinesLower[i];
        if (tl.includes("artifact") || tl.includes("legendary") || tl.includes("saga")) buf[cf[i]] = 1;
      }
      break;
    case "party":
      for (let i = 0; i < n; i++) {
        if (PARTY_TYPES.some(t => index.typeLinesLower[i].includes(t))) buf[cf[i]] = 1;
      }
      break;
    case "outlaw":
      for (let i = 0; i < n; i++) {
        if (OUTLAW_TYPES.some(t => index.typeLinesLower[i].includes(t))) buf[cf[i]] = 1;
      }
      break;
    case "split":
    case "flip":
    case "adventure":
    case "leveler":
    case "saga":
      for (let i = 0; i < n; i++) {
        if (index.layouts[i] === keyword) buf[cf[i]] = 1;
      }
      break;
    case "transform":
      for (let i = 0; i < n; i++) {
        if (index.layouts[i] === "transform") buf[cf[i]] = 1;
      }
      break;
    case "modal":
    case "mdfc":
      for (let i = 0; i < n; i++) {
        if (index.layouts[i] === "modal_dfc") buf[cf[i]] = 1;
      }
      break;
    case "dfc":
      for (let i = 0; i < n; i++) {
        if (DFC_LAYOUTS.has(index.layouts[i])) buf[cf[i]] = 1;
      }
      break;
    case "meld":
      for (let i = 0; i < n; i++) {
        if (index.layouts[i] === "meld") buf[cf[i]] = 1;
      }
      break;
    case "vanilla":
      for (let i = 0; i < n; i++) {
        if (index.oracleTextsLower[i].length === 0) buf[cf[i]] = 1;
      }
      break;
    case "frenchvanilla":
      for (let i = 0; i < n; i++) {
        if (isFrenchVanilla(index.oracleTextsLower[i], index.typeLinesLower[i])) buf[cf[i]] = 1;
      }
      break;
    case "commander":
    case "brawler":
      for (let i = 0; i < n; i++) {
        const tl = index.typeLinesLower[i];
        const isLegendary = tl.includes("legendary");
        const isCreatureOrPW = tl.includes("creature") || tl.includes("planeswalker");
        const hasCommanderText = index.oracleTextsLower[i].includes("can be your commander");
        if ((isLegendary && isCreatureOrPW) || hasCommanderText) buf[cf[i]] = 1;
      }
      break;
    case "companion":
      for (let i = 0; i < n; i++) {
        if (index.oracleTextsLower[i].includes("companion —")) buf[cf[i]] = 1;
      }
      break;
    case "partner":
      for (let i = 0; i < n; i++) {
        if (PARTNER_RE.test(index.oracleTextsLower[i])) buf[cf[i]] = 1;
      }
      break;
    case "bear":
      for (let i = 0; i < n; i++) {
        const isPow2 = index.numericPowerLookup[index.powers[i]] === 2;
        const isTou2 = index.numericToughnessLookup[index.toughnesses[i]] === 2;
        const isCmc2 = index.manaValue[i] === 2;
        const isCreature = index.typeLinesLower[i].includes("creature");
        if (isPow2 && isTou2 && isCmc2 && isCreature) buf[cf[i]] = 1;
      }
      break;
    case "reserved":
      for (let i = 0; i < n; i++) {
        if ((index.flags[i] & CardFlag.Reserved) !== 0) buf[cf[i]] = 1;
      }
      break;
    case "funny":
      for (let i = 0; i < n; i++) {
        if ((index.flags[i] & CardFlag.Funny) !== 0) buf[cf[i]] = 1;
      }
      break;
    case "universesbeyond":
      for (let i = 0; i < n; i++) {
        if ((index.flags[i] & CardFlag.UniversesBeyond) !== 0) buf[cf[i]] = 1;
      }
      break;
    case "hybrid":
      for (let i = 0; i < n; i++) {
        if (hasHybridSymbol(index.manaCostsLower[i])) buf[cf[i]] = 1;
      }
      break;
    case "phyrexian":
      for (let i = 0; i < n; i++) {
        if (hasPhyrexianSymbol(index.manaCostsLower[i]) || hasPhyrexianSymbol(index.oracleTextsLower[i])) {
          buf[cf[i]] = 1;
        }
      }
      break;
    default: {
      const cycle = LAND_CYCLES[keyword];
      if (cycle) {
        for (let i = 0; i < n; i++) {
          if (cycle.has(index.namesLower[i])) buf[cf[i]] = 1;
        }
        return "ok";
      }
      if (UNSUPPORTED_IS_KEYWORDS.has(keyword)) return "unsupported";
      return "unknown";
    }
  }
  return "ok";
}

export function evalPrintingIsKeyword(
  keyword: string,
  pIdx: PrintingIndex,
  buf: Uint8Array,
  n: number,
): "ok" | "unsupported" | "unknown" {
  switch (keyword) {
    case "foil":
      for (let i = 0; i < n; i++) if (pIdx.finish[i] === Finish.Foil) buf[i] = 1;
      break;
    case "nonfoil":
      for (let i = 0; i < n; i++) if (pIdx.finish[i] === Finish.Nonfoil) buf[i] = 1;
      break;
    case "etched":
      for (let i = 0; i < n; i++) if (pIdx.finish[i] === Finish.Etched) buf[i] = 1;
      break;
    case "full": case "fullart":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.FullArt) buf[i] = 1;
      break;
    case "textless":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.Textless) buf[i] = 1;
      break;
    case "reprint":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.Reprint) buf[i] = 1;
      break;
    case "promo":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.Promo) buf[i] = 1;
      break;
    case "digital":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.Digital) buf[i] = 1;
      break;
    case "hires":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.HighresImage) buf[i] = 1;
      break;
    case "borderless":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.Borderless) buf[i] = 1;
      break;
    case "extended":
      for (let i = 0; i < n; i++) if (pIdx.printingFlags[i] & PrintingFlag.ExtendedArt) buf[i] = 1;
      break;
    default:
      return "unknown";
  }
  return "ok";
}
