// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import { ORACLE_CARDS_PATH, COLUMNS_PATH, ensureIntermediateDir } from "./paths";
import { log } from "./log";
import {
  COLOR_FROM_LETTER,
  CARD_TYPE_NAMES,
  SUPERTYPE_NAMES,
  FORMAT_NAMES,
  type ColumnarData,
} from "@frantic-search/shared";

// ---------------------------------------------------------------------------
// Scryfall card shape (fields we care about)
// ---------------------------------------------------------------------------

interface Card {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  legalities?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Bitmask encoding helpers
// ---------------------------------------------------------------------------

function encodeColors(colors: string[] | undefined): number {
  if (!colors) return 0;
  let mask = 0;
  for (const c of colors) {
    mask |= COLOR_FROM_LETTER[c] ?? 0;
  }
  return mask;
}

function encodeLegalities(legalities: Record<string, string> | undefined): { legal: number; banned: number; restricted: number } {
  let legal = 0, banned = 0, restricted = 0;
  if (!legalities) return { legal, banned, restricted };
  for (const [format, status] of Object.entries(legalities)) {
    const bit = FORMAT_NAMES[format];
    if (bit === undefined) continue;
    if (status === "legal") legal |= bit;
    else if (status === "banned") banned |= bit;
    else if (status === "restricted") restricted |= bit;
  }
  return { legal, banned, restricted };
}

interface ParsedTypeLine {
  types: number;
  supertypes: number;
  subtypes: string;
}

function parseTypeLine(typeLine: string): ParsedTypeLine {
  let types = 0;
  let supertypes = 0;
  const remaining: string[] = [];

  for (const word of typeLine.split(/\s+/)) {
    if (word === "—" || word === "//") {
      remaining.push(word);
      continue;
    }
    const typeBit = CARD_TYPE_NAMES[word];
    if (typeBit !== undefined) {
      types |= typeBit;
      continue;
    }
    const superBit = SUPERTYPE_NAMES[word];
    if (superBit !== undefined) {
      supertypes |= superBit;
      continue;
    }
    remaining.push(word);
  }

  const subtypes = remaining.join(" ").replace(/^\s*—\s*/, "").replace(/\s*—\s*$/, "").trim();

  return { types, supertypes, subtypes };
}

// ---------------------------------------------------------------------------
// Dictionary encoding: map a small set of strings to uint8 indices
// ---------------------------------------------------------------------------

const NONE_SENTINEL = "";

class DictEncoder {
  private table: string[] = [NONE_SENTINEL];
  private index = new Map<string, number>([[NONE_SENTINEL, 0]]);

  encode(value: string | undefined): number {
    const v = value ?? NONE_SENTINEL;
    let idx = this.index.get(v);
    if (idx === undefined) {
      idx = this.table.length;
      if (idx > 255) throw new Error(`Dictionary exceeded 255 entries at "${v}"`);
      this.table.push(v);
      this.index.set(v, idx);
    }
    return idx;
  }

  lookup(): string[] {
    return this.table;
  }
}

// ---------------------------------------------------------------------------
// Columnar output
// ---------------------------------------------------------------------------

export function processCards(verbose: boolean): void {
  log(`Reading ${ORACLE_CARDS_PATH}…`, verbose);
  const raw = fs.readFileSync(ORACLE_CARDS_PATH, "utf-8");
  const cards: Card[] = JSON.parse(raw);

  log(`Processing ${cards.length} cards…`, verbose);

  const powerDict = new DictEncoder();
  const toughnessDict = new DictEncoder();
  const loyaltyDict = new DictEncoder();
  const defenseDict = new DictEncoder();

  const data: ColumnarData = {
    names: [],
    mana_costs: [],
    oracle_texts: [],
    colors: [],
    color_identity: [],
    types: [],
    supertypes: [],
    subtypes: [],
    powers: [],
    toughnesses: [],
    loyalties: [],
    defenses: [],
    legalities_legal: [],
    legalities_banned: [],
    legalities_restricted: [],
    power_lookup: [],
    toughness_lookup: [],
    loyalty_lookup: [],
    defense_lookup: [],
  };

  for (const card of cards) {
    data.names.push(card.name ?? "");
    data.mana_costs.push(card.mana_cost ?? "");
    data.oracle_texts.push(card.oracle_text ?? "");
    data.colors.push(encodeColors(card.colors));
    data.color_identity.push(encodeColors(card.color_identity));

    const parsed = parseTypeLine(card.type_line ?? "");
    data.types.push(parsed.types);
    data.supertypes.push(parsed.supertypes);
    data.subtypes.push(parsed.subtypes);

    data.powers.push(powerDict.encode(card.power));
    data.toughnesses.push(toughnessDict.encode(card.toughness));
    data.loyalties.push(loyaltyDict.encode(card.loyalty));
    data.defenses.push(defenseDict.encode(card.defense));

    const leg = encodeLegalities(card.legalities);
    data.legalities_legal.push(leg.legal);
    data.legalities_banned.push(leg.banned);
    data.legalities_restricted.push(leg.restricted);
  }

  data.power_lookup = powerDict.lookup();
  data.toughness_lookup = toughnessDict.lookup();
  data.loyalty_lookup = loyaltyDict.lookup();
  data.defense_lookup = defenseDict.lookup();

  log(`Lookup table sizes: power=${data.power_lookup.length}, toughness=${data.toughness_lookup.length}, loyalty=${data.loyalty_lookup.length}, defense=${data.defense_lookup.length}`, verbose);

  ensureIntermediateDir();

  fs.writeFileSync(COLUMNS_PATH, JSON.stringify(data) + "\n");
  log(`Wrote ${COLUMNS_PATH}`, true);
}
