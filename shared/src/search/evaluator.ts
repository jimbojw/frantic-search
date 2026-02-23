// SPDX-License-Identifier: Apache-2.0
import {
  type ASTNode,
  type QueryNodeResult,
  type EvalOutput,
  type FieldNode,
  type RegexFieldNode,
  type ExactNameNode,
} from "./ast";
import type { CardIndex } from "./card-index";
import { COLOR_FROM_LETTER, COLOR_NAMES, COLOR_COLORLESS, COLOR_MULTICOLOR, FORMAT_NAMES, CardFlag } from "../bits";
import { parseManaSymbols, manaContains } from "./mana";

const SEP = "\x1E";

const FIELD_ALIASES: Record<string, string> = {
  name: "name", n: "name",
  oracle: "oracle", o: "oracle",
  color: "color", c: "color",
  identity: "identity", id: "identity", ci: "identity", commander: "identity", cmd: "identity",
  type: "type", t: "type",
  power: "power", pow: "power",
  toughness: "toughness", tou: "toughness",
  loyalty: "loyalty", loy: "loyalty",
  defense: "defense", def: "defense",
  cmc: "manavalue", mv: "manavalue", manavalue: "manavalue",
  mana: "mana", m: "mana",
  legal: "legal", f: "legal", format: "legal",
  banned: "banned",
  restricted: "restricted",
  is: "is",
};

function popcount(buf: Uint8Array, len: number): number {
  let count = 0;
  for (let i = 0; i < len; i++) count += buf[i];
  return count;
}

function parseColorValue(value: string): number {
  const named = COLOR_NAMES[value.toLowerCase()];
  if (named !== undefined) return named;
  let mask = 0;
  for (const ch of value.toUpperCase()) {
    mask |= COLOR_FROM_LETTER[ch] ?? 0;
  }
  return mask;
}

function getStringColumn(canonical: string, index: CardIndex): string[] | null {
  switch (canonical) {
    case "name": return index.combinedNamesLower;
    case "oracle": return index.oracleTextsLower;
    case "type": return index.typeLinesLower;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// is: keyword evaluation (Spec 032)
// ---------------------------------------------------------------------------

const PERMANENT_TYPES = ["artifact", "battle", "creature", "enchantment", "land", "planeswalker"];

const DFC_LAYOUTS = new Set(["transform", "modal_dfc", "meld"]);

const PARTY_TYPES = ["cleric", "rogue", "warrior", "wizard"];

// ---------------------------------------------------------------------------
// Curated land cycle name sets (Spec 032)
// ---------------------------------------------------------------------------

const LAND_CYCLES: Record<string, Set<string>> = {
  dual: new Set([
    "badlands", "bayou", "plateau", "savannah", "scrubland",
    "taiga", "tropical island", "tundra", "underground sea", "volcanic island",
  ]),
  shockland: new Set([
    "blood crypt", "breeding pool", "godless shrine", "hallowed fountain",
    "overgrown tomb", "sacred foundry", "steam vents", "stomping ground",
    "temple garden", "watery grave",
  ]),
  fetchland: new Set([
    "arid mesa", "bloodstained mire", "flooded strand", "marsh flats",
    "misty rainforest", "polluted delta", "scalding tarn", "verdant catacombs",
    "windswept heath", "wooded foothills",
  ]),
  checkland: new Set([
    "clifftop retreat", "dragonskull summit", "drowned catacomb", "glacial fortress",
    "hinterland harbor", "isolated chapel", "rootbound crag", "sulfur falls",
    "sunpetal grove", "woodland cemetery",
  ]),
  fastland: new Set([
    "blackcleave cliffs", "blooming marsh", "botanical sanctum", "concealed courtyard",
    "copperline gorge", "darkslick shores", "inspiring vantage", "razorverge thicket",
    "seachrome coast", "spirebluff canal",
  ]),
  painland: new Set([
    "adarkar wastes", "battlefield forge", "brushland", "caves of koilos",
    "karplusan forest", "llanowar wastes", "shivan reef", "sulfurous springs",
    "underground river", "yavimaya coast",
  ]),
  slowland: new Set([
    "deathcap glade", "deserted beach", "dreamroot cascade", "haunted ridge",
    "overgrown farmland", "rockfall vale", "shattered sanctum", "shipwreck marsh",
    "stormcarved coast", "sundown pass",
  ]),
  bounceland: new Set([
    "arid archway", "azorius chancery", "boros garrison", "coral atoll",
    "dimir aqueduct", "dormant volcano", "everglades", "golgari rot farm",
    "gruul turf", "guildless commons", "izzet boilerworks", "jungle basin",
    "karoo", "orzhov basilica", "rakdos carnarium", "selesnya sanctuary",
    "simic growth chamber",
  ]),
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

function evalIsKeyword(
  keyword: string,
  index: CardIndex,
  buf: Uint8Array,
  n: number,
): void {
  switch (keyword) {
    case "permanent":
      for (let i = 0; i < n; i++) {
        buf[i] = PERMANENT_TYPES.some(t => index.typeLinesLower[i].includes(t)) ? 1 : 0;
      }
      break;
    case "spell":
      for (let i = 0; i < n; i++) {
        buf[i] = !index.typeLinesLower[i].includes("land") ? 1 : 0;
      }
      break;
    case "historic":
      for (let i = 0; i < n; i++) {
        const tl = index.typeLinesLower[i];
        buf[i] = (tl.includes("artifact") || tl.includes("legendary") || tl.includes("saga")) ? 1 : 0;
      }
      break;
    case "party":
      for (let i = 0; i < n; i++) {
        buf[i] = PARTY_TYPES.some(t => index.typeLinesLower[i].includes(t)) ? 1 : 0;
      }
      break;
    case "outlaw":
      for (let i = 0; i < n; i++) {
        buf[i] = OUTLAW_TYPES.some(t => index.typeLinesLower[i].includes(t)) ? 1 : 0;
      }
      break;
    case "split":
    case "flip":
    case "adventure":
    case "leveler":
    case "saga":
      for (let i = 0; i < n; i++) {
        buf[i] = index.layouts[i] === keyword ? 1 : 0;
      }
      break;
    case "transform":
      for (let i = 0; i < n; i++) {
        buf[i] = index.layouts[i] === "transform" ? 1 : 0;
      }
      break;
    case "modal":
    case "mdfc":
      for (let i = 0; i < n; i++) {
        buf[i] = index.layouts[i] === "modal_dfc" ? 1 : 0;
      }
      break;
    case "dfc":
      for (let i = 0; i < n; i++) {
        buf[i] = DFC_LAYOUTS.has(index.layouts[i]) ? 1 : 0;
      }
      break;
    case "meld":
      for (let i = 0; i < n; i++) {
        buf[i] = index.layouts[i] === "meld" ? 1 : 0;
      }
      break;
    case "vanilla":
      for (let i = 0; i < n; i++) {
        buf[i] = index.oracleTextsLower[i].length === 0 ? 1 : 0;
      }
      break;
    case "frenchvanilla":
      for (let i = 0; i < n; i++) {
        buf[i] = isFrenchVanilla(index.oracleTextsLower[i], index.typeLinesLower[i]) ? 1 : 0;
      }
      break;
    case "commander":
    case "brawler":
      for (let i = 0; i < n; i++) {
        const tl = index.typeLinesLower[i];
        const isLegendary = tl.includes("legendary");
        const isCreatureOrPW = tl.includes("creature") || tl.includes("planeswalker");
        const hasCommanderText = index.oracleTextsLower[i].includes("can be your commander");
        buf[i] = (isLegendary && isCreatureOrPW) || hasCommanderText ? 1 : 0;
      }
      break;
    case "companion":
      for (let i = 0; i < n; i++) {
        buf[i] = index.oracleTextsLower[i].includes("companion —") ? 1 : 0;
      }
      break;
    case "partner":
      for (let i = 0; i < n; i++) {
        buf[i] = PARTNER_RE.test(index.oracleTextsLower[i]) ? 1 : 0;
      }
      break;
    case "bear":
      for (let i = 0; i < n; i++) {
        const isPow2 = Number(index.powerLookup[index.powers[i]]) === 2;
        const isTou2 = Number(index.toughnessLookup[index.toughnesses[i]]) === 2;
        const isCmc2 = index.manaValue[i] === 2;
        const isCreature = index.typeLinesLower[i].includes("creature");
        buf[i] = (isPow2 && isTou2 && isCmc2 && isCreature) ? 1 : 0;
      }
      break;
    case "reserved":
      for (let i = 0; i < n; i++) {
        buf[i] = (index.flags[i] & CardFlag.Reserved) !== 0 ? 1 : 0;
      }
      break;
    case "funny":
      for (let i = 0; i < n; i++) {
        buf[i] = (index.flags[i] & CardFlag.Funny) !== 0 ? 1 : 0;
      }
      break;
    case "universesbeyond":
      for (let i = 0; i < n; i++) {
        buf[i] = (index.flags[i] & CardFlag.UniversesBeyond) !== 0 ? 1 : 0;
      }
      break;
    default: {
      const cycle = LAND_CYCLES[keyword];
      if (cycle) {
        for (let i = 0; i < n; i++) {
          buf[i] = cycle.has(index.namesLower[i]) ? 1 : 0;
        }
      } else {
        buf.fill(0, 0, n);
      }
    }
  }
}

function evalLeafField(
  node: FieldNode,
  index: CardIndex,
  buf: Uint8Array,
): void {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  const n = index.faceCount;
  const op = node.operator;
  const val = node.value;

  if (val === "") {
    buf.fill(1, 0, n);
    return;
  }
  if (!canonical) {
    buf.fill(0, 0, n);
    return;
  }

  const valLower = val.toLowerCase();

  switch (canonical) {
    case "name":
    case "type": {
      const col = getStringColumn(canonical, index)!;
      for (let i = 0; i < n; i++) {
        buf[i] = col[i].includes(valLower) ? 1 : 0;
      }
      break;
    }
    case "oracle": {
      const col = valLower.includes("~")
        ? index.oracleTextsTildeLower
        : index.oracleTextsLower;
      for (let i = 0; i < n; i++) {
        buf[i] = col[i].includes(valLower) ? 1 : 0;
      }
      break;
    }
    case "color":
    case "identity": {
      const col = canonical === "color" ? index.colors : index.colorIdentity;
      const queryMask = parseColorValue(val);

      if (queryMask === COLOR_COLORLESS) {
        for (let i = 0; i < n; i++) buf[i] = col[i] === 0 ? 1 : 0;
        break;
      }
      if (queryMask === COLOR_MULTICOLOR) {
        for (let i = 0; i < n; i++) {
          let v = col[i]; v = (v & 0x55) + ((v >> 1) & 0x55);
          v = (v & 0x33) + ((v >> 2) & 0x33); v = (v + (v >> 4)) & 0x0f;
          buf[i] = v >= 2 ? 1 : 0;
        }
        break;
      }

      // color: colon means superset (≥): "has at least these colors"
      // identity: colon means subset (≤): "fits in a deck of these colors"
      const colonOp = canonical === "identity" ? "<=" : ">=";
      const effectiveOp = op === ":" ? colonOp : op;
      switch (effectiveOp) {
        case ">=":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & queryMask) === queryMask ? 1 : 0;
          break;
        case "=":
          for (let i = 0; i < n; i++) buf[i] = col[i] === queryMask ? 1 : 0;
          break;
        case "<=":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & ~queryMask) === 0 ? 1 : 0;
          break;
        case "!=":
          for (let i = 0; i < n; i++) buf[i] = col[i] !== queryMask ? 1 : 0;
          break;
        case ">":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & queryMask) === queryMask && col[i] !== queryMask ? 1 : 0;
          break;
        case "<":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & ~queryMask) === 0 && col[i] !== queryMask ? 1 : 0;
          break;
        default:
          buf.fill(0, 0, n);
      }
      break;
    }
    case "power":
    case "toughness":
    case "loyalty":
    case "defense": {
      const lookup = canonical === "power" ? index.powerLookup
        : canonical === "toughness" ? index.toughnessLookup
        : canonical === "loyalty" ? index.loyaltyLookup
        : index.defenseLookup;
      const indices = canonical === "power" ? index.powers
        : canonical === "toughness" ? index.toughnesses
        : canonical === "loyalty" ? index.loyalties
        : index.defenses;
      const queryNum = Number(val);
      if (isNaN(queryNum)) {
        buf.fill(0, 0, n);
        break;
      }
      for (let i = 0; i < n; i++) {
        const raw = lookup[indices[i]];
        if (!raw) { buf[i] = 0; continue; }
        const cardNum = Number(raw);
        if (isNaN(cardNum)) { buf[i] = 0; continue; }
        switch (op) {
          case ":": case "=": buf[i] = cardNum === queryNum ? 1 : 0; break;
          case "!=": buf[i] = cardNum !== queryNum ? 1 : 0; break;
          case ">":  buf[i] = cardNum > queryNum ? 1 : 0; break;
          case "<":  buf[i] = cardNum < queryNum ? 1 : 0; break;
          case ">=": buf[i] = cardNum >= queryNum ? 1 : 0; break;
          case "<=": buf[i] = cardNum <= queryNum ? 1 : 0; break;
          default: buf[i] = 0;
        }
      }
      break;
    }
    case "manavalue": {
      const queryNum = Number(val);
      if (isNaN(queryNum)) {
        buf.fill(0, 0, n);
        break;
      }
      const cmcCol = index.manaValue;
      for (let i = 0; i < n; i++) {
        switch (op) {
          case ":": case "=": buf[i] = cmcCol[i] === queryNum ? 1 : 0; break;
          case "!=": buf[i] = cmcCol[i] !== queryNum ? 1 : 0; break;
          case ">":  buf[i] = cmcCol[i] > queryNum ? 1 : 0; break;
          case "<":  buf[i] = cmcCol[i] < queryNum ? 1 : 0; break;
          case ">=": buf[i] = cmcCol[i] >= queryNum ? 1 : 0; break;
          case "<=": buf[i] = cmcCol[i] <= queryNum ? 1 : 0; break;
          default: buf[i] = 0;
        }
      }
      break;
    }
    case "mana": {
      const querySymbols = parseManaSymbols(valLower);
      for (let i = 0; i < n; i++) {
        buf[i] = manaContains(index.manaSymbols[i], querySymbols) ? 1 : 0;
      }
      break;
    }
    case "legal":
    case "banned":
    case "restricted": {
      const formatBit = FORMAT_NAMES[valLower];
      if (formatBit === undefined) {
        buf.fill(0, 0, n);
        break;
      }
      const col = canonical === "legal" ? index.legalitiesLegal
        : canonical === "banned" ? index.legalitiesBanned
        : index.legalitiesRestricted;
      for (let i = 0; i < n; i++) {
        buf[i] = (col[i] & formatBit) !== 0 ? 1 : 0;
      }
      break;
    }
    case "is": {
      if (op !== ":" && op !== "=") {
        buf.fill(0, 0, n);
        break;
      }
      evalIsKeyword(valLower, index, buf, n);
      break;
    }
    default:
      buf.fill(0, 0, n);
  }
}

function evalLeafRegex(
  node: RegexFieldNode,
  index: CardIndex,
  buf: Uint8Array,
): void {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  const n = index.faceCount;

  let col: string[] | null;
  if (canonical === "oracle" && node.pattern.includes("~")) {
    col = index.oracleTextsTildeLower;
  } else {
    col = canonical ? getStringColumn(canonical, index) : null;
  }

  if (!col) {
    buf.fill(0, 0, n);
    return;
  }

  let re: RegExp;
  try {
    re = new RegExp(node.pattern, "i");
  } catch {
    buf.fill(0, 0, n);
    return;
  }

  for (let i = 0; i < n; i++) {
    buf[i] = re.test(col[i]) ? 1 : 0;
  }
}

function evalLeafBareWord(value: string, quoted: boolean, index: CardIndex, buf: Uint8Array): void {
  if (quoted) {
    const valLower = value.toLowerCase();
    for (let i = 0; i < index.faceCount; i++) {
      buf[i] = index.combinedNamesLower[i].includes(valLower) ? 1 : 0;
    }
  } else {
    const valNormalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (let i = 0; i < index.faceCount; i++) {
      buf[i] = index.combinedNamesNormalized[i].includes(valNormalized) ? 1 : 0;
    }
  }
}

function evalLeafExact(node: ExactNameNode, index: CardIndex, buf: Uint8Array): void {
  const valLower = node.value.toLowerCase();
  for (let i = 0; i < index.faceCount; i++) {
    buf[i] = (index.combinedNamesLower[i] === valLower || index.namesLower[i] === valLower) ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// Node interning and evaluation cache
// ---------------------------------------------------------------------------

interface EvalTiming {
  cached: boolean;
  evalMs: number;
}

export interface InternedNode {
  key: string;
  ast: ASTNode;
  computed?: ComputedResult;
}

export interface ComputedResult {
  buf: Uint8Array;
  matchCount: number;
  productionMs: number;
}

export function nodeKey(ast: ASTNode): string {
  switch (ast.type) {
    case "FIELD":
      return `FIELD${SEP}${ast.field}${SEP}${ast.operator}${SEP}${ast.value}`;
    case "BARE":
      return `BARE${SEP}${ast.quoted ? "Q" : "U"}${SEP}${ast.value}`;
    case "EXACT":
      return `EXACT${SEP}${ast.value}`;
    case "REGEX_FIELD":
      return `REGEX_FIELD${SEP}${ast.field}${SEP}${ast.operator}${SEP}${ast.pattern}`;
    case "NOT":
      return `NOT${SEP}${nodeKey(ast.child)}`;
    case "AND":
      return `AND${SEP}${ast.children.map(nodeKey).join(SEP)}`;
    case "OR":
      return `OR${SEP}${ast.children.map(nodeKey).join(SEP)}`;
  }
}

export class NodeCache {
  private nodes: Map<string, InternedNode> = new Map();
  readonly index: CardIndex;

  constructor(index: CardIndex) {
    this.index = index;
  }

  intern(ast: ASTNode): InternedNode {
    const key = nodeKey(ast);
    let interned = this.nodes.get(key);
    if (!interned) {
      interned = { key, ast };
      this.nodes.set(key, interned);
    }
    return interned;
  }

  evaluate(ast: ASTNode): EvalOutput {
    const timings = new Map<string, EvalTiming>();
    const root = this.internTree(ast);
    this.computeTree(root, timings);
    const result = this.buildResult(root, timings);
    const matchingIndices: number[] = [];
    const buf = root.computed!.buf;
    for (let i = 0; i < this.index.faceCount; i++) {
      if (buf[i]) matchingIndices.push(i);
    }
    return { result, matchingIndices };
  }

  private internTree(ast: ASTNode): InternedNode {
    switch (ast.type) {
      case "AND":
        for (const child of ast.children) this.internTree(child);
        break;
      case "OR":
        for (const child of ast.children) this.internTree(child);
        break;
      case "NOT":
        this.internTree(ast.child);
        break;
    }
    return this.intern(ast);
  }

  private markCached(interned: InternedNode, timings: Map<string, EvalTiming>): void {
    timings.set(interned.key, { cached: true, evalMs: 0 });
    const ast = interned.ast;
    switch (ast.type) {
      case "NOT":
        this.markCached(this.intern(ast.child), timings);
        break;
      case "AND":
      case "OR":
        for (const child of ast.children) {
          this.markCached(this.intern(child), timings);
        }
        break;
    }
  }

  private computeTree(interned: InternedNode, timings: Map<string, EvalTiming>): void {
    if (interned.computed) {
      this.markCached(interned, timings);
      return;
    }

    const ast = interned.ast;
    const n = this.index.faceCount;

    switch (ast.type) {
      case "FIELD": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafField(ast, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "BARE": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafBareWord(ast.value, ast.quoted, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "EXACT": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafExact(ast, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "REGEX_FIELD": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafRegex(ast, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "NOT": {
        const childInterned = this.intern(ast.child);
        this.computeTree(childInterned, timings);
        const childBuf = childInterned.computed!.buf;
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) buf[i] = childBuf[i] ^ 1;
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "AND": {
        if (ast.children.length === 0) {
          const buf = new Uint8Array(n);
          buf.fill(1, 0, n);
          interned.computed = { buf, matchCount: n, productionMs: 0 };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }
        const childInterneds = ast.children.map(c => {
          const ci = this.intern(c);
          this.computeTree(ci, timings);
          return ci;
        });
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        const first = childInterneds[0].computed!.buf;
        for (let i = 0; i < n; i++) buf[i] = first[i];
        for (let c = 1; c < childInterneds.length; c++) {
          const cb = childInterneds[c].computed!.buf;
          for (let i = 0; i < n; i++) buf[i] &= cb[i];
        }
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "OR": {
        const childInterneds = ast.children.map(c => {
          const ci = this.intern(c);
          this.computeTree(ci, timings);
          return ci;
        });
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        for (const ci of childInterneds) {
          const cb = ci.computed!.buf;
          for (let i = 0; i < n; i++) buf[i] |= cb[i];
        }
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
    }
  }

  private buildResult(interned: InternedNode, timings: Map<string, EvalTiming>): QueryNodeResult {
    const ast = interned.ast;
    const computed = interned.computed!;
    const timing = timings.get(interned.key)!;

    const result: QueryNodeResult = {
      node: ast,
      matchCount: computed.matchCount,
      cached: timing.cached,
      productionMs: computed.productionMs,
      evalMs: timing.evalMs,
    };

    switch (ast.type) {
      case "NOT":
        result.children = [this.buildResult(this.intern(ast.child), timings)];
        break;
      case "AND":
      case "OR":
        if (ast.children.length > 0) {
          result.children = ast.children.map(c => this.buildResult(this.intern(c), timings));
        }
        break;
    }

    return result;
  }
}
