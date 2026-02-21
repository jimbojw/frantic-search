// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import { ORACLE_CARDS_PATH, COLUMNS_PATH, ensureDistDir } from "./paths";
import { log } from "./log";
import {
  COLOR_FROM_LETTER,
  FORMAT_NAMES,
  type ColumnarData,
} from "@frantic-search/shared";

// ---------------------------------------------------------------------------
// Scryfall card shape (fields we care about)
// ---------------------------------------------------------------------------

interface CardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
}

interface Card {
  id?: string;
  layout?: string;
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
  card_faces?: CardFace[];
}

const FILTERED_LAYOUTS = new Set([
  "art_series",
  "token",
  "double_faced_token",
  "emblem",
  "planar",
  "scheme",
  "vanguard",
  "augment",
  "host",
]);

const MULTI_FACE_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "adventure",
  "split",
  "flip",
]);

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

function pushFaceRow(
  data: ColumnarData,
  face: CardFace,
  card: Card,
  cardIdx: number,
  canonicalFace: number,
  leg: { legal: number; banned: number; restricted: number },
  powerDict: DictEncoder,
  toughnessDict: DictEncoder,
  loyaltyDict: DictEncoder,
  defenseDict: DictEncoder,
): void {
  data.names.push(face.name ?? "");
  data.mana_costs.push(face.mana_cost ?? "");
  data.oracle_texts.push(face.oracle_text ?? "");
  data.colors.push(encodeColors(face.colors ?? card.colors));
  data.color_identity.push(encodeColors(card.color_identity));
  data.type_lines.push(face.type_line ?? "");

  data.powers.push(powerDict.encode(face.power));
  data.toughnesses.push(toughnessDict.encode(face.toughness));
  data.loyalties.push(loyaltyDict.encode(face.loyalty));
  data.defenses.push(defenseDict.encode(face.defense));

  data.legalities_legal.push(leg.legal);
  data.legalities_banned.push(leg.banned);
  data.legalities_restricted.push(leg.restricted);

  data.card_index.push(cardIdx);
  data.canonical_face.push(canonicalFace);
  data.scryfall_ids.push(card.id ?? "");
}

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
    type_lines: [],
    powers: [],
    toughnesses: [],
    loyalties: [],
    defenses: [],
    legalities_legal: [],
    legalities_banned: [],
    legalities_restricted: [],
    card_index: [],
    canonical_face: [],
    scryfall_ids: [],
    power_lookup: [],
    toughness_lookup: [],
    loyalty_lookup: [],
    defense_lookup: [],
  };

  let filtered = 0;

  for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
    const card = cards[cardIdx];
    const layout = card.layout ?? "normal";

    if (FILTERED_LAYOUTS.has(layout)) {
      filtered++;
      continue;
    }

    const leg = encodeLegalities(card.legalities);
    const faceRowStart = data.names.length;

    if (MULTI_FACE_LAYOUTS.has(layout) && card.card_faces && card.card_faces.length > 0) {
      for (const face of card.card_faces) {
        pushFaceRow(data, face, card, cardIdx, faceRowStart, leg,
          powerDict, toughnessDict, loyaltyDict, defenseDict);
      }
    } else {
      pushFaceRow(data, card, card, cardIdx, faceRowStart, leg,
        powerDict, toughnessDict, loyaltyDict, defenseDict);
    }
  }

  data.power_lookup = powerDict.lookup();
  data.toughness_lookup = toughnessDict.lookup();
  data.loyalty_lookup = loyaltyDict.lookup();
  data.defense_lookup = defenseDict.lookup();

  log(`Filtered ${filtered} non-searchable cards, emitted ${data.names.length} face rows`, verbose);
  log(`Lookup table sizes: power=${data.power_lookup.length}, toughness=${data.toughness_lookup.length}, loyalty=${data.loyalty_lookup.length}, defense=${data.defense_lookup.length}`, verbose);

  ensureDistDir();

  fs.writeFileSync(COLUMNS_PATH, JSON.stringify(data) + "\n");
  log(`Wrote ${COLUMNS_PATH}`, true);
}
